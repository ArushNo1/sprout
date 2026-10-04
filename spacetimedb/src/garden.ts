// Pure helpers for the knowledge garden view. No React or SpacetimeDB imports,
// so they can be unit-tested directly.
import { MASTERED, PREREQ_SOLID } from '../spacetimedb/src/algorithms';

export type Stage = 'seed' | 'sprout' | 'sapling' | 'budding' | 'flowering';

export type PlantMastery = {
  pMastered: number;
  attempts: number;
  /** Milliseconds since the Unix epoch, if a review is scheduled. */
  nextReviewMs?: number | null;
};

export type PlantState = {
  stage: Stage;
  tested: boolean;
  /** True when a tested concept's review date has passed. */
  wilted: boolean;
  /** Whole-number percent mastered, only for tested concepts. */
  percent: number | null;
};

export const SPROUT_BELOW = 0.4;
export const SAPLING_BELOW = PREREQ_SOLID; // 0.7
export const BUDDING_BELOW = MASTERED; // 0.95

/**
 * Untested (no mastery row, or zero attempts) is a seed. Tested concepts grow
 * through sprout < 0.4 <= sapling < 0.7 <= budding < 0.95 <= flowering, and
 * wilt when their next review is in the past.
 */
export function plantStage(
  m: PlantMastery | null | undefined,
  nowMs: number
): PlantState {
  if (!m || !(m.attempts > 0)) {
    return { stage: 'seed', tested: false, wilted: false, percent: null };
  }
  const p = Number.isFinite(m.pMastered)
    ? Math.min(1, Math.max(0, m.pMastered))
    : 0;
  const stage: Stage =
    p < SPROUT_BELOW
      ? 'sprout'
      : p < SAPLING_BELOW
        ? 'sapling'
        : p < BUDDING_BELOW
          ? 'budding'
          : 'flowering';
  const wilted = m.nextReviewMs != null && m.nextReviewMs <= nowMs;
  // Floor so a concept never reads as a higher percent than it has.
  return { stage, tested: true, wilted, percent: Math.floor(p * 100) };
}

export const isSolid = (m: PlantMastery | null | undefined) =>
  !!m && m.attempts > 0 && m.pMastered >= PREREQ_SOLID;

// ── Layout by prerequisite depth ─────────────────────────────────────────────

export type GardenEdge = { conceptId: bigint; requiresId: bigint };

/**
 * Depth 0 = no prerequisites inside the course; otherwise one more than the
 * deepest prerequisite. Edges to unknown concepts and cycles are ignored.
 */
export function conceptDepths(
  ids: readonly bigint[],
  edges: readonly GardenEdge[]
): Map<bigint, number> {
  const known = new Set(ids);
  const requires = new Map<bigint, bigint[]>();
  for (const e of edges) {
    if (e.conceptId === e.requiresId) continue;
    if (!known.has(e.conceptId) || !known.has(e.requiresId)) continue;
    const list = requires.get(e.conceptId) ?? [];
    list.push(e.requiresId);
    requires.set(e.conceptId, list);
  }
  const depth = new Map<bigint, number>();
  const visiting = new Set<bigint>();
  const visit = (id: bigint): number => {
    const done = depth.get(id);
    if (done !== undefined) return done;
    if (visiting.has(id)) return -1; // cycle: don't count this edge
    visiting.add(id);
    let d = 0;
    for (const r of requires.get(id) ?? []) d = Math.max(d, visit(r) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const id of ids) visit(id);
  return depth;
}

/**
 * Rows of concept ids by depth. Within a row, concepts sit near the average
 * position of their prerequisites to keep connecting lines short.
 */
export function gardenRows(
  ids: readonly bigint[],
  edges: readonly GardenEdge[]
): bigint[][] {
  const depth = conceptDepths(ids, edges);
  const rows: bigint[][] = [];
  const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const id of sorted) {
    const d = depth.get(id) ?? 0;
    (rows[d] ??= []).push(id);
  }
  const compact = rows.filter(r => r && r.length);
  const position = new Map<bigint, number>();
  compact.forEach((row, i) => {
    if (i > 0) {
      const score = (id: bigint) => {
        const xs = edges
          .filter(e => e.conceptId === id && position.has(e.requiresId))
          .map(e => position.get(e.requiresId)!);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5;
      };
      const scores = new Map(row.map(id => [id, score(id)]));
      row.sort((a, b) => scores.get(a)! - scores.get(b)!);
    }
    row.forEach((id, j) => position.set(id, (j + 0.5) / row.length));
  });
  return compact;
}

// ── Header text ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Whole calendar days from `nowMs` to `examMs` in local time. */
export function daysUntil(examMs: number, nowMs: number): number {
  return Math.round((startOfDay(examMs) - startOfDay(nowMs)) / DAY_MS);
}

export function examCountdown(examMs: number, nowMs: number): string {
  const d = daysUntil(examMs, nowMs);
  if (d > 1) return `Exam in ${d} days`;
  if (d === 1) return 'Exam tomorrow';
  if (d === 0) return 'Exam today';
  return 'Exam has passed';
}
