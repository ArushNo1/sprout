import { describe, expect, it } from 'vitest';
import { looksLikeCode, ordinal, parseRoute, secondsLeft, standings } from './play/route';

describe('parseRoute', () => {
  it('reads player and host links', () => {
    expect(parseRoute('/play', '')).toEqual({ kind: 'play', code: null, key: null });
    expect(parseRoute('/play/abc-234', '')).toEqual({ kind: 'play', code: 'ABC234', key: null });
    expect(parseRoute('/play/ABC234', '?k=secret')).toEqual({ kind: 'play', code: 'ABC234', key: 'secret' });
    expect(parseRoute('/host/ABC234/', '?k=secret')).toEqual({ kind: 'host', code: 'ABC234', key: 'secret' });
  });

  it('leaves other paths to the garden', () => {
    expect(parseRoute('/', '?u=agent1x')).toBeNull();
    expect(parseRoute('/host', '')).toBeNull();
  });

  it('checks code length', () => {
    expect(looksLikeCode('abc 234')).toBe(true);
    expect(looksLikeCode('abc')).toBe(false);
  });
});

describe('secondsLeft', () => {
  it('counts down and clamps', () => {
    expect(secondsLeft(0, 20, 0)).toBe(20);
    expect(secondsLeft(0, 20, 5_500)).toBe(15);
    expect(secondsLeft(0, 20, 30_000)).toBe(0);
    expect(secondsLeft(10_000, 20, 0)).toBe(20); // clock ahead of the server
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
    expect(ranked.map(p => [p.name, p.rank])).toEqual([['b', 1], ['c', 2], ['a', 2]]);
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd',
    ]);
  });
});
