import { describe, expect, it } from 'vitest';
import {
  GAME_CODE_ALPHABET,
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
