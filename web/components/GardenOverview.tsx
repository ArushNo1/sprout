// All of a learner's courses at a glance. A server component: it only renders links.
import Link from 'next/link';
import Plant, { STAGE_TOP } from '@/components/Plant';
import { courseSummary, examCountdown, sortSummaries } from '@/lib/garden';
import type { CourseGraph } from '@/lib/graph';

const MAX_PLANTS = 9;

export default function GardenOverview({ graphs, userId, now }: { graphs: CourseGraph[]; userId: string; now: number }) {
  const id = encodeURIComponent(userId);
  const summaries = sortSummaries(graphs.map(g => courseSummary(g, now)));

  return (
    <main className="wrap">
      <div className="ov-head">
        <p className="crumbs"><Link href={`/${id}`}>Sprout</Link> / Garden</p>
        <h1 className="title">Your gardens</h1>
        <p className="eyebrow">{summaries.length} courses, soonest exam first</p>
      </div>

      <div className="ov-grid">
        {summaries.map(s => {
          const pct = (n: number) => `${s.total ? (n / s.total) * 100 : 0}%`;
          const shown = s.stages.slice(0, MAX_PLANTS);
          return (
            <Link key={s.id} className="ov-card panel" href={`/${id}/garden?course=${s.id}`}>
              <h2 className="ov-name">{s.name}</h2>
              <p className="muted">{s.examMs !== null ? examCountdown(s.examMs, now) : 'No exam date'}</p>
              <div className="ov-row" aria-hidden="true">
                {shown.map((p, i) => <Plant key={i} stage={p.stage} wilted={p.wilted} size={40} top={STAGE_TOP[p.stage]} />)}
                {s.stages.length > shown.length && <span className="muted">+{s.stages.length - shown.length}</span>}
              </div>
              <dl className="ov-stats">
                <div><dt>solid</dt><dd>{s.solid}<span className="of"> of {s.total}</span></dd></div>
                <div><dt>tested</dt><dd>{s.tested}</dd></div>
                <div><dt>due</dt><dd className={s.due ? 'ov-due' : undefined}>{s.due}</dd></div>
              </dl>
              <div className="track" role="img" aria-label={`${s.tested} of ${s.total} tested, ${s.solid} solid`}>
                <i className="t1" style={{ width: pct(s.tested) }} /><i className="t2" style={{ width: pct(s.solid) }} />
              </div>
              {s.weakest && <p className="muted ov-weak">Weakest: {s.weakest.name} ({s.weakest.percent}%)</p>}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
