// All of a learner's courses at a glance. A server component: it only renders links.
import Link from 'next/link';
import { examCountdown, nextUp, sortSummaries, courseSummary } from '@/lib/garden';
import type { CourseGraph } from '@/lib/graph';

export default function GardenOverview({ graphs, userId, now }: { graphs: CourseGraph[]; userId: string; now: number }) {
  const id = encodeURIComponent(userId);
  const summaries = sortSummaries(graphs.map(g => courseSummary(g, now)));
  const upNext = nextUp(graphs, now);

  return (
    <div className="garden-page">
      <div className="garden-header">
        <h1 className="garden-title">Your gardens</h1>
        <p className="garden-subtitle">{summaries.length} courses, soonest exam first</p>
      </div>

      {upNext.length > 0 && (
        <section className="ov-next" aria-label="Due for review">
          <h2 className="ov-h">Due for review</h2>
          <ul>
            {upNext.map(u => (
              <li key={`${u.courseId}-${u.concept}`}>
                <Link href={`/${id}/garden?course=${u.courseId}`}>
                  <strong>{u.concept}</strong>
                  <span className="muted"> · {u.course} · {u.percent}%{u.days !== null ? ` · exam in ${u.days}d` : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ov-grid">
        {summaries.map(s => {
          const pct = (n: number) => `${s.total ? (n / s.total) * 100 : 0}%`;
          return (
            <Link key={s.id} className="ov-card" href={`/${id}/garden?course=${s.id}`}>
              <h2 className="ov-name">{s.name}</h2>
              <p className="muted">{s.examMs !== null ? examCountdown(s.examMs, now) : 'No exam date'}</p>
              <dl className="garden-stats__row">
                <div><dt>solid</dt><dd>{s.solid}<span className="garden-stats__of"> of {s.total}</span></dd></div>
                <div><dt>tested</dt><dd>{s.tested}</dd></div>
                <div><dt>due</dt><dd className={s.due ? 'ov-due' : undefined}>{s.due}</dd></div>
              </dl>
              <div className="garden-track" role="img" aria-label={`${s.tested} of ${s.total} tested, ${s.solid} solid`}>
                <div className="garden-track__tested" style={{ width: pct(s.tested) }} />
                <div className="garden-track__solid" style={{ width: pct(s.solid) }} />
              </div>
              {s.weakest && <p className="muted ov-weak">Weakest: {s.weakest.name} ({s.weakest.percent}%)</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
