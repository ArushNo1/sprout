// URL scheme for live games, shared with the agent that builds the links:
//   /play                 enter a code
//   /play/CODE            join a game (code prefilled)
//   /play/CODE?k=KEY      join as the learner who made it (counts toward mastery)
//   /host/CODE?k=KEY      the host screen
//   /arcade/CODE(?k=KEY)  an arcade game (same join rules as /play)
import { GAME_CODE_LENGTH, normalizeCode } from '@/lib/algorithms';

export type Route =
  | { kind: 'play'; code: string | null; key: string | null }
  | { kind: 'host'; code: string; key: string | null }
  | { kind: 'arcade'; code: string; key: string | null };

export function parseRoute(pathname: string, search: string): Route | null {
  const parts = pathname.split('/').filter(Boolean);
  const key = new URLSearchParams(search).get('k')?.trim() || null;
  const code = parts[1] ? normalizeCode(decodeURIComponent(parts[1])) : null;
  if (parts[0] === 'play') return { kind: 'play', code: code || null, key };
  if (parts[0] === 'host' && code) return { kind: 'host', code, key };
  if (parts[0] === 'arcade' && code) return { kind: 'arcade', code, key };
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

/** Places gained (negative: lost), list rows moved, and who was overtaken. */
export type Move = { places: number; rows: number; passed: string[] };

/**
 * How the board moved on one question: rebuild everyone's standing before its
 * points landed and compare. Every screen derives this from the same rows.
 */
export function boardMoves<
  T extends { id: bigint; name: string; score: number; joinedAt: { microsSinceUnixEpoch: bigint } },
>(players: readonly T[], earned: ReadonlyMap<bigint, number>): Map<bigint, Move> {
  const now = standings(players);
  const before = standings(players.map(p => ({ ...p, score: p.score - (earned.get(p.id) ?? 0) })));
  const was = new Map(before.map((p, i) => [p.id, { rank: p.rank, pos: i }]));
  const out = new Map<bigint, Move>();
  now.forEach((p, i) => {
    const b = was.get(p.id)!;
    out.set(p.id, {
      places: b.rank - p.rank,
      rows: b.pos - i,
      passed: now.filter(o => was.get(o.id)!.pos < b.pos && o.rank > p.rank).map(o => o.name),
    });
  });
  return out;
}

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
