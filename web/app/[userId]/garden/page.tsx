import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import GardenOverview from '@/components/GardenOverview';
import GardenView from '@/components/GardenView';
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
      <div className="empty">
        <h1>Can&apos;t reach your garden</h1>
        <p className="muted">Sprout&apos;s database isn&apos;t answering. Try again in a minute.</p>
      </div>
    );
  }
  if (!graphs) notFound();

  // Several courses and none picked: show them all. One course (or one picked): straight to its garden.
  const live = graphs.filter(g => g.course.status === 'active');
  if (!course && live.length > 1) {
    return (
      <>
        <div className="crumbs">
          <Link href={`/${id}`}>Sprout</Link> / Garden
        </div>
        <GardenOverview graphs={live} userId={userId} now={Date.now()} />
      </>
    );
  }

  const active = graphs.find(g => String(g.course.id) === course) ?? graphs.find(g => g.course.status === 'active') ?? graphs[0];

  return (
    <>
      <div className="crumbs">
        <Link href={`/${id}`}>Sprout</Link> / Garden
      </div>
      {!active || active.nodes.length === 0 ? (
        <div className="empty card">
          <p>No concepts yet.</p>
          <p className="muted">Send your syllabus to Sprout in ASI:One and confirm the map. It will grow here.</p>
        </div>
      ) : (
        <>
          {graphs.length > 1 && (
            <nav className="tabs" aria-label="Courses">
              <Link className="tab" href={`/${id}/garden`}>All courses</Link>
              {graphs.map(g => (
                <Link
                  key={g.course.id}
                  className="tab"
                  href={`/${id}/garden?course=${g.course.id}`}
                  aria-current={g.course.id === active.course.id ? 'page' : undefined}
                >
                  {g.course.name}
                </Link>
              ))}
            </nav>
          )}
          <GardenView key={active.course.id} graph={active} />
        </>
      )}
    </>
  );
}
