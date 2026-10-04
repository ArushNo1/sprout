import { describe, expect, it } from 'vitest';
import {
  GAME_CODE_ALPHABET,
  arcadeStep,
  GAME_CODE_LENGTH,
  cleanPlayerName,
  gameCode,
  normalizeCode,
  scorePoints,
} from '../spacetimedb/src/algorithms';

describe('scorePoints', () => {
  it('pays 1000 for an instant correct answer and 500 at the buzzer', () => {
    expect(scorePoints(true, 0, 20_000, 1)).toBe(1000);
    expect(scorePoints(true, 20_000, 20_000, 1)).toBe(500);
    expect(scorePoints(true, 10_000, 20_000, 1)).toBe(750);
  });

  it('pays nothing for a wrong answer, however fast', () => {
    expect(scorePoints(false, 0, 20_000, 5)).toBe(0);
  });

  it('adds 100 per answer in a row after the first, capped at 500', () => {
    expect(scorePoints(true, 0, 20_000, 2)).toBe(1100);
    expect(scorePoints(true, 0, 20_000, 6)).toBe(1500);
    expect(scorePoints(true, 0, 20_000, 30)).toBe(1500);
  });

  it('clamps answers that arrive after the limit to the minimum', () => {
    expect(scorePoints(true, 25_000, 20_000, 1)).toBe(500);
  });
});

describe('join codes', () => {
  it('builds a code of the right length from unambiguous characters', () => {
    let i = 0;
    const code = gameCode(n => i++ % n);
    expect(code).toHaveLength(GAME_CODE_LENGTH);
    for (const ch of code) expect(GAME_CODE_ALPHABET).toContain(ch);
    expect(GAME_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it('normalizes what players type', () => {
    expect(normalizeCode(' abc-def ')).toBe('ABCDEF');
  });
});

describe('cleanPlayerName', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(cleanPlayerName('  Ada   Lovelace ')).toBe('Ada Lovelace');
    expect(cleanPlayerName('x'.repeat(40))).toHaveLength(20);
  });

  it('rejects names with nothing left', () => {
    expect(cleanPlayerName('   ')).toBeNull();
  });
});

describe('arcadeStep', () => {
  const fresh = { score: 0, streak: 0, answered: [] as number[] };

  it('scores a run and keeps the larger of the old best and the run total', () => {
    const a = arcadeStep(fresh, 0, true, 0);
    expect(a).toMatchObject({ points: 1000, best: 1000, counted: true });
    const b = arcadeStep(a.run, 1, true, a.best);
    expect(b).toMatchObject({ points: 1100, best: 2100 });
  });

  it('ignores a repeat of the same question within a run', () => {
    const a = arcadeStep(fresh, 0, true, 0);
    expect(arcadeStep(a.run, 0, true, a.best)).toMatchObject({ counted: false, points: 0, best: 1000 });
  });

  it('a worse replay leaves the best alone, a better one raises it', () => {
    const bad = arcadeStep(fresh, 0, false, 4200);
    expect(bad).toMatchObject({ points: 0, best: 4200, counted: true });
    const run = { score: 4000, streak: 3, answered: [0, 1, 2] };
    expect(arcadeStep(run, 3, true, 4200).best).toBe(4000 + 1300);
  });
});
