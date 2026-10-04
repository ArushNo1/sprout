import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@/lib/module_bindings';
import { boardMoves, standings, type Move } from '@/components/play/route';

export function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Everything one game screen needs, live from SpacetimeDB. */
export function useGame(code: string) {
  const { identity, isActive, connectionError } = useSpacetimeDB();
  const [games, gamesReady] = useTable(tables.game.where(r => r.code.eq(code)));
  // A subscription that never answers (say, the database is mid-update) shouldn't spin forever.
  // Maincloud's first connection can take ~15 s, so give it twice that.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (gamesReady) return;
    const id = setTimeout(() => setStalled(true), 30_000);
    return () => clearTimeout(id);
  }, [gamesReady]);
  const game = games[0];
  const gameId = game?.id ?? 0n;
  const enabled = { enabled: !!game };
  const [questionRows] = useTable(
    tables.gameQuestion.where(r => r.gameId.eq(gameId)),
    enabled
  );
  const [players] = useTable(tables.player.where(r => r.gameId.eq(gameId)), enabled);
  const [answers] = useTable(
    tables.playerAnswer.where(r => r.gameId.eq(gameId)),
    enabled
  );

  const questions = useMemo(
    () => [...questionRows].sort((a, b) => a.index - b.index),
    [questionRows]
  );
  const ranked = useMemo(() => standings(players), [players]);
  const me = identity ? ranked.find(p => p.identity.isEqual(identity)) : undefined;
  const question = game ? questions[game.questionIndex] : undefined;
  const answersNow = game
    ? answers.filter(a => a.questionIndex === game.questionIndex)
    : [];
  const myAnswer = me ? answersNow.find(a => a.playerId === me.id) : undefined;
  const isHost = !!(identity && game?.hostIdentity?.isEqual(identity));

  // How the board moved on the question just revealed.
  const moves = useMemo(
    () =>
      game?.status === 'reveal'
        ? boardMoves(players, new Map(answersNow.map(a => [a.playerId, a.points])))
        : new Map<bigint, Move>(),
    [game?.status, answersNow, players]
  );

  // The crowd on this question, from the published reveal counts.
  const crowd = useMemo(() => {
    if (!question || question.correctIndex === undefined) return undefined;
    const total = question.choiceCounts.reduce((n, c) => n + c, 0);
    const right = question.choiceCounts[question.correctIndex] ?? 0;
    const fastest = answersNow
      .filter(a => a.correct === true)
      .sort((a, b) => a.answeredMs - b.answeredMs)[0];
    const fastestName = fastest && ranked.find(p => p.id === fastest.playerId)?.name;
    return { total, right, fastest: fastest && fastestName ? { name: fastestName, ms: fastest.answeredMs } : undefined };
  }, [question, answersNow, ranked]);

  return {
    identity,
    isActive,
    connectionError,
    ready: gamesReady,
    stalled,
    game,
    questions,
    question,
    ranked,
    me,
    answers,
    answersNow,
    myAnswer,
    isHost,
    moves,
    crowd,
  };
}

export type GameState = ReturnType<typeof useGame>;
export type { Move };

export type Growth = {
  conceptId: bigint;
  name: string;
  before: number;
  after: number;
  correct: number;
  attempts: number;
};

/**
 * What a linked player's game answers did to their Sprout mastery, live. The
 * server runs BKT on each answer (see `recordGameAttempt`) and writes an
 * `attempt` row; subscribing to those rows means the garden visibly moves the
 * moment a question is revealed, on every screen watching.
 */
export function useGrowth(
  learnerAddress: string | undefined,
  courseId: bigint | undefined,
  sinceMicros: bigint | undefined
) {
  const on = !!learnerAddress && courseId !== undefined;
  const [attempts] = useTable(
    tables.attempt.where(r => r.userAddress.eq(learnerAddress ?? '')),
    { enabled: on }
  );
  const names = useConceptNames(on ? courseId : undefined);

  return useMemo(() => {
    const mine = attempts
      .filter(
        a =>
          a.kind === 'game' &&
          a.courseId === courseId &&
          sinceMicros !== undefined &&
          a.createdAt.microsSinceUnixEpoch >= sinceMicros
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const by = new Map<bigint, Growth>();
    for (const a of mine) {
      const g = by.get(a.conceptId);
      if (g) {
        g.after = a.pAfter;
        g.attempts++;
        g.correct += a.correct ? 1 : 0;
      } else
        by.set(a.conceptId, {
          conceptId: a.conceptId,
          name: names.get(a.conceptId) ?? 'A concept',
          before: a.pBefore,
          after: a.pAfter,
          correct: a.correct ? 1 : 0,
          attempts: 1,
        });
    }
    const latest = mine[mine.length - 1];
    return {
      list: [...by.values()].sort((a, b) => b.after - b.before - (a.after - a.before)),
      latest: latest && {
        conceptId: latest.conceptId,
        name: names.get(latest.conceptId) ?? 'A concept',
        before: latest.pBefore,
        after: latest.pAfter,
        at: latest.createdAt.microsSinceUnixEpoch,
      },
    };
  }, [attempts, names, courseId, sinceMicros]);
}

/** Concept names for a course, for recaps. */
export function useConceptNames(courseId: bigint | undefined) {
  const [concepts] = useTable(
    tables.concept.where(r => r.courseId.eq(courseId ?? 0n)),
    { enabled: courseId !== undefined }
  );
  return useMemo(() => new Map(concepts.map(c => [c.id, c.name])), [concepts]);
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export const startedMs = (game: NonNullable<GameState['game']>) =>
  game.questionStartedAt
    ? Number(game.questionStartedAt.microsSinceUnixEpoch / 1000n)
    : Date.now();

export function errorText(e: unknown) {
  const text = e instanceof Error ? e.message : String(e);
  return text.replace(/^SenderError:\s*/, '') || 'Something went wrong';
}
