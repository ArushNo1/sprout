import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrowTarget, fitView, layoutMap, matchesFilter, relatedTo, statusOf, wrapName, zoomAt, CELL } from './gardenLayout.ts';

//  1 -> 2 -> 4,  1 -> 3 -> 4,  5 alone
const ids = [1, 2, 3, 4, 5];
const edges = [{ from: 1, to: 2 }, { from: 1, to: 3 }, { from: 2, to: 4 }, { from: 3, to: 4 }];

test('rows layout: depth down, siblings spread and centred', () => {
  const l = layoutMap(ids, edges, 'rows');
  assert.ok(l.pos.get(1)!.y < l.pos.get(2)!.y && l.pos.get(2)!.y < l.pos.get(4)!.y);
  assert.equal(l.pos.get(2)!.y, l.pos.get(3)!.y);
  assert.equal(l.pos.get(2)!.x + l.pos.get(3)!.x, 0);
  assert.ok(l.bounds.w > CELL.w && l.bounds.h > CELL.h);
});

test('columns layout: depth goes left to right', () => {
  const l = layoutMap(ids, edges, 'columns');
  assert.ok(l.pos.get(1)!.x < l.pos.get(2)!.x && l.pos.get(2)!.x < l.pos.get(4)!.x);
  assert.equal(l.pos.get(2)!.x, l.pos.get(3)!.x);
});

test('no two plants share a spot', () => {
  for (const o of ['rows', 'columns'] as const) {
    const spots = [...layoutMap(ids, edges, o).pos.values()].map(p => `${p.x},${p.y}`);
    assert.equal(new Set(spots).size, ids.length);
  }
});

test('related walks the whole chain both ways', () => {
  const r = relatedTo(4, edges);
  assert.deepEqual([...r.ancestors].sort(), [1, 2, 3]);
  assert.equal(r.descendants.size, 0);
  const root = relatedTo(1, edges);
  assert.deepEqual([...root.descendants].sort(), [2, 3, 4]);
});

test('related survives a cycle', () => {
  const r = relatedTo(1, [{ from: 1, to: 2 }, { from: 2, to: 1 }]);
  assert.deepEqual([...r.descendants], [2]);
});

test('fit centres the box and respects limits', () => {
  const v = fitView({ x: -100, y: -100, w: 200, h: 200 }, 800, 600);
  assert.equal(v.k, 1.15);
  assert.ok(Math.abs(v.x - 400) < 1e-9 && Math.abs(v.y - 300) < 1e-9);
  assert.equal(fitView({ x: 0, y: 0, w: 100000, h: 100000 }, 800, 600).k, 0.25);
});

test('zoomAt keeps the pointer position fixed', () => {
  const v = zoomAt({ x: 10, y: 20, k: 1 }, 2, 300, 200);
  assert.equal((300 - v.x) / v.k, 290);
  assert.equal((200 - v.y) / v.k, 180);
});

test('status and filters', () => {
  assert.equal(statusOf(0.9, 0), 'seed');
  assert.equal(statusOf(0.5, 2), 'growing');
  assert.equal(statusOf(0.7, 2), 'solid');
  assert.ok(matchesFilter('due', 'growing', true));
  assert.ok(!matchesFilter('due', 'growing', false));
  assert.ok(matchesFilter('all', 'seed', false));
  assert.ok(!matchesFilter('solid', 'growing', true));
});

test('arrow keys follow prerequisites and siblings', () => {
  const l = layoutMap(ids, edges, 'rows');
  assert.ok([2, 3].includes(arrowTarget(4, 'up', l, edges)!));
  assert.ok([2, 3].includes(arrowTarget(1, 'down', l, edges)!));
  assert.equal(arrowTarget(1, 'up', l, edges), null);
  const [a, b] = l.rows[1];
  assert.equal(arrowTarget(a, 'right', l, edges), b);
  assert.equal(arrowTarget(a, 'left', l, edges), null);
});

test('names wrap to two lines', () => {
  assert.deepEqual(wrapName('Heaps'), ['Heaps']);
  assert.deepEqual(wrapName('Binary Search Trees'), ['Binary Search', 'Trees']);
  const long = wrapName('Amortized analysis of dynamic array resizing strategies');
  assert.equal(long.length, 2);
  assert.ok(long[1].endsWith('…'));
});
