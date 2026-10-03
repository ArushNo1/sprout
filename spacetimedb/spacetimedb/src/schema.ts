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
});

export default spacetimedb;
