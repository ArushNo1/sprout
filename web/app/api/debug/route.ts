import { sql } from '@/lib/stdb';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const learners = await sql('SELECT * FROM learner LIMIT 5');
    const courses  = await sql('SELECT * FROM course  LIMIT 5');
    return NextResponse.json({ ok: true, learners, courses });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
