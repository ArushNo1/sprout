// URL scheme for live games, shared with the agent that builds the links:
//   /play                 enter a code
//   /play/CODE            join a game (code prefilled)
//   /play/CODE?k=KEY      join as the learner who made it (counts toward mastery)
//   /host/CODE?k=KEY      the host screen
import { GAME_CODE_LENGTH, normalizeCode } from '../../spacetimedb/src/algorithms';

export type Route =
  | { kind: 'play'; code: string | null; key: string | null }
  | { kind: 'host'; code: string; key: string | null };

export function parseRoute(pathname: string, search: string): Route | null {
  const parts = pathname.split('/').filter(Boolean);
  const key = new URLSearchParams(search).get('k')?.trim() || null;
  const code = parts[1] ? normalizeCode(decodeURIComponent(parts[1])) : null;
  if (parts[0] === 'play') return { kind: 'play', code: code || null, key };
  if (parts[0] === 'host' && code) return { kind: 'host', code, key };
  return null;
}

export const looksLikeCode = (code: string) =>
  normalizeCode(code).length === GAME_CODE_LENGTH;

/** Seconds left on a question, from the server's start time. */
export function secondsLeft(
  startedAtMs: number,
  limitSeconds: number,
  nowMs: number
): number {
  const left = Math.ceil((startedAtMs + limitSeconds * 1000 - nowMs) / 1000);
  return Math.min(limitSeconds, Math.max(0, left));
}

/** Players by score, ties broken by who joined first. Rank 1 is the leader. */
export function standings<
  T extends { score: number; joinedAt: { microsSinceUnixEpoch: bigint } },
>(players: readonly T[]): Array<T & { rank: number }> {
  const sorted = [...players].sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.joinedAt.microsSinceUnixEpoch - b.joinedAt.microsSinceUnixEpoch)
  );
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
    return { ...p, rank };
  });
}

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
