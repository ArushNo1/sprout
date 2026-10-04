import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import GardenExplorer from '@/components/GardenExplorer';
import GardenOverview from '@/components/GardenOverview';
import { loadGraphs, type CourseGraph } from '@/lib/graph';
import { StdbError } from '@/lib/stdb';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Garden' };

export default async function GardenPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ course?: string }>;
}) {
  const { userId } = await params;
  const { course } = await searchParams;
  const id = encodeURIComponent(userId);

  let graphs: CourseGraph[] | null;
  try {
    graphs = await loadGraphs(userId);
  } catch (err) {
    if (!(err instanceof StdbError)) throw err;
    console.error('garden: database error', err.message);
    return (
      <main className="wrap notfound">
        <h1 className="title">Can&apos;t reach your garden</h1>
        <p className="muted">Sprout&apos;s database isn&apos;t answering. Try again in a minute.</p>
      </main>
    );
  }
  if (!graphs) notFound();

  const live = graphs.filter(g => g.course.status === 'active');
  const shown = live.length > 0 ? live : graphs;
  const picked = shown.find(g => String(g.course.id) === course);

  // Several courses and none picked: the overview. Otherwise straight into the map.
  if (!picked && shown.length > 1) return <GardenOverview graphs={shown} userId={userId} now={Date.now()} />;

  if (shown.length === 0 || shown.every(g => g.nodes.length === 0)) {
    return (
      <main className="wrap notfound">
        <h1 className="title">The beds are ready</h1>
        <p className="muted">Send your syllabus to Sprout in ASI:One and confirm the map. Your garden will grow here.</p>
        <Link className="cta" href={`/${id}`}>Back</Link>
      </main>
    );
  }
  return <GardenExplorer graphs={shown} initialCourse={picked?.course.id ?? shown[0].course.id} />;
}
