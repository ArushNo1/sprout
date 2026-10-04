import Link from 'next/link';
import { GAMES } from '@/lib/games';

export default async function UserHome({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const id = encodeURIComponent(userId);
  return (
    <main className="wrap">
      <p className="eyebrow">Welcome back</p>
      <h1 className="title">Your garden</h1>
      <div className="tiles">
        <Link href={`/${id}/garden`} className="tile panel">
          <h2>Garden</h2>
          <p>Every concept you study as a plant. Seeds sprout, bud and flower as you master them, and wilt when a review is due.</p>
        </Link>
        {GAMES.map(g => (
          <div className="tile panel" key={g.slug}>
            <h2>{g.name}<span className="chip chip--tag">{g.players}</span></h2>
            <p>{g.blurb} Rooms open from a link Sprout sends you.</p>
          </div>
        ))}
      </div>
    </main>
  );
}
