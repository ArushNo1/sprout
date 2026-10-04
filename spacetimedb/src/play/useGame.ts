import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { standings } from './route';

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
    answersNow,
    myAnswer,
    isHost,
  };
}

export type GameState = ReturnType<typeof useGame>;

export const startedMs = (game: NonNullable<GameState['game']>) =>
  game.questionStartedAt
    ? Number(game.questionStartedAt.microsSinceUnixEpoch / 1000n)
    : Date.now();

export function errorText(e: unknown) {
  const text = e instanceof Error ? e.message : String(e);
  return text.replace(/^SenderError:\s*/, '') || 'Something went wrong';
}
