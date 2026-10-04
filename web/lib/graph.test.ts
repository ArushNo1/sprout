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

import { courseSummary, nextUp, sortSummaries } from './garden.ts';

const node = (id: number, name: string, mastery: number, attempts: number, due = false) =>
  ({ id, name, summary: '', depth: 0, mastery, attempts, stage: 'sprout' as const, due, nextReview: null });
const course = (id: number, name: string, nodes: ReturnType<typeof node>[], examDays: number | null, now: number) => ({
  course: { id, name, status: 'active', examDate: examDays === null ? null : now + examDays * 86_400_000 },
  nodes, edges: [],
});

test('course summary counts only tested concepts and never calls an untested one weak', () => {
  const now = 1_800_000_000_000;
  const s = courseSummary(course(1, 'A', [node(1, 'x', 0.9, 3), node(2, 'y', 0.3, 2, true), node(3, 'z', 0.2, 0)], 5, now), now);
  assert.deepEqual([s.total, s.tested, s.solid, s.due, s.days], [3, 2, 1, 1, 5]);
  assert.deepEqual(s.weakest, { name: 'y', percent: 30 });
});

test('courses sort by exam, no-exam last', () => {
  const now = 1_800_000_000_000;
  const list = [course(1, 'B', [], null, now), course(2, 'A', [], 9, now), course(3, 'C', [], 2, now)]
    .map(g => courseSummary(g, now));
  assert.deepEqual(sortSummaries(list).map(s => s.name), ['C', 'A', 'B']);
});

test('next up lists due concepts across courses, soonest exam first', () => {
  const now = 1_800_000_000_000;
  const g = [
    course(1, 'Far', [node(1, 'a', 0.5, 2, true)], 20, now),
    course(2, 'Near', [node(2, 'b', 0.6, 2, true), node(3, 'c', 0.1, 2, true), node(4, 'd', 0.1, 0, true)], 2, now),
  ];
  assert.deepEqual(nextUp(g, now).map(u => u.concept), ['c', 'b', 'a']); // untested 'd' is not "due"
});
