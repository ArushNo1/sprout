import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { gameBySlug, normalizeRoom } from '@/lib/games';
import { lit, sql } from '@/lib/stdb';

type Params = { userId: string; game: string; room: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { game, room } = await params;
  return { title: `${gameBySlug(game)?.name ?? 'Game'} ${normalizeRoom(room) ?? ''}`.trim() };
}

// A room code that's a live game in SpacetimeDB goes straight to it; anything
// else shows the placeholder lobby.
async function liveRoom(code: string): Promise<string | null> {
  try {
    const [row] = await sql(`SELECT mode, status FROM game WHERE code = ${lit(code)}`);
    if (!row || row.status === 'finished') return null;
    return row.mode === 'arcade' ? `/arcade/${code}` : `/play/${code}`;
  } catch {
    return null;
  }
}

export default async function GameRoom({ params }: { params: Promise<Params> }) {
  const { userId, game: slug, room } = await params;
  const game = gameBySlug(slug);
  const code = normalizeRoom(room);
  if (!game || !code) notFound();
  if (code !== room) redirect(`/${encodeURIComponent(userId)}/${slug}/${code}`);
  const live = await liveRoom(code);
  if (live) redirect(live);

  return (
    <>
      <div className="crumbs">
        <Link href={`/${encodeURIComponent(userId)}`}>Sprout</Link> / {game.name}
      </div>
      <h1>{game.name}</h1>
      <p className="muted">{game.blurb}</p>
      <div className="card">
        <p>Room code</p>
        <h1 style={{ letterSpacing: '0.2em' }}>{code}</h1>
        <p className="muted">Playing as <code>{userId.slice(0, 18)}{userId.length > 18 ? '…' : ''}</code></p>
        <span className="pill">Lobby coming soon</span>
      </div>
    </>
  );
}
