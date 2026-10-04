import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardMoves, looksLikeCode, ordinal, parseRoute, secondsLeft, standings } from '../components/play/route.ts';

const at = (n: number) => ({ microsSinceUnixEpoch: BigInt(n) });

test('reads player, host and arcade links', () => {
  assert.deepEqual(parseRoute('/play', ''), { kind: 'play', code: null, key: null });
  assert.deepEqual(parseRoute('/play/abc-234', ''), { kind: 'play', code: 'ABC234', key: null });
  assert.deepEqual(parseRoute('/host/ABC234/', '?k=secret'), { kind: 'host', code: 'ABC234', key: 'secret' });
  assert.deepEqual(parseRoute('/arcade/abc234', '?k=secret'), { kind: 'arcade', code: 'ABC234', key: 'secret' });
  assert.equal(parseRoute('/arcade', ''), null);
  assert.equal(looksLikeCode('abc 234'), true);
  assert.equal(looksLikeCode('abc'), false);
});

test('secondsLeft counts down and clamps', () => {
  assert.equal(secondsLeft(0, 20, 0), 20);
  assert.equal(secondsLeft(0, 20, 5_500), 15);
  assert.equal(secondsLeft(0, 20, 30_000), 0);
  assert.equal(secondsLeft(10_000, 20, 0), 20); // clock ahead of the server
});

test('standings share ranks on ties', () => {
  const ranked = standings([
    { name: 'a', score: 500, joinedAt: at(2) },
    { name: 'b', score: 900, joinedAt: at(3) },
    { name: 'c', score: 500, joinedAt: at(1) },
  ]);
  assert.deepEqual(ranked.map(p => [p.name, p.rank]), [['b', 1], ['c', 2], ['a', 2]]);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
});

test('boardMoves replays the shake-up from one question', () => {
  // Before: Ana 2000, Ben 1500, Cal 1000. Cal scores 1200, Ben 0, Ana 100.
  const players = [
    { id: 1n, name: 'Ana', score: 2100, joinedAt: at(1) },
    { id: 2n, name: 'Ben', score: 1500, joinedAt: at(2) },
    { id: 3n, name: 'Cal', score: 2200, joinedAt: at(3) },
  ];
  const moves = boardMoves(players, new Map([[1n, 100], [3n, 1200]]));
  assert.deepEqual(moves.get(3n), { places: 2, rows: 2, passed: ['Ana', 'Ben'] });
  assert.deepEqual(moves.get(1n), { places: -1, rows: -1, passed: [] });
  assert.deepEqual(moves.get(2n), { places: -1, rows: -1, passed: [] });
});

test('boardMoves: catching up to a tie is not passing', () => {
  const players = [
    { id: 1n, name: 'Ana', score: 1000, joinedAt: at(1) },
    { id: 2n, name: 'Ben', score: 1000, joinedAt: at(2) },
  ];
  const moves = boardMoves(players, new Map([[2n, 1000]]));
  assert.deepEqual(moves.get(2n), { places: 1, rows: 0, passed: [] });
  assert.deepEqual(moves.get(1n), { places: 0, rows: 0, passed: [] });
});
