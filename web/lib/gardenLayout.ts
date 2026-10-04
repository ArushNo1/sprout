// Pure geometry for the interactive garden map: where each plant sits, which concepts a selection
// depends on or unlocks, and how to fit or focus the view. No React, so it can be tested directly.
import { gardenRows, type GardenEdge } from '@/lib/garden';

export type Orientation = 'rows' | 'columns';
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** Space one plant (and its two-line label) takes up. */
export const CELL = { w: 164, h: 192 };
const GAP = { x: 18, y: 56 };

export type MapLayout = {
  pos: Map<number, Point>; // centre of each plant's cell
  rows: number[][]; // concept ids by prerequisite depth
  bounds: Box;
};

/**
 * Concepts by prerequisite depth. `rows` puts depth 0 on top and spreads each level sideways;
 * `columns` puts depth 0 on the left and stacks each level downward, which suits courses with
 * wide levels on a landscape screen.
 */
export function layoutMap(ids: readonly number[], edges: readonly GardenEdge[], orientation: Orientation): MapLayout {
  const rows = gardenRows(ids, edges);
  const pos = new Map<number, Point>();
  const stepX = CELL.w + GAP.x;
  const stepY = CELL.h + GAP.y;
  rows.forEach((row, depth) => {
    row.forEach((id, i) => {
      const offset = i - (row.length - 1) / 2; // centred on the level's axis
      pos.set(id, orientation === 'rows'
        ? { x: offset * stepX, y: depth * stepY }
        : { x: depth * (CELL.w + GAP.x + 40), y: offset * stepY });
    });
  });
  return { pos, rows, bounds: boundsOf([...pos.values()]) };
}

export function boundsOf(points: readonly Point[], pad = 0): Box {
  if (points.length === 0) return { x: 0, y: 0, w: CELL.w, h: CELL.h };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x0 = Math.min(...xs) - CELL.w / 2 - pad, x1 = Math.max(...xs) + CELL.w / 2 + pad;
  const y0 = Math.min(...ys) - CELL.h / 2 - pad, y1 = Math.max(...ys) + CELL.h / 2 + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export type Related = { ancestors: Set<number>; descendants: Set<number> };

/** Everything `id` builds on (transitively) and everything it unlocks. Cycles can't loop forever. */
export function relatedTo(id: number, edges: readonly GardenEdge[]): Related {
  const walk = (next: (e: GardenEdge) => [number, number]) => {
    const seen = new Set<number>();
    const queue = [id];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const e of edges) {
        const [from, to] = next(e);
        if (from === cur && to !== id && !seen.has(to)) { seen.add(to); queue.push(to); }
      }
    }
    return seen;
  };
  return {
    ancestors: walk(e => [e.to, e.from]),
    descendants: walk(e => [e.from, e.to]),
  };
}

export type View = { x: number; y: number; k: number }; // translate then scale, in screen pixels

export const MIN_K = 0.25;
export const MAX_K = 2.2;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** The view that centres `box` in a viewport with some breathing room. Never zooms in past 1.15 on a small graph. */
export function fitView(box: Box, vw: number, vh: number, pad = 28, maxK = 1.15): View {
  if (vw <= 0 || vh <= 0) return { x: 0, y: 0, k: 1 };
  const k = clampK(Math.min((vw - pad * 2) / box.w, (vh - pad * 2) / box.h, maxK));
  return { k, x: vw / 2 - (box.x + box.w / 2) * k, y: vh / 2 - (box.y + box.h / 2) * k };
}

/** Zoom by `factor` keeping the screen point (sx, sy) fixed. */
export function zoomAt(view: View, factor: number, sx: number, sy: number): View {
  const k = clampK(view.k * factor);
  const f = k / view.k;
  return { k, x: sx - (sx - view.x) * f, y: sy - (sy - view.y) * f };
}

export type Status = 'seed' | 'growing' | 'solid';
export type Filter = 'all' | 'due' | 'seed' | 'growing' | 'solid';

/** Which filter bucket a concept falls in. Due is separate: a due concept is also growing or solid. */
export function statusOf(mastery: number, attempts: number): Status {
  return attempts === 0 ? 'seed' : mastery >= 0.7 ? 'solid' : 'growing';
}

export function matchesFilter(filter: Filter, status: Status, due: boolean): boolean {
  return filter === 'all' || (filter === 'due' ? due : filter === status);
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Where an arrow key goes from `from`: up/down follow prerequisite links, left/right move to the
 * neighbour in the same level. "Up" always means toward what you learn first, in either orientation.
 */
export function arrowTarget(from: number, dir: Direction, layout: MapLayout, edges: readonly GardenEdge[]): number | null {
  if (dir === 'up' || dir === 'down') {
    const hits = edges.filter(e => (dir === 'up' ? e.to === from : e.from === from)).map(e => (dir === 'up' ? e.from : e.to));
    const here = layout.pos.get(from);
    if (!here || hits.length === 0) return null;
    return hits.sort((a, b) => dist(layout.pos.get(a), here) - dist(layout.pos.get(b), here))[0];
  }
  const row = layout.rows.find(r => r.includes(from));
  if (!row) return null;
  const i = row.indexOf(from) + (dir === 'right' ? 1 : -1);
  return i >= 0 && i < row.length ? row[i] : null;
}

const dist = (a?: Point, b?: Point) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);

/** Splits a concept name over at most two lines of roughly `max` characters. */
export function wrapName(name: string, max = 15): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  const head = lines.slice(0, 1);
  const tail = lines.slice(1).join(' ');
  return [...head, tail.length > max ? tail.slice(0, max - 1).trimEnd() + '…' : tail];
}
