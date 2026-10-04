// Pure learning-science helpers used by the reducers. No SpacetimeDB imports,
// so they can be unit-tested directly.

// ── Bayesian Knowledge Tracing ───────────────────────────────────────────────

export const BKT_DEFAULTS = { prior: 0.2, learn: 0.15, slip: 0.1, guess: 0.25 };

export type BktParams = { learn: number; slip: number; guess: number };

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

/** P(mastered) after observing one answer, including the learning transition. */
export function bktUpdate(
  pMastered: number,
  correct: boolean,
  { learn, slip, guess }: BktParams
): number {
  const p = clamp(pMastered, 0, 1);
  const num = correct ? p * (1 - slip) : p * slip;
  const den = correct
    ? p * (1 - slip) + (1 - p) * guess
    : p * slip + (1 - p) * (1 - guess);
  const posterior = den === 0 ? p : num / den;
  return clamp(posterior + (1 - posterior) * learn, 0, 1);
}

export type BktParamName = 'pInit' | 'pLearn' | 'pSlip' | 'pGuess';

/**
 * Clamp a fitted BKT parameter into a range the tracer can use: [0.001, 0.999]
 * for pInit/pLearn, [0.001, 0.499] for pSlip/pGuess (at 0.5 or above a wrong
 * answer would count as evidence of mastery). Returns null when the value
 * isn't a probability at all.
 */
export function clampBktParam(name: BktParamName, value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  const hi = name === 'pSlip' || name === 'pGuess' ? 0.499 : 0.999;
  return clamp(value, 0.001, hi);
}

// ── Spaced repetition (SM-2) ─────────────────────────────────────────────────

export type ReviewState = {
  ease: number;
  intervalDays: number;
  repetitions: number;
};

export const SM2_INITIAL: ReviewState = {
  ease: 2.5,
  intervalDays: 0,
  repetitions: 0,
};

/** `quality` is 0-5 as in SM-2; below 3 counts as a lapse. */
export function sm2Update(state: ReviewState, quality: number): ReviewState {
  const q = clamp(quality, 0, 5);
  const ease = Math.max(
    1.3,
    state.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  );
  if (q < 3) return { ease, intervalDays: 1, repetitions: 0 };
  const repetitions = state.repetitions + 1;
  const intervalDays =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.round(state.intervalDays * ease);
  return { ease, intervalDays, repetitions };
}

// ── Format bandit (Thompson sampling) ────────────────────────────────────────

export const FORMATS = [
  'worked_example',
  'flashcards',
  'diagram',
  'analogy',
] as const;
export type Format = (typeof FORMATS)[number];

function normal(rng: () => number): number {
  // Box-Muller; 1 - rng() keeps the log argument in (0, 1].
  return (
    Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())
  );
}

// Marsaglia-Tsang gamma sampler, shape > 0, scale 1.
function gamma(shape: number, rng: () => number): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(rng() || 1e-12, 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u || 1e-12) < 0.5 * x * x + d * (1 - v + Math.log(v)))
      return d * v;
  }
}

export function betaSample(alpha: number, beta: number, rng: () => number) {
  const a = gamma(Math.max(alpha, 1e-3), rng);
  const b = gamma(Math.max(beta, 1e-3), rng);
  return a / (a + b);
}

/** Draw from each arm's Beta posterior and play the best draw. */
export function thompsonPick(
  arms: { format: string; alpha: number; beta: number }[],
  rng: () => number
): string {
  let best = arms[0].format;
  let bestDraw = -1;
  for (const arm of arms) {
    const draw = betaSample(arm.alpha, arm.beta, rng);
    if (draw > bestDraw) {
      bestDraw = draw;
      best = arm.format;
    }
  }
  return best;
}

// ── Knowledge graph ──────────────────────────────────────────────────────────

export type Edge = { conceptId: bigint; requiresId: bigint };

export const PREREQ_SOLID = 0.7;
export const MASTERED = 0.95;

/** Adding `conceptId requires requiresId` creates a cycle if `requiresId` already depends on `conceptId`. */
export function wouldCreateCycle(
  edges: Edge[],
  conceptId: bigint,
  requiresId: bigint
): boolean {
  if (conceptId === requiresId) return true;
  const requires = new Map<bigint, bigint[]>();
  for (const e of edges) {
    const list = requires.get(e.conceptId) ?? [];
    list.push(e.requiresId);
    requires.set(e.conceptId, list);
  }
  const seen = new Set<bigint>();
  const stack = [requiresId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === conceptId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(requires.get(id) ?? []));
  }
  return false;
}

/**
 * The weakest concept whose prerequisites are all solid. If every unmastered
 * concept is blocked (e.g. a bad graph), falls back to the weakest overall.
 * Returns null when everything is mastered.
 */
export function pickNextConcept(
  concepts: { id: bigint; p: number }[],
  edges: Edge[]
): bigint | null {
  const p = new Map(concepts.map(c => [c.id, c.p]));
  const unmastered = concepts.filter(c => c.p < MASTERED);
  if (unmastered.length === 0) return null;
  const solid = (id: bigint) => (p.get(id) ?? 1) > PREREQ_SOLID;
  const eligible = unmastered.filter(c =>
    edges.every(e => e.conceptId !== c.id || solid(e.requiresId))
  );
  const pool = eligible.length ? eligible : unmastered;
  return pool.reduce((a, b) => (b.p < a.p ? b : a)).id;
}
