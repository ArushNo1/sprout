import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph, depths, stageOf } from './graph.ts';
import { decodeRows } from './stdb.ts';

test('depth is the longest prerequisite chain', () => {
  const d = depths([1, 2, 3, 4], [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 1, to: 3 }]);
  assert.deepEqual([...d.entries()].sort(), [[1, 0], [2, 1], [3, 2], [4, 0]]);
});

test('depth survives a cycle', () => {
  const d = depths([1, 2], [{ from: 1, to: 2 }, { from: 2, to: 1 }]);
  assert.equal(d.size, 2);
});

test('stages follow mastery and attempts', () => {
  assert.equal(stageOf(0.9, 0), 'seed');
  assert.equal(stageOf(0.2, 1), 'sprout');
  assert.equal(stageOf(0.7, 3), 'plant');
  assert.equal(stageOf(0.9, 3), 'bloom');
});

test('decodes SQL options and timestamps', () => {
  const rows = decodeRows({
    schema: { elements: [{ name: { some: 'a' } }, { name: { some: 'b' } }, { name: { some: 'c' } }] },
    rows: [[[0, { __timestamp_micros_since_unix_epoch__: 5000 }], [1, []], 'x']],
  });
  assert.deepEqual(rows, [{ a: 5000, b: null, c: 'x' }]);
});

test('buildGraph marks overdue concepts and drops dangling edges', () => {
  const now = 10_000_000;
  const g = buildGraph(
    { id: 1, name: 'C', status: 'active', exam_date: null },
    [{ id: 1, name: 'A', summary: '' }, { id: 2, name: 'B', summary: '' }],
    [{ requires_id: 1, concept_id: 2, confidence: 0.9 }, { requires_id: 9, concept_id: 2, confidence: 1 }],
    [{ concept_id: 1, p_mastered: 0.9, attempts: 4, next_review: 5_000_000 * 1000 }],
    now,
  );
  assert.equal(g.edges.length, 1);
  assert.equal(g.nodes[0].due, true);
  assert.equal(g.nodes[0].stage, 'bloom');
  assert.equal(g.nodes[1].depth, 1);
  assert.equal(g.nodes[1].stage, 'seed');
});

import { gameBySlug, normalizeRoom } from './games.ts';

test('room codes normalize to uppercase and reject junk', () => {
  assert.equal(normalizeRoom('ab12'), 'AB12');
  assert.equal(normalizeRoom('abc'), null);
  assert.equal(normalizeRoom('has space'), null);
  assert.equal(normalizeRoom('toolongcode9'), null);
});

test('known games resolve', () => {
  assert.equal(gameBySlug('concept-clash')?.name, 'Concept Clash');
  assert.equal(gameBySlug('nope'), undefined);
});
