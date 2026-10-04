import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksLikeCode, ordinal, parseRoute, secondsLeft, standings } from './route.ts';

describe('parseRoute', () => {
  it('reads player and host links', () => {
    assert.deepEqual(parseRoute('/play', ''), { kind: 'play', code: null, key: null });
    assert.deepEqual(parseRoute('/play/abc-234', ''), { kind: 'play', code: 'ABC234', key: null });
    assert.deepEqual(parseRoute('/play/ABC234', '?k=secret'), { kind: 'play', code: 'ABC234', key: 'secret' });
    assert.deepEqual(parseRoute('/host/ABC234/', '?k=secret'), { kind: 'host', code: 'ABC234', key: 'secret' });
  });

  it('reads arcade links', () => {
    assert.deepEqual(parseRoute('/arcade/abc234', '?k=secret'), { kind: 'arcade', code: 'ABC234', key: 'secret' });
    assert.equal(parseRoute('/arcade', ''), null);
  });

  it('leaves other paths to the garden', () => {
    assert.equal(parseRoute('/', '?u=agent1x'), null);
    assert.equal(parseRoute('/host', ''), null);
  });

  it('checks code length', () => {
    assert.equal(looksLikeCode('abc 234'), true);
    assert.equal(looksLikeCode('abc'), false);
  });
});

describe('secondsLeft', () => {
  it('counts down and clamps', () => {
    assert.equal(secondsLeft(0, 20, 0), 20);
    assert.equal(secondsLeft(0, 20, 5_500), 15);
    assert.equal(secondsLeft(0, 20, 30_000), 0);
    assert.equal(secondsLeft(10_000, 20, 0), 20); // clock ahead of the server
  });
});

describe('standings', () => {
  const at = (n: number) => ({ microsSinceUnixEpoch: BigInt(n) });
  it('ranks by score and shares ranks on ties', () => {
    const ranked = standings([
      { name: 'a', score: 500, joinedAt: at(2) },
      { name: 'b', score: 900, joinedAt: at(3) },
      { name: 'c', score: 500, joinedAt: at(1) },
    ]);
    assert.deepEqual(ranked.map(p => [p.name, p.rank]), [['b', 1], ['c', 2], ['a', 2]]);
  });

  it('writes ordinals', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), [
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd',
    ]);
  });
});
