import { describe, expect, it } from 'vitest';
import {
  bktUpdate,
  learnRateFor,
  clampBktParam,
  pickNextConcept,
  sm2Update,
  SM2_INITIAL,
  thompsonPick,
  wouldCreateCycle,
} from '../spacetimedb/src/algorithms';

const params = { learn: 0.15, slip: 0.1, guess: 0.25 };

// Deterministic uniform RNG (mulberry32).
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('bktUpdate', () => {
  it('matches the plan formula for a correct answer from the default prior', () => {
    // posterior = .2*.9 / (.2*.9 + .8*.25) = .4737; + (1-.4737)*.15
    expect(bktUpdate(0.2, true, params)).toBeCloseTo(0.5526, 3);
  });

  it('drops mastery on a wrong answer and rises on a right one', () => {
    expect(bktUpdate(0.8, false, params)).toBeLessThan(0.8);
    expect(bktUpdate(0.5, true, params)).toBeGreaterThan(0.5);
  });

  it('stays within [0, 1]', () => {
    expect(bktUpdate(0, false, params)).toBeGreaterThanOrEqual(0);
    expect(bktUpdate(1, true, params)).toBeLessThanOrEqual(1);
  });
});

describe('clampBktParam', () => {
  it('passes ordinary fitted values through', () => {
    expect(clampBktParam('pInit', 0.3)).toBe(0.3);
    expect(clampBktParam('pLearn', 0.12)).toBe(0.12);
    expect(clampBktParam('pSlip', 0.08)).toBe(0.08);
    expect(clampBktParam('pGuess', 0.2)).toBe(0.2);
  });

  it('keeps slip and guess below 0.5', () => {
    expect(clampBktParam('pSlip', 0.7)).toBe(0.499);
    expect(clampBktParam('pGuess', 0.5)).toBe(0.499);
    expect(clampBktParam('pLearn', 0.7)).toBe(0.7);
  });

  it('keeps every parameter off the hard 0/1 edges', () => {
    expect(clampBktParam('pInit', 0)).toBe(0.001);
    expect(clampBktParam('pLearn', 1)).toBe(0.999);
    expect(clampBktParam('pGuess', 0)).toBe(0.001);
  });

  it('rejects values that are not probabilities', () => {
    for (const v of [-0.1, 1.5, NaN, Infinity])
      expect(clampBktParam('pInit', v)).toBeNull();
  });
});

describe('sm2Update', () => {
  it('grows intervals 1, 6, then by ease', () => {
    const a = sm2Update(SM2_INITIAL, 5);
    const b = sm2Update(a, 5);
    const c = sm2Update(b, 5);
    expect([a.intervalDays, b.intervalDays]).toEqual([1, 6]);
    expect(c.intervalDays).toBeGreaterThan(6);
  });

  it('resets on a lapse and never lets ease fall below 1.3', () => {
    const lapsed = sm2Update({ ease: 1.3, intervalDays: 20, repetitions: 5 }, 0);
    expect(lapsed).toMatchObject({ intervalDays: 1, repetitions: 0 });
    expect(lapsed.ease).toBe(1.3);
  });
});

describe('thompsonPick', () => {
  it('mostly plays the arm with the better record', () => {
    const arms = [
      { format: 'worked_example', alpha: 20, beta: 3 },
      { format: 'flashcards', alpha: 3, beta: 20 },
    ];
    const r = rng(1);
    const wins = Array.from({ length: 200 }, () => thompsonPick(arms, r)).filter(
      f => f === 'worked_example'
    ).length;
    expect(wins).toBeGreaterThan(190);
  });

  it('still explores when arms are untested', () => {
    const arms = [
      { format: 'a', alpha: 1, beta: 1 },
      { format: 'b', alpha: 1, beta: 1 },
    ];
    const r = rng(2);
    const picks = new Set(Array.from({ length: 50 }, () => thompsonPick(arms, r)));
    expect(picks.size).toBe(2);
  });
});

describe('graph', () => {
  const edge = (conceptId: bigint, requiresId: bigint) => ({ conceptId, requiresId });

  it('detects direct and transitive cycles', () => {
    const edges = [edge(2n, 1n), edge(3n, 2n)]; // 3 -> 2 -> 1
    expect(wouldCreateCycle(edges, 1n, 3n)).toBe(true);
    expect(wouldCreateCycle(edges, 1n, 1n)).toBe(true);
    expect(wouldCreateCycle(edges, 3n, 1n)).toBe(false);
  });

  it('picks the weakest concept whose prerequisites are solid', () => {
    const concepts = [
      { id: 1n, p: 0.5 }, // root, shaky
      { id: 2n, p: 0.1 }, // weakest, but blocked by 1
      { id: 3n, p: 0.9 }, // solid root
      { id: 4n, p: 0.3 }, // requires 3 (solid) -> eligible
    ];
    const edges = [edge(2n, 1n), edge(4n, 3n)];
    expect(pickNextConcept(concepts, edges)).toBe(4n);
  });

  it('returns null when everything is mastered and falls back on a blocked graph', () => {
    expect(pickNextConcept([{ id: 1n, p: 0.99 }], [])).toBeNull();
    const cyc = [edge(1n, 2n), edge(2n, 1n)];
    expect(
      pickNextConcept([{ id: 1n, p: 0.4 }, { id: 2n, p: 0.2 }], cyc)
    ).toBe(2n);
  });
});

describe('learnRateFor', () => {
  it('gives a diagnostic answer no credit for learning, since nothing was taught', () => {
    expect(learnRateFor('diagnostic', 0.15)).toBe(0);
    for (const kind of ['check', 'practice', 'review', 'game']) expect(learnRateFor(kind, 0.15)).toBe(0.15);
  });

  it('so one lucky diagnostic guess moves mastery less, and a miss counts', () => {
    const lucky = bktUpdate(0.2, true, { ...params, learn: learnRateFor('diagnostic', params.learn) });
    const taught = bktUpdate(0.2, true, params);
    expect(lucky).toBeCloseTo(0.4737, 3);
    expect(taught).toBeCloseTo(0.5526, 3);
    const miss = bktUpdate(0.2, false, { ...params, learn: learnRateFor('diagnostic', params.learn) });
    expect(miss).toBeLessThan(0.05);
  });
});
