// Pure garden-view helpers — no React, no database imports.
// Ported from spacetimedb/src/garden.ts; uses number ids instead of bigint.

import type { Stage } from '@/components/Plant';
export type { Stage };

export type PlantState = {
  stage: Stage;
  tested: boolean;
  /** True when a tested concept's review date has passed. */
  wilted: boolean;
  /** Whole-number percent mastered, only for tested concepts. */
  percent: number | null;
};

const SPROUT_BELOW  = 0.4;
const SAPLING_BELOW = 0.7;
const BUDDING_BELOW = 0.95;

/**
 * Derives the plant stage from a graph node's mastery/attempts/due fields.
 * Untested (zero attempts) → seed. Tested concepts grow through
 * sprout < 0.4 ≤ sapling < 0.7 ≤ budding < 0.95 ≤ flowering, wilting when due.
 */
export function plantState(mastery: number, attempts: number, due: boolean): PlantState {
  if (attempts === 0) return { stage: 'seed', tested: false, wilted: false, percent: null };
  const p = Math.min(1, Math.max(0, mastery));
  const stage: Stage =
    p < SPROUT_BELOW  ? 'sprout'  :
    p < SAPLING_BELOW ? 'sapling' :
    p < BUDDING_BELOW ? 'budding' :
    'flowering';
  return { stage, tested: true, wilted: due, percent: Math.floor(p * 100) };
}

export type GardenEdge = { from: number; to: number };

/**
 * Depth 0 = no prerequisites inside the course; otherwise 1 + deepest prerequisite depth.
 * Edges to unknown concepts and cycles are ignored.
 */
export function conceptDepths(ids: readonly number[], edges: readonly GardenEdge[]): Map<number, number> {
  const known = new Set(ids);
  const requires = new Map<number, number[]>();
  for (const e of edges) {
    if (e.from === e.to || !known.has(e.to) || !known.has(e.from)) continue;
    const list = requires.get(e.to) ?? [];
    list.push(e.from);
    requires.set(e.to, list);
  }
  const depth = new Map<number, number>();
  const visiting = new Set<number>();
  const visit = (id: number): number => {
    const done = depth.get(id);
    if (done !== undefined) return done;
    if (visiting.has(id)) return -1;
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
 * Rows of concept ids by depth. Within a row, concepts are sorted near the
 * average position of their prerequisites to keep connecting lines short.
 */
export function gardenRows(ids: readonly number[], edges: readonly GardenEdge[]): number[][] {
  const depth = conceptDepths(ids, edges);
  const rows: number[][] = [];
  const sorted = [...ids].sort((a, b) => a - b);
  for (const id of sorted) {
    const d = depth.get(id) ?? 0;
    (rows[d] ??= []).push(id);
  }
  const compact = rows.filter(r => r && r.length);
  const position = new Map<number, number>();
  compact.forEach((row, i) => {
    if (i > 0) {
      const score = (id: number) => {
        const xs = edges.filter(e => e.to === id && position.has(e.from)).map(e => position.get(e.from)!);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5;
      };
      const scores = new Map(row.map(id => [id, score(id)]));
      row.sort((a, b) => scores.get(a)! - scores.get(b)!);
    }
    row.forEach((id, j) => position.set(id, (j + 0.5) / row.length));
  });
  return compact;
}

const DAY_MS = 86_400_000;
const startOfDay = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

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
