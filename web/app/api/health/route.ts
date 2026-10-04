import { sql } from '@/lib/stdb';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Tells the Sprout agents this site is up and which database it reads, so they only link here
// when gardens and games will actually work. Returns no learner data.
export async function GET() {
  // Garden pages read on the server; the game pages connect from the browser. Both must agree.
  const pages = process.env.SPACETIMEDB_DB || 'sprout-live';
  const games = process.env.NEXT_PUBLIC_SPACETIMEDB_DB || 'sprout-live';
  if (pages !== games)
    return NextResponse.json({ ok: false, db: pages, error: `games use ${games}` }, { status: 503 });
  try {
    await sql('SELECT id FROM course LIMIT 1');
    return NextResponse.json({ ok: true, db: pages });
  } catch (err) {
    return NextResponse.json({ ok: false, db: pages, error: (err as Error).message }, { status: 503 });
  }
}
