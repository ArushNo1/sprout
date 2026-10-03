// Sprout backend: the shared database behind the orchestrator and specialist
// agents. Agents call reducers over HTTP (see ../../API.md) and read state by
// SQL query or subscription. Reducers never return data; results of
// processing (e.g. `compute_next_step`) are written to tables.
import {
  SenderError,
  t,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import spacetimedb from './schema';
import {
  BKT_DEFAULTS,
  FORMATS,
  SM2_INITIAL,
  bktUpdate,
  pickNextConcept,
  sm2Update,
  thompsonPick,
  wouldCreateCycle,
  type Edge,
} from './algorithms';

export { default } from './schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ── Constants & small helpers ────────────────────────────────────────────────

const DAY = 86_400_000_000n; // microseconds
const HOUR = DAY / 24n;
const ATTEMPT_KINDS = ['diagnostic', 'check', 'practice', 'review'];
// Only attempts made after teaching in a specific format say anything about it.
const BANDIT_KINDS = ['check', 'practice', 'review'];
const PRODUCTS = ['exam_pack', 'semester'];
const CARD_KINDS = [
  'quiz',
  'flashcards',
  'worked_example',
  'snapshot',
  'review_reminder',
];
const CARD_STATUSES = ['new', 'shown', 'answered'];
const MODES = ['teach', 'review', 'diagnostic'];

const addMicros = (ts: Timestamp, micros: bigint) =>
  new Timestamp(ts.microsSinceUnixEpoch + micros);
const addDays = (ts: Timestamp, days: number) =>
  addMicros(ts, BigInt(Math.round(days * Number(DAY))));

const masteryKey = (address: string, conceptId: bigint) =>
  `${address}:${conceptId}`;

function oneOf(value: string, allowed: readonly string[], what: string) {
  if (!allowed.includes(value))
    throw new SenderError(`Invalid ${what} '${value}'; expected one of ${allowed.join(', ')}`);
}

function isOwner(ctx: Ctx) {
  const cfg = ctx.db.config.id.find(0);
  return !!cfg && cfg.owner.isEqual(ctx.sender);
}

// Every learner-data write is made by one of our agents, never by end users:
// the user is identified by an address *argument* from ASI:One, so we only
// accept that argument from callers we trust.
function requireAgent(ctx: Ctx) {
  if (isOwner(ctx) || ctx.db.agent.identity.find(ctx.sender)) return;
  throw new SenderError('Unauthorized: caller is not a registered Sprout agent');
}

function requireLearner(ctx: Ctx, address: string) {
  const learner = ctx.db.learner.address.find(address);
  if (!learner) throw new SenderError(`Unknown learner '${address}'`);
  ctx.db.learner.address.update({ ...learner, lastActiveAt: ctx.timestamp });
  return learner;
}

function requireCourse(ctx: Ctx, courseId: bigint, address: string) {
  const course = ctx.db.course.id.find(courseId);
  if (!course || course.userAddress !== address)
    throw new SenderError(`Course ${courseId} not found for this learner`);
  return course;
}

function requireConcept(ctx: Ctx, conceptId: bigint) {
  const concept = ctx.db.concept.id.find(conceptId);
  if (!concept) throw new SenderError(`Concept ${conceptId} not found`);
  return concept;
}

const courseConcepts = (ctx: Ctx, courseId: bigint) => [
  ...ctx.db.concept.courseId.filter(courseId),
];
const courseEdges = (ctx: Ctx, courseId: bigint) => [
  ...ctx.db.prerequisite.courseId.filter(courseId),
];

function ensureMastery(
  ctx: Ctx,
  address: string,
  courseId: bigint,
  concept: { id: bigint; pInit: number }
) {
  const key = masteryKey(address, concept.id);
  const existing = ctx.db.mastery.key.find(key);
  if (existing) return existing;
  return ctx.db.mastery.insert({
    key,
    userAddress: address,
    courseId,
    conceptId: concept.id,
    pMastered: concept.pInit,
    attempts: 0,
    correct: 0,
    lastSeen: undefined,
    nextReview: undefined,
    ease: SM2_INITIAL.ease,
    intervalDays: SM2_INITIAL.intervalDays,
    repetitions: SM2_INITIAL.repetitions,
  });
}

function ensureFormatWeights(ctx: Ctx, address: string) {
  for (const format of FORMATS) {
    const key = `${address}:${format}`;
    if (!ctx.db.formatWeight.key.find(key))
      ctx.db.formatWeight.insert({
        key,
        userAddress: address,
        format,
        alpha: 1,
        beta: 1,
        uses: 0,
      });
  }
  return [...ctx.db.formatWeight.userAddress.filter(address)];
}

function chooseFormat(ctx: Ctx, address: string): string {
  return thompsonPick(ensureFormatWeights(ctx, address), () => ctx.random());
}

// Deletes everything tied to a course ("forget this course"). Billing records
// (payment_request, entitlement) are kept.
function deleteCourseData(ctx: Ctx, courseId: bigint) {
  for (const r of [...ctx.db.attempt.courseId.filter(courseId)])
    ctx.db.attempt.id.delete(r.id);
  for (const r of [...ctx.db.studyCard.courseId.filter(courseId)])
    ctx.db.studyCard.id.delete(r.id);
  for (const r of [...ctx.db.mastery.courseId.filter(courseId)])
    ctx.db.mastery.key.delete(r.key);
  for (const r of [...ctx.db.prerequisite.courseId.filter(courseId)])
    ctx.db.prerequisite.id.delete(r.id);
  for (const r of [...ctx.db.concept.courseId.filter(courseId)])
    ctx.db.concept.id.delete(r.id);
  for (const r of [...ctx.db.nextStep.iter()])
    if (r.courseId === courseId) ctx.db.nextStep.key.delete(r.key);
  for (const r of [...ctx.db.session.iter()])
    if (r.courseId === courseId) ctx.db.session.id.delete(r.id);
  ctx.db.course.id.delete(courseId);
}

// ── Lifecycle & access control ───────────────────────────────────────────────

// The publisher becomes the owner; the owner may register more agents.
export const init = spacetimedb.init(ctx => {
  ctx.db.config.insert({ id: 0, owner: ctx.sender });
});

export const register_agent = spacetimedb.reducer(
  { identity: t.identity(), name: t.string() },
  (ctx, { identity, name }) => {
    if (!isOwner(ctx)) throw new SenderError('Only the database owner can register agents');
    const row = { identity, name, registeredAt: ctx.timestamp };
    if (ctx.db.agent.identity.find(identity)) ctx.db.agent.identity.update(row);
    else ctx.db.agent.insert(row);
  }
);

export const remove_agent = spacetimedb.reducer(
  { identity: t.identity() },
  (ctx, { identity }) => {
    if (!isOwner(ctx)) throw new SenderError('Only the database owner can remove agents');
    ctx.db.agent.identity.delete(identity);
  }
);

// ── Learners ─────────────────────────────────────────────────────────────────

export const upsert_learner = spacetimedb.reducer(
  { address: t.string(), displayName: t.option(t.string()) },
  (ctx, { address, displayName }) => {
    requireAgent(ctx);
    if (!address) throw new SenderError('address must not be empty');
    const existing = ctx.db.learner.address.find(address);
    if (existing) {
      ctx.db.learner.address.update({
        ...existing,
        displayName: displayName ?? existing.displayName,
        lastActiveAt: ctx.timestamp,
      });
    } else {
      ctx.db.learner.insert({
        address,
        displayName,
        plan: 'free',
        preferredFormat: undefined,
        createdAt: ctx.timestamp,
        lastActiveAt: ctx.timestamp,
      });
    }
  }
);

// A stated preference only sets the bandit's starting weights.
export const set_preferred_format = spacetimedb.reducer(
  { address: t.string(), format: t.string() },
  (ctx, { address, format }) => {
    requireAgent(ctx);
    oneOf(format, FORMATS, 'format');
    const learner = requireLearner(ctx, address);
    ctx.db.learner.address.update({ ...learner, preferredFormat: format });
    ensureFormatWeights(ctx, address);
    const arm = ctx.db.formatWeight.key.find(`${address}:${format}`)!;
    if (arm.uses === 0)
      ctx.db.formatWeight.key.update({ ...arm, alpha: 2 });
  }
);

// ── Courses & curriculum ─────────────────────────────────────────────────────

export const create_course = spacetimedb.reducer(
  {
    address: t.string(),
    name: t.string(),
    currentUnit: t.option(t.string()),
    examDate: t.option(t.timestamp()),
    rawSyllabus: t.string(),
  },
  (ctx, { address, name, currentUnit, examDate, rawSyllabus }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    if (!name) throw new SenderError('Course name must not be empty');
    ctx.db.course.insert({
      id: 0n,
      userAddress: address,
      name,
      currentUnit,
      examDate,
      rawSyllabus,
      status: 'draft',
      createdAt: ctx.timestamp,
    });
  }
);

// Fields left out are unchanged.
export const update_course = spacetimedb.reducer(
  {
    address: t.string(),
    courseId: t.u64(),
    name: t.option(t.string()),
    currentUnit: t.option(t.string()),
    examDate: t.option(t.timestamp()),
  },
  (ctx, { address, courseId, name, currentUnit, examDate }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const course = requireCourse(ctx, courseId, address);
    ctx.db.course.id.update({
      ...course,
      name: name ?? course.name,
      currentUnit: currentUnit ?? course.currentUnit,
      examDate: examDate ?? course.examDate,
    });
  }
);

const ConceptInput = t.object('ConceptInput', {
  name: t.string(),
  summary: t.string(),
  embedding: t.array(t.f32()),
  pInit: t.option(t.f64()),
});

const EdgeInput = t.object('EdgeInput', {
  concept: t.string(),
  requires: t.string(),
  confidence: t.f64(),
});

function insertConcept(
  ctx: Ctx,
  courseId: bigint,
  c: { name: string; summary: string; embedding: number[]; pInit?: number }
) {
  return ctx.db.concept.insert({
    id: 0n,
    courseId,
    name: c.name.trim(),
    summary: c.summary,
    embedding: c.embedding,
    pInit: c.pInit ?? BKT_DEFAULTS.prior,
    pLearn: BKT_DEFAULTS.learn,
    pSlip: BKT_DEFAULTS.slip,
    pGuess: BKT_DEFAULTS.guess,
  });
}

// Stores the extracted concept graph. Edges refer to concepts by name. For a
// draft course any earlier extraction is replaced; for an active course new
// concepts are added alongside the existing ones. Edges that would create a
// cycle (or reference unknown names) are skipped.
export const ingest_concept_graph = spacetimedb.reducer(
  {
    address: t.string(),
    courseId: t.u64(),
    concepts: t.array(ConceptInput),
    edges: t.array(EdgeInput),
  },
  (ctx, { address, courseId, concepts, edges }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const course = requireCourse(ctx, courseId, address);

    if (course.status === 'draft') {
      for (const r of courseEdges(ctx, courseId)) ctx.db.prerequisite.id.delete(r.id);
      for (const r of courseConcepts(ctx, courseId)) ctx.db.concept.id.delete(r.id);
    }

    const byName = new Map(
      courseConcepts(ctx, courseId).map(c => [c.name.toLowerCase(), c])
    );
    for (const input of concepts) {
      const key = input.name.trim().toLowerCase();
      if (!key || byName.has(key)) continue;
      const row = insertConcept(ctx, courseId, input);
      byName.set(key, row);
      if (course.status === 'active') ensureMastery(ctx, address, courseId, row);
    }

    const existing: Edge[] = courseEdges(ctx, courseId);
    for (const e of edges) {
      const from = byName.get(e.concept.trim().toLowerCase());
      const to = byName.get(e.requires.trim().toLowerCase());
      if (!from || !to || wouldCreateCycle(existing, from.id, to.id)) continue;
      if (existing.some(x => x.conceptId === from.id && x.requiresId === to.id)) continue;
      ctx.db.prerequisite.insert({
        id: 0n,
        courseId,
        conceptId: from.id,
        requiresId: to.id,
        confidence: e.confidence,
      });
      existing.push({ conceptId: from.id, requiresId: to.id });
    }
  }
);

export const add_concept = spacetimedb.reducer(
  {
    address: t.string(),
    courseId: t.u64(),
    name: t.string(),
    summary: t.string(),
  },
  (ctx, { address, courseId, name, summary }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const course = requireCourse(ctx, courseId, address);
    if (!name.trim()) throw new SenderError('Concept name must not be empty');
    if (courseConcepts(ctx, courseId).some(c => c.name.toLowerCase() === name.trim().toLowerCase()))
      throw new SenderError(`Concept '${name}' already exists`);
    const row = insertConcept(ctx, courseId, { name, summary, embedding: [] });
    if (course.status === 'active') ensureMastery(ctx, address, courseId, row);
  }
);

export const update_concept = spacetimedb.reducer(
  {
    address: t.string(),
    conceptId: t.u64(),
    name: t.option(t.string()),
    summary: t.option(t.string()),
    embedding: t.option(t.array(t.f32())),
  },
  (ctx, { address, conceptId, name, summary, embedding }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const concept = requireConcept(ctx, conceptId);
    requireCourse(ctx, concept.courseId, address);
    ctx.db.concept.id.update({
      ...concept,
      name: name?.trim() || concept.name,
      summary: summary ?? concept.summary,
      embedding: embedding ?? concept.embedding,
    });
  }
);

export const remove_concept = spacetimedb.reducer(
  { address: t.string(), conceptId: t.u64() },
  (ctx, { address, conceptId }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const concept = requireConcept(ctx, conceptId);
    requireCourse(ctx, concept.courseId, address);
    for (const e of courseEdges(ctx, concept.courseId))
      if (e.conceptId === conceptId || e.requiresId === conceptId)
        ctx.db.prerequisite.id.delete(e.id);
    for (const a of [...ctx.db.attempt.conceptId.filter(conceptId)])
      ctx.db.attempt.id.delete(a.id);
    for (const m of [...ctx.db.mastery.courseId.filter(concept.courseId)])
      if (m.conceptId === conceptId) ctx.db.mastery.key.delete(m.key);
    ctx.db.concept.id.delete(conceptId);
  }
);

export const add_prerequisite = spacetimedb.reducer(
  {
    address: t.string(),
    conceptId: t.u64(),
    requiresId: t.u64(),
    confidence: t.f64(),
  },
  (ctx, { address, conceptId, requiresId, confidence }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const concept = requireConcept(ctx, conceptId);
    const requires = requireConcept(ctx, requiresId);
    requireCourse(ctx, concept.courseId, address);
    if (requires.courseId !== concept.courseId)
      throw new SenderError('Concepts belong to different courses');
    const edges = courseEdges(ctx, concept.courseId);
    if (edges.some(e => e.conceptId === conceptId && e.requiresId === requiresId))
      throw new SenderError('Prerequisite already exists');
    if (wouldCreateCycle(edges, conceptId, requiresId))
      throw new SenderError('Prerequisite would create a cycle');
    ctx.db.prerequisite.insert({
      id: 0n,
      courseId: concept.courseId,
      conceptId,
      requiresId,
      confidence,
    });
  }
);

export const remove_prerequisite = spacetimedb.reducer(
  { address: t.string(), prerequisiteId: t.u64() },
  (ctx, { address, prerequisiteId }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const edge = ctx.db.prerequisite.id.find(prerequisiteId);
    if (!edge) throw new SenderError(`Prerequisite ${prerequisiteId} not found`);
    requireCourse(ctx, edge.courseId, address);
    ctx.db.prerequisite.id.delete(prerequisiteId);
  }
);

// The user confirmed the extracted concept list: start tracking mastery.
export const confirm_course = spacetimedb.reducer(
  { address: t.string(), courseId: t.u64() },
  (ctx, { address, courseId }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const course = requireCourse(ctx, courseId, address);
    const concepts = courseConcepts(ctx, courseId);
    if (concepts.length === 0)
      throw new SenderError('Course has no concepts to confirm');
    for (const c of concepts) ensureMastery(ctx, address, courseId, c);
    ensureFormatWeights(ctx, address);
    ctx.db.course.id.update({ ...course, status: 'active' });
  }
);

// "Forget this course": deletes the course and all learning data tied to it.
export const forget_course = spacetimedb.reducer(
  { address: t.string(), courseId: t.u64() },
  (ctx, { address, courseId }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    requireCourse(ctx, courseId, address);
    deleteCourseData(ctx, courseId);
  }
);

// ── Sessions ─────────────────────────────────────────────────────────────────

export const start_session = spacetimedb.reducer(
  { address: t.string(), courseId: t.option(t.u64()) },
  (ctx, { address, courseId }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    if (courseId !== undefined) requireCourse(ctx, courseId, address);
    ctx.db.session.insert({
      id: 0n,
      userAddress: address,
      courseId,
      startedAt: ctx.timestamp,
      endedAt: undefined,
      summary: '',
      lastConceptId: undefined,
    });
  }
);

export const end_session = spacetimedb.reducer(
  {
    address: t.string(),
    sessionId: t.u64(),
    summary: t.string(),
    lastConceptId: t.option(t.u64()),
  },
  (ctx, { address, sessionId, summary, lastConceptId }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    const session = ctx.db.session.id.find(sessionId);
    if (!session || session.userAddress !== address)
      throw new SenderError(`Session ${sessionId} not found for this learner`);
    ctx.db.session.id.update({
      ...session,
      endedAt: ctx.timestamp,
      summary,
      lastConceptId: lastConceptId ?? session.lastConceptId,
    });
  }
);

// ── Answers: BKT + spaced repetition + format bandit ─────────────────────────

export const record_attempt = spacetimedb.reducer(
  {
    address: t.string(),
    conceptId: t.u64(),
    correct: t.bool(),
    kind: t.string(),
    format: t.option(t.string()),
    sessionId: t.option(t.u64()),
    question: t.option(t.string()),
  },
  (ctx, { address, conceptId, correct, kind, format, sessionId, question }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    oneOf(kind, ATTEMPT_KINDS, 'kind');
    if (format !== undefined) oneOf(format, FORMATS, 'format');
    const concept = requireConcept(ctx, conceptId);
    const course = requireCourse(ctx, concept.courseId, address);
    const now = ctx.timestamp;

    // 1. Knowledge tracing.
    const m = ensureMastery(ctx, address, course.id, concept);
    const pAfter = bktUpdate(m.pMastered, correct, {
      learn: concept.pLearn,
      slip: concept.pSlip,
      guess: concept.pGuess,
    });

    // 2. Review schedule. Several answers in one sitting count as one review.
    const fresh =
      !m.lastSeen ||
      now.microsSinceUnixEpoch - m.lastSeen.microsSinceUnixEpoch > 12n * HOUR;
    let { ease, intervalDays, repetitions } = m;
    let nextReview = m.nextReview;
    if (fresh) {
      const quality = correct ? (pAfter > 0.85 ? 5 : 4) : 1;
      ({ ease, intervalDays, repetitions } = sm2Update(m, quality));
      nextReview = addDays(now, intervalDays);
    } else if (!nextReview) {
      nextReview = addDays(now, 1);
    }
    // Never schedule past the day before the exam (but not in the past either).
    if (course.examDate) {
      const cap = addDays(course.examDate, -1);
      const floor = addMicros(now, HOUR);
      const limit =
        cap.microsSinceUnixEpoch > floor.microsSinceUnixEpoch ? cap : floor;
      if (nextReview.microsSinceUnixEpoch > limit.microsSinceUnixEpoch)
        nextReview = limit;
    }

    ctx.db.mastery.key.update({
      ...m,
      pMastered: pAfter,
      attempts: m.attempts + 1,
      correct: m.correct + (correct ? 1 : 0),
      lastSeen: now,
      nextReview,
      ease,
      intervalDays,
      repetitions,
    });

    // 3. Format bandit.
    if (format !== undefined && BANDIT_KINDS.includes(kind)) {
      ensureFormatWeights(ctx, address);
      const arm = ctx.db.formatWeight.key.find(`${address}:${format}`)!;
      ctx.db.formatWeight.key.update({
        ...arm,
        alpha: arm.alpha + (correct ? 1 : 0),
        beta: arm.beta + (correct ? 0 : 1),
        uses: arm.uses + 1,
      });
    }

    // 4. Evidence log.
    ctx.db.attempt.insert({
      id: 0n,
      userAddress: address,
      courseId: course.id,
      conceptId,
      sessionId,
      kind,
      format,
      question,
      correct,
      pBefore: m.pMastered,
      pAfter,
      createdAt: now,
    });
  }
);

// ── Choosing what to do next ─────────────────────────────────────────────────

// Writes the recommendation to `next_step`:
//  - teach:      weakest concept whose prerequisites are all solid, with a
//                teaching format drawn by Thompson sampling
//  - review:     the most overdue concept
//  - diagnostic: an untested concept, skipping ones sitting on a known gap
export const compute_next_step = spacetimedb.reducer(
  { address: t.string(), courseId: t.u64(), mode: t.string() },
  (ctx, { address, courseId, mode }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    requireCourse(ctx, courseId, address);
    oneOf(mode, MODES, 'mode');

    const concepts = courseConcepts(ctx, courseId);
    const edges = courseEdges(ctx, courseId);
    const rows = new Map(
      [...ctx.db.mastery.userAddress.filter(address)]
        .filter(r => r.courseId === courseId)
        .map(r => [r.conceptId, r])
    );
    const p = (id: bigint) => rows.get(id)?.pMastered ?? BKT_DEFAULTS.prior;
    const nameOf = (id: bigint) => ctx.db.concept.id.find(id)?.name ?? String(id);

    let conceptId: bigint | null = null;
    let reason = '';
    let format = '';

    if (mode === 'teach') {
      conceptId = pickNextConcept(
        concepts.map(c => ({ id: c.id, p: p(c.id) })),
        edges
      );
      if (conceptId !== null)
        reason = `Weakest unmastered concept (mastery ${p(conceptId).toFixed(2)}) with solid prerequisites`;
    } else if (mode === 'review') {
      const due = [...rows.values()]
        .filter(
          r =>
            r.nextReview &&
            r.nextReview.microsSinceUnixEpoch <= ctx.timestamp.microsSinceUnixEpoch
        )
        .sort((a, b) =>
          Number(a.nextReview!.microsSinceUnixEpoch - b.nextReview!.microsSinceUnixEpoch)
        );
      if (due.length) {
        conceptId = due[0].conceptId;
        reason = `Review overdue (${due.length} due)`;
      }
    } else {
      const untested = concepts.filter(c => (rows.get(c.id)?.attempts ?? 0) === 0);
      // Skip concepts whose tested prerequisites are weak: they are almost
      // certainly unknown too, so testing them wastes a question.
      const askable = untested.filter(c =>
        edges
          .filter(e => e.conceptId === c.id)
          .every(e => (rows.get(e.requiresId)?.attempts ?? 0) === 0 || p(e.requiresId) >= 0.4)
      );
      const pool = askable.length ? askable : untested;
      // Most informative first: the concept the most others depend on.
      const dependents = (id: bigint) => edges.filter(e => e.requiresId === id).length;
      if (pool.length) {
        const best = pool.reduce((a, b) => (dependents(b.id) > dependents(a.id) ? b : a));
        conceptId = best.id;
        reason = `Untested concept that ${dependents(best.id)} other concept(s) depend on`;
      }
    }

    if (conceptId !== null) {
      format = mode === 'diagnostic' ? 'quiz' : chooseFormat(ctx, address);
      reason += ` (${nameOf(conceptId)})`;
    }

    const row = {
      key: `${address}:${courseId}`,
      userAddress: address,
      courseId,
      conceptId: conceptId ?? undefined,
      format,
      mode: conceptId === null ? 'complete' : mode,
      reason: conceptId === null ? `Nothing left to ${mode}` : reason,
      computedAt: ctx.timestamp,
    };
    if (ctx.db.nextStep.key.find(row.key)) ctx.db.nextStep.key.update(row);
    else ctx.db.nextStep.insert(row);
  }
);

// ── Generated study content ──────────────────────────────────────────────────

export const save_study_card = spacetimedb.reducer(
  {
    address: t.string(),
    courseId: t.u64(),
    conceptId: t.option(t.u64()),
    kind: t.string(),
    payloadJson: t.string(),
  },
  (ctx, { address, courseId, conceptId, kind, payloadJson }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    requireCourse(ctx, courseId, address);
    oneOf(kind, CARD_KINDS, 'card kind');
    try {
      JSON.parse(payloadJson);
    } catch {
      throw new SenderError('payloadJson must be valid JSON');
    }
    ctx.db.studyCard.insert({
      id: 0n,
      userAddress: address,
      courseId,
      conceptId,
      kind,
      payloadJson,
      status: 'new',
      createdAt: ctx.timestamp,
    });
  }
);

export const set_study_card_status = spacetimedb.reducer(
  { address: t.string(), cardId: t.u64(), status: t.string() },
  (ctx, { address, cardId, status }) => {
    requireAgent(ctx);
    oneOf(status, CARD_STATUSES, 'status');
    const card = ctx.db.studyCard.id.find(cardId);
    if (!card || card.userAddress !== address)
      throw new SenderError(`Card ${cardId} not found for this learner`);
    ctx.db.studyCard.id.update({ ...card, status });
  }
);

// ── Payments (Payment Protocol) ──────────────────────────────────────────────

export const create_payment_request = spacetimedb.reducer(
  {
    address: t.string(),
    product: t.string(),
    courseId: t.option(t.u64()),
    amountCents: t.u32(),
  },
  (ctx, { address, product, courseId, amountCents }) => {
    requireAgent(ctx);
    requireLearner(ctx, address);
    oneOf(product, PRODUCTS, 'product');
    if (product === 'exam_pack') {
      if (courseId === undefined)
        throw new SenderError('exam_pack requires a courseId');
      requireCourse(ctx, courseId, address);
    }
    ctx.db.paymentRequest.insert({
      id: 0n,
      userAddress: address,
      product,
      courseId,
      amountCents,
      status: 'pending',
      paymentRef: undefined,
      createdAt: ctx.timestamp,
      resolvedAt: undefined,
    });
  }
);

// Marks a request paid (granting the entitlement) or failed.
export const resolve_payment = spacetimedb.reducer(
  { requestId: t.u64(), success: t.bool(), paymentRef: t.option(t.string()) },
  (ctx, { requestId, success, paymentRef }) => {
    requireAgent(ctx);
    const req = ctx.db.paymentRequest.id.find(requestId);
    if (!req) throw new SenderError(`Payment request ${requestId} not found`);
    if (req.status !== 'pending')
      throw new SenderError(`Payment request already ${req.status}`);
    ctx.db.paymentRequest.id.update({
      ...req,
      status: success ? 'paid' : 'failed',
      paymentRef,
      resolvedAt: ctx.timestamp,
    });
    if (!success) return;

    // Exam pack lasts through exam day; semester is a 30-day subscription.
    const course = req.courseId !== undefined ? ctx.db.course.id.find(req.courseId) : null;
    const expiresAt =
      req.product === 'exam_pack'
        ? course?.examDate
          ? addDays(course.examDate, 1)
          : undefined
        : addDays(ctx.timestamp, 30);
    ctx.db.entitlement.insert({
      id: 0n,
      userAddress: req.userAddress,
      product: req.product,
      courseId: req.courseId,
      paymentRequestId: requestId,
      grantedAt: ctx.timestamp,
      expiresAt,
    });
    const learner = ctx.db.learner.address.find(req.userAddress);
    if (learner) ctx.db.learner.address.update({ ...learner, plan: req.product });
  }
);

// ── Demo data ────────────────────────────────────────────────────────────────

// [name, summary, mastery after two days of study]
const DEMO_CONCEPTS: [string, string, number][] = [
  ['Big-O Notation', 'Describing how running time grows with input size', 0.35],
  ['Arrays', 'Contiguous memory, O(1) indexing, costly inserts', 0.92],
  ['Linked Lists', 'Nodes with pointers; O(1) insert, O(n) search', 0.85],
  ['Stacks and Queues', 'LIFO and FIFO abstractions', 0.8],
  ['Hash Tables', 'Key lookup via hashing; collisions and load factor', 0.55],
  ['Recursion', 'Functions that call themselves; base cases', 0.75],
  ['Binary Trees', 'Hierarchical nodes with up to two children', 0.5],
  ['Binary Search Trees', 'Ordered trees with O(log n) average search', 0.2],
  ['Heaps', 'Complete trees giving O(1) min/max', 0.1],
  ['Graphs', 'Vertices and edges; BFS and DFS', 0.1],
];
const DEMO_EDGES: [string, string][] = [
  ['Linked Lists', 'Arrays'],
  ['Stacks and Queues', 'Arrays'],
  ['Stacks and Queues', 'Linked Lists'],
  ['Hash Tables', 'Arrays'],
  ['Hash Tables', 'Big-O Notation'],
  ['Recursion', 'Stacks and Queues'],
  ['Binary Trees', 'Recursion'],
  ['Binary Trees', 'Linked Lists'],
  ['Binary Search Trees', 'Binary Trees'],
  ['Binary Search Trees', 'Big-O Notation'],
  ['Heaps', 'Binary Trees'],
  ['Graphs', 'Recursion'],
  ['Graphs', 'Stacks and Queues'],
];

// Seeds a learner with an active course and two days of study history so a
// returning-session demo is guaranteed to work. Re-running resets the demo.
export const seed_demo = spacetimedb.reducer(
  { address: t.string(), displayName: t.string() },
  (ctx, { address, displayName }) => {
    requireAgent(ctx);
    const now = ctx.timestamp;
    const hoursAgo = (h: number) => addMicros(now, -BigInt(h) * HOUR);

    for (const c of [...ctx.db.course.userAddress.filter(address)])
      if (c.name === 'CS 201: Data Structures') deleteCourseData(ctx, c.id);

    const learner = ctx.db.learner.address.find(address);
    if (learner)
      ctx.db.learner.address.update({ ...learner, displayName, lastActiveAt: now });
    else
      ctx.db.learner.insert({
        address,
        displayName,
        plan: 'free',
        preferredFormat: undefined,
        createdAt: hoursAgo(48),
        lastActiveAt: now,
      });

    const course = ctx.db.course.insert({
      id: 0n,
      userAddress: address,
      name: 'CS 201: Data Structures',
      currentUnit: 'Trees',
      examDate: addDays(now, 7),
      rawSyllabus: DEMO_CONCEPTS.map(c => c[0]).join('\n'),
      status: 'active',
      createdAt: hoursAgo(48),
    });

    const ids = new Map<string, bigint>();
    for (const [name, summary, p] of DEMO_CONCEPTS) {
      const c = insertConcept(ctx, course.id, { name, summary, embedding: [] });
      ids.set(name, c.id);
      const tested = p !== 0.1;
      ctx.db.mastery.insert({
        key: masteryKey(address, c.id),
        userAddress: address,
        courseId: course.id,
        conceptId: c.id,
        pMastered: p,
        attempts: tested ? 4 : 0,
        correct: tested ? Math.round(p * 4) : 0,
        lastSeen: tested ? hoursAgo(p > 0.7 ? 30 : 5) : undefined,
        // Weak concepts are due now; strong ones later.
        nextReview: tested ? addDays(now, p > 0.7 ? 3 : -0.2) : undefined,
        ease: SM2_INITIAL.ease,
        intervalDays: p > 0.7 ? 3 : 1,
        repetitions: p > 0.7 ? 2 : 0,
      });
    }
    for (const [concept, requires] of DEMO_EDGES)
      ctx.db.prerequisite.insert({
        id: 0n,
        courseId: course.id,
        conceptId: ids.get(concept)!,
        requiresId: ids.get(requires)!,
        confidence: 0.9,
      });

    // Bandit: worked examples have clearly beaten flashcards for this learner.
    ensureFormatWeights(ctx, address);
    const arms: Record<string, [number, number, number]> = {
      worked_example: [8, 2, 9],
      flashcards: [3, 6, 8],
      diagram: [3, 2, 3],
      analogy: [2, 2, 2],
    };
    for (const [format, [alpha, beta, uses]] of Object.entries(arms)) {
      const arm = ctx.db.formatWeight.key.find(`${address}:${format}`)!;
      ctx.db.formatWeight.key.update({ ...arm, alpha, beta, uses });
    }

    // Evidence log: a diagnostic yesterday, practice this morning.
    const history: [string, boolean, string, string | undefined, number][] = [
      ['Big-O Notation', false, 'diagnostic', undefined, 47],
      ['Arrays', true, 'diagnostic', undefined, 47],
      ['Hash Tables', true, 'diagnostic', undefined, 46],
      ['Recursion', true, 'diagnostic', undefined, 46],
      ['Binary Trees', false, 'diagnostic', undefined, 46],
      ['Linked Lists', true, 'check', 'flashcards', 30],
      ['Stacks and Queues', true, 'check', 'worked_example', 29],
      ['Big-O Notation', false, 'check', 'flashcards', 5],
      ['Binary Trees', true, 'check', 'worked_example', 4],
    ];
    const sessionOne = ctx.db.session.insert({
      id: 0n,
      userAddress: address,
      courseId: course.id,
      startedAt: hoursAgo(48),
      endedAt: hoursAgo(46),
      summary: 'Onboarded, ran the diagnostic. Big-O and trees are the main gaps.',
      lastConceptId: ids.get('Binary Trees'),
    });
    const sessionTwo = ctx.db.session.insert({
      id: 0n,
      userAddress: address,
      courseId: course.id,
      startedAt: hoursAgo(6),
      endedAt: hoursAgo(4),
      summary: 'Reviewed Big-O (still shaky) and practiced binary trees with worked examples.',
      lastConceptId: ids.get('Binary Trees'),
    });
    for (const [name, correct, kind, format, h] of history) {
      const conceptId = ids.get(name)!;
      const p = DEMO_CONCEPTS.find(c => c[0] === name)![2];
      ctx.db.attempt.insert({
        id: 0n,
        userAddress: address,
        courseId: course.id,
        conceptId,
        sessionId: h > 24 ? sessionOne.id : sessionTwo.id,
        kind,
        format,
        question: undefined,
        correct,
        pBefore: correct ? Math.max(0, p - 0.1) : Math.min(1, p + 0.1),
        pAfter: p,
        createdAt: hoursAgo(h),
      });
    }
  }
);
