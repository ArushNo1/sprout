import { schema, table, t } from 'spacetimedb/server';

// Learners are keyed by the sender address ASI:One passes to the orchestrator
// agent (`user_address`). Everything Sprout knows hangs off that string.
//
// Tables are public so every agent (and the garden view) can read with any
// token; all writes go through reducers that check the caller is a registered
// Sprout agent (see `requireAgent` in index.ts).

// ── Access control (private) ─────────────────────────────────────────────────

const config = table(
  { name: 'config' },
  { id: t.u8().primaryKey(), owner: t.identity() }
);

const agent = table(
  { name: 'agent' },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    registeredAt: t.timestamp(),
  }
);

// ── Learner data ─────────────────────────────────────────────────────────────

const learner = table(
  { name: 'learner', public: true },
  {
    address: t.string().primaryKey(),
    displayName: t.option(t.string()),
    preferredFormat: t.option(t.string()),
    createdAt: t.timestamp(),
    lastActiveAt: t.timestamp(),
  }
);

const course = table(
  { name: 'course', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    userAddress: t.string().index('btree'),
    name: t.string(),
    currentUnit: t.option(t.string()),
    examDate: t.option(t.timestamp()),
    rawSyllabus: t.string(),
    // 'draft' (concepts extracted, awaiting confirmation) | 'active'
    status: t.string(),
    createdAt: t.timestamp(),
  }
);

// ── Knowledge map ────────────────────────────────────────────────────────────

const concept = table(
  { name: 'concept', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    courseId: t.u64().index('btree'),
    name: t.string(),
    summary: t.string(),
    embedding: t.array(t.f32()),
    // Per-concept BKT parameters.
    pInit: t.f64(),
    pLearn: t.f64(),
    pSlip: t.f64(),
    pGuess: t.f64(),
  }
);

// `conceptId` requires `requiresId` to be understood first.
const prerequisite = table(
  { name: 'prerequisite', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    courseId: t.u64().index('btree'),
    conceptId: t.u64().index('btree'),
    requiresId: t.u64().index('btree'),
    confidence: t.f64(),
  }
);

// ── Learning state ───────────────────────────────────────────────────────────

// One row per (user, concept); `key` is `${userAddress}:${conceptId}`.
const mastery = table(
  { name: 'mastery', public: true },
  {
    key: t.string().primaryKey(),
    userAddress: t.string().index('btree'),
    courseId: t.u64().index('btree'),
    conceptId: t.u64(),
    pMastered: t.f64(),
    attempts: t.u32(),
    correct: t.u32(),
    lastSeen: t.option(t.timestamp()),
    nextReview: t.option(t.timestamp()),
    // SM-2 state
    ease: t.f64(),
    intervalDays: t.f64(),
    repetitions: t.u32(),
  }
);

const attempt = table(
  { name: 'attempt', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    userAddress: t.string().index('btree'),
    courseId: t.u64().index('btree'),
    conceptId: t.u64().index('btree'),
    sessionId: t.option(t.u64()),
    // 'diagnostic' | 'check' | 'practice' | 'review'
    kind: t.string(),
    // Teaching format in effect, if any (feeds the bandit).
    format: t.option(t.string()),
    question: t.option(t.string()),
    correct: t.bool(),
    pBefore: t.f64(),
    pAfter: t.f64(),
    createdAt: t.timestamp(),
  }
);

// Beta(alpha, beta) per (user, format); `key` is `${userAddress}:${format}`.
const formatWeight = table(
  { name: 'format_weight', public: true },
  {
    key: t.string().primaryKey(),
    userAddress: t.string().index('btree'),
    format: t.string(),
    alpha: t.f64(),
    beta: t.f64(),
    uses: t.u32(),
  }
);

const session = table(
  { name: 'session', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    userAddress: t.string().index('btree'),
    courseId: t.option(t.u64()),
    startedAt: t.timestamp(),
    endedAt: t.option(t.timestamp()),
    // Short recap used to open the next chat.
    summary: t.string(),
    lastConceptId: t.option(t.u64()),
  }
);

// Output of `compute_next_step`; one row per (user, course), `key` is `${userAddress}:${courseId}`.
const nextStep = table(
  { name: 'next_step', public: true },
  {
    key: t.string().primaryKey(),
    userAddress: t.string().index('btree'),
    courseId: t.u64(),
    // None when the course is fully mastered.
    conceptId: t.option(t.u64()),
    format: t.string(),
    // 'teach' | 'review' | 'diagnostic' | 'complete'
    mode: t.string(),
    reason: t.string(),
    computedAt: t.timestamp(),
  }
);

// Generated interactive content (quiz, flashcards, worked example, ...).
const studyCard = table(
  { name: 'study_card', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    userAddress: t.string().index('btree'),
    courseId: t.u64().index('btree'),
    conceptId: t.option(t.u64()),
    // 'quiz' | 'flashcards' | 'worked_example' | 'snapshot' | 'review_reminder'
    kind: t.string(),
    payloadJson: t.string(),
    // 'new' | 'shown' | 'answered'
    status: t.string(),
    createdAt: t.timestamp(),
  }
);

// ── Live games (Kahoot-style; see docs/games-plan.md) ───────────────────────

// One live room. Players join with `code`; the host screen proves itself with
// the private host key the agent put in its link.
const game = table(
  { name: 'game', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    hostAddress: t.string().index('btree'),
    courseId: t.u64(),
    title: t.string(),
    // 'live': everyone answers the same question together, Kahoot-style.
    // 'arcade': each player runs an arcade game at their own pace; the board is shared.
    mode: t.string(),
    // Arcade game to load ('runner' | 'meteor'); empty for live games.
    template: t.string(),
    // live: 'lobby' | 'question' | 'reveal' | 'finished'; arcade: 'arcade' | 'finished'
    status: t.string(),
    questionIndex: t.u32(),
    questionCount: t.u32(),
    secondsPerQuestion: t.u32(),
    questionStartedAt: t.option(t.timestamp()),
    hostIdentity: t.option(t.identity()),
    createdAt: t.timestamp(),
    finishedAt: t.option(t.timestamp()),
  }
);

// What players see. In live games `correctIndex`, `explanation` and
// `choiceCounts` stay empty until the question is revealed. Arcade games need
// the answer on the client to react in-game, so they're filled from the start.
const gameQuestion = table(
  { name: 'game_question', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    gameId: t.u64().index('btree'),
    index: t.u32(),
    conceptId: t.u64(),
    prompt: t.string(),
    choices: t.array(t.string()),
    correctIndex: t.option(t.u32()),
    explanation: t.option(t.string()),
    choiceCounts: t.array(t.u32()),
  }
);

// Private: the answer key and the host link key.
const gameSecret = table(
  { name: 'game_secret' },
  {
    gameId: t.u64().primaryKey(),
    hostKey: t.string(),
    answers: t.array(t.u32()),
    explanations: t.array(t.string()),
  }
);

// A player's current arcade run. The board shows their best run, and each replay
// starts a new one, so scoring a run needs somewhere to keep its running total.
const arcadeRun = table(
  { name: 'arcade_run' },
  {
    playerId: t.u64().primaryKey(),
    score: t.u32(),
    streak: t.u32(),
    answered: t.array(t.u32()),
  }
);

const player = table(
  { name: 'player', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    gameId: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    name: t.string(),
    score: t.u32(),
    streak: t.u32(),
    correctCount: t.u32(),
    // Set only for the course owner joining through the host link, whose
    // answers then update their Sprout mastery.
    learnerAddress: t.option(t.string()),
    joinedAt: t.timestamp(),
  }
);

// One row per answer. `correct` and `points` are filled at the reveal, so the
// table never gives the answer away early.
const playerAnswer = table(
  { name: 'player_answer', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    gameId: t.u64().index('btree'),
    playerId: t.u64().index('btree'),
    questionIndex: t.u32(),
    answeredMs: t.u32(),
    correct: t.option(t.bool()),
    points: t.u32(),
  }
);

// Private: the option each player picked, until the reveal publishes counts.
const gameChoice = table(
  { name: 'game_choice' },
  {
    answerId: t.u64().primaryKey(),
    choice: t.u32(),
  }
);

// Ends a question when its time runs out (see the `end_question` reducer).
export const gameTimer = table(
  { name: 'game_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    gameId: t.u64(),
    questionIndex: t.u32(),
  }
);

const spacetimedb = schema({
  config,
  agent,
  learner,
  course,
  concept,
  prerequisite,
  mastery,
  attempt,
  formatWeight,
  session,
  nextStep,
  studyCard,
  game,
  gameQuestion,
  gameSecret,
  arcadeRun,
  player,
  playerAnswer,
  gameChoice,
  gameTimer,
});

export default spacetimedb;
