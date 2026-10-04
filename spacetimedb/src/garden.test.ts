import { describe, expect, it } from 'vitest';
import {
  conceptDepths,
  daysUntil,
  examCountdown,
  gardenRows,
  plantStage,
} from './garden';

const NOW = Date.UTC(2026, 9, 3, 12);
const tested = (pMastered: number, nextReviewMs?: number | null) => ({
  pMastered,
  attempts: 3,
  nextReviewMs,
});

describe('plantStage', () => {
  it('is a seed with no mastery row or zero attempts, with no percent', () => {
    expect(plantStage(undefined, NOW)).toEqual({
      stage: 'seed',
      tested: false,
      wilted: false,
      percent: null,
    });
    expect(plantStage(null, NOW).stage).toBe('seed');
    // A prior-only row (never answered) is still a seed even with a high prior.
    const prior = { pMastered: 0.8, attempts: 0, nextReviewMs: NOW - 1 };
    expect(plantStage(prior, NOW)).toEqual({
      stage: 'seed',
      tested: false,
      wilted: false,
      percent: null,
    });
  });

  it('grows through the stages at 0.4, 0.7 and 0.95', () => {
    expect(plantStage(tested(0), NOW).stage).toBe('sprout');
    expect(plantStage(tested(0.39), NOW).stage).toBe('sprout');
    expect(plantStage(tested(0.4), NOW).stage).toBe('sapling');
    expect(plantStage(tested(0.69), NOW).stage).toBe('sapling');
    expect(plantStage(tested(0.7), NOW).stage).toBe('budding');
    expect(plantStage(tested(0.949), NOW).stage).toBe('budding');
    expect(plantStage(tested(0.95), NOW).stage).toBe('flowering');
    expect(plantStage(tested(1), NOW).stage).toBe('flowering');
  });

  it('reports a floored percent only for tested concepts', () => {
    expect(plantStage(tested(0.949), NOW).percent).toBe(94);
    expect(plantStage(tested(0.5), NOW).percent).toBe(50);
    expect(plantStage(tested(1.2), NOW)).toMatchObject({
      stage: 'flowering',
      percent: 100,
    });
  });

  it('wilts when the next review is due, not before', () => {
    expect(plantStage(tested(0.8, NOW - 60_000), NOW).wilted).toBe(true);
    expect(plantStage(tested(0.8, NOW), NOW).wilted).toBe(true);
    expect(plantStage(tested(0.8, NOW + 60_000), NOW).wilted).toBe(false);
    expect(plantStage(tested(0.8, null), NOW).wilted).toBe(false);
    expect(plantStage(tested(0.8), NOW).wilted).toBe(false);
  });
});

describe('garden layout', () => {
  const edges = [
    { conceptId: 3n, requiresId: 1n },
    { conceptId: 4n, requiresId: 3n },
    { conceptId: 4n, requiresId: 2n },
    { conceptId: 5n, requiresId: 99n }, // unknown concept: ignored
  ];

  it('puts each concept one row below its deepest prerequisite', () => {
    const d = conceptDepths([1n, 2n, 3n, 4n, 5n], edges);
    expect([1n, 2n, 3n, 4n, 5n].map(id => d.get(id))).toEqual([0, 0, 1, 2, 0]);
    expect(gardenRows([1n, 2n, 3n, 4n, 5n], edges)).toEqual([
      [1n, 2n, 5n],
      [3n],
      [4n],
    ]);
  });

  it('survives a cycle', () => {
    const cyc = [
      { conceptId: 1n, requiresId: 2n },
      { conceptId: 2n, requiresId: 1n },
    ];
    const rows = gardenRows([1n, 2n], cyc);
    expect(rows.flat().sort()).toEqual([1n, 2n]);
  });
});

describe('examCountdown', () => {
  const day = 86_400_000;
  it('counts calendar days', () => {
    expect(daysUntil(NOW + 12 * day, NOW)).toBe(12);
    expect(examCountdown(NOW + 12 * day, NOW)).toBe('Exam in 12 days');
    expect(examCountdown(NOW + day, NOW)).toBe('Exam tomorrow');
    expect(examCountdown(NOW, NOW)).toBe('Exam today');
    expect(examCountdown(NOW - 3 * day, NOW)).toBe('Exam has passed');
  });
});
