import Link from 'next/link';
import { GAMES } from '@/lib/games';

export default async function UserHome({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const id = encodeURIComponent(userId);
  return (
    <>
      <div className="crumbs">Sprout</div>
      <h1>Your garden</h1>
      <div className="grid">
        <Link href={`/${id}/garden`} className="card">
          <strong>Garden</strong>
          <p className="muted">Every concept you study growing as a plant — seeds sprout, grow, bud, and flower as you master each one.</p>
        </Link>
        <Link href={`/${id}/kgraph`} className="card">
          <strong>Knowledge graph</strong>
          <p className="muted">Every concept in your courses, how they connect, and how well you know each one.</p>
        </Link>
        {GAMES.map(g => (
          <div className="card" key={g.slug}>
            <strong>{g.name}</strong> <span className="pill">{g.players}</span>
            <p className="muted">{g.blurb} Rooms open from a link Sprout sends you.</p>
          </div>
        ))}
      </div>
    </>
  );
}
