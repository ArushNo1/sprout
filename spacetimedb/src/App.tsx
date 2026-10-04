import './App.css';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import Plant, { STAGE_TOP, STAGE_WORDS } from './Plant';
import {
  examCountdown,
  gardenRows,
  isSolid,
  plantStage,
  type GardenEdge,
  type PlantMastery,
  type PlantState,
  type Stage,
} from './garden';

type Params = { address: string | null; courseId: bigint | null };

function readParams(): Params {
  const q = new URLSearchParams(window.location.search);
  const address = q.get('u')?.trim() || null;
  let courseId: bigint | null = null;
  const raw = q.get('course')?.trim();
  if (raw && /^\d+$/.test(raw)) courseId = BigInt(raw);
  return { address, courseId };
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export default function App() {
  const { address, courseId } = useMemo(readParams, []);
  if (!address) {
    return (
      <Shell>
        <Message title="Your garden grows in the chat">
          Each concept you study with Sprout becomes a plant here. Ask Sprout in
          ASI:One for your garden and it will send you a link that opens your
          own.
        </Message>
      </Shell>
    );
  }
  return <Garden address={address} requestedCourse={courseId} />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <div className="brand">
        <span className="brand__word">sprout</span>
      </div>
      {children}
    </div>
  );
}

function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="message">
      <Plant stage="seed" size={120} top={STAGE_TOP.seed} />
      <h1 className="message__title">{title}</h1>
      {children && <p className="message__body">{children}</p>}
    </section>
  );
}

function Garden({
  address,
  requestedCourse,
}: {
  address: string;
  requestedCourse: bigint | null;
}) {
  const { isActive, connectionError } = useSpacetimeDB();
  const now = useNow(60_000);

  const [learners] = useTable(tables.learner.where(r => r.address.eq(address)));
  const [courses, coursesReady] = useTable(
    tables.course.where(r => r.userAddress.eq(address))
  );
  const [masteryRows] = useTable(
    tables.mastery.where(r => r.userAddress.eq(address))
  );

  const course = useMemo(() => {
    const newest = (a: (typeof courses)[number], b: (typeof courses)[number]) =>
      Number(
        b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch
      );
    if (requestedCourse !== null) {
      const hit = courses.find(c => c.id === requestedCourse);
      if (hit) return hit;
    }
    const active = courses.filter(c => c.status === 'active').sort(newest);
    return active[0] ?? [...courses].sort(newest)[0];
  }, [courses, requestedCourse]);

  const courseId = course?.id ?? 0n;
  const [concepts, conceptsReady] = useTable(
    tables.concept.where(r => r.courseId.eq(courseId)),
    { enabled: !!course }
  );
  const [prereqRows] = useTable(
    tables.prerequisite.where(r => r.courseId.eq(courseId)),
    { enabled: !!course }
  );

  const learner = learners[0];

  if (!coursesReady) {
    if (connectionError && !isActive) {
      return (
        <Shell>
          <Message title="The garden is out of reach">
            Sprout couldn't connect just now. Check your connection and reload
            the page.
          </Message>
        </Shell>
      );
    }
    return (
      <Shell>
        <p className="loading">Walking out to the garden…</p>
      </Shell>
    );
  }

  if (!course) {
    return (
      <Shell>
        <Message title="Nothing planted yet">
          Tell Sprout what you're studying in the chat and your course will take
          root here.
        </Message>
      </Shell>
    );
  }

  const masteryByConcept = new Map<bigint, PlantMastery>();
  for (const m of masteryRows) {
    if (m.courseId !== course.id) continue;
    masteryByConcept.set(m.conceptId, {
      pMastered: m.pMastered,
      attempts: m.attempts,
      nextReviewMs: m.nextReview ? m.nextReview.toDate().getTime() : null,
    });
  }
  const plants = new Map<bigint, PlantState>(
    concepts.map(c => [c.id, plantStage(masteryByConcept.get(c.id), now)])
  );
  const total = concepts.length;
  const tested = [...plants.values()].filter(p => p.tested).length;
  const solid = concepts.filter(c =>
    isSolid(masteryByConcept.get(c.id))
  ).length;
  const due = [...plants.values()].filter(p => p.wilted).length;

  const examMs = course.examDate ? course.examDate.toDate().getTime() : null;
  const subtitle = [
    examMs !== null ? examCountdown(examMs, now) : null,
    course.currentUnit ?? null,
  ].filter(Boolean);

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <span className="brand__word">sprout</span>
          <span className="brand__who">
            {learner?.displayName
              ? `${learner.displayName}'s garden`
              : 'your knowledge garden'}
          </span>
        </div>
        {courses.length > 1 && (
          <CourseSwitcher
            address={address}
            current={course.id}
            courses={courses.map(c => ({ id: c.id, name: c.name }))}
          />
        )}
        <h1 className="title">{course.name}</h1>
        {subtitle.length > 0 && (
          <p className="subtitle">{subtitle.join(' · ')}</p>
        )}
        {total > 0 && (
          <Stats total={total} tested={tested} solid={solid} due={due} />
        )}
      </header>

      <main>
        {!conceptsReady ? (
          <p className="loading">Walking out to the garden…</p>
        ) : total === 0 ? (
          <Message title="The beds are ready">
            Sprout hasn't mapped the concepts for this course yet. Once it does,
            each one shows up here as a seed.
          </Message>
        ) : (
          <Beds
            concepts={concepts.map(c => ({
              id: c.id,
              name: c.name,
              summary: c.summary,
            }))}
            edges={prereqRows.map(e => ({
              conceptId: e.conceptId,
              requiresId: e.requiresId,
            }))}
            plants={plants}
          />
        )}
        {total > 0 && <Legend />}
      </main>

      <footer className="footer">
        <span className={`live${isActive ? ' live--on' : ''}`} />
        {isActive ? 'Updates as you study' : 'Reconnecting…'}
      </footer>
    </div>
  );
}

function CourseSwitcher({
  address,
  current,
  courses,
}: {
  address: string;
  current: bigint;
  courses: { id: bigint; name: string }[];
}) {
  return (
    <nav className="courses" aria-label="Courses">
      {courses.map(c => {
        const href = `?u=${encodeURIComponent(address)}&course=${c.id}`;
        const isCurrent = c.id === current;
        return (
          <a
            key={String(c.id)}
            href={href}
            className={`courses__link${isCurrent ? ' courses__link--on' : ''}`}
            aria-current={isCurrent ? 'page' : undefined}
          >
            {c.name}
          </a>
        );
      })}
    </nav>
  );
}

function Stats({
  total,
  tested,
  solid,
  due,
}: {
  total: number;
  tested: number;
  solid: number;
  due: number;
}) {
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="stats">
      <dl className="stats__row">
        <div>
          <dt>tested</dt>
          <dd>
            {tested}
            <span className="stats__of"> of {total}</span>
          </dd>
        </div>
        <div>
          <dt>solid</dt>
          <dd>{solid}</dd>
        </div>
        <div>
          <dt>due for review</dt>
          <dd>{due}</dd>
        </div>
      </dl>
      <div
        className="track"
        role="img"
        aria-label={`${tested} of ${total} tested, ${solid} solid`}
      >
        <div className="track__tested" style={{ width: pct(tested) }} />
        <div className="track__solid" style={{ width: pct(solid) }} />
      </div>
    </div>
  );
}

type Line = { key: string; from: string; to: string; d: string };

function Beds({
  concepts,
  edges,
  plants,
}: {
  concepts: { id: bigint; name: string; summary: string }[];
  edges: GardenEdge[];
  plants: Map<bigint, PlantState>;
}) {
  const ids = concepts.map(c => c.id);
  const byId = new Map(concepts.map(c => [c.id, c]));
  const rows = gardenRows(ids, edges);
  const known = new Set(ids);
  const shown = edges.filter(
    e =>
      e.conceptId !== e.requiresId &&
      known.has(e.conceptId) &&
      known.has(e.requiresId)
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);
  // Past a handful of edges, always-on lines turn into a tangle, so they only
  // appear for the plant in focus.
  const busy = shown.length > 12;
  // Hover, focus or tap a plant to trace what it needs and what it unlocks.
  const [focus, setFocus] = useState<string | null>(null);
  const related = new Set<string>();
  if (focus) {
    related.add(focus);
    for (const e of shown) {
      if (String(e.conceptId) === focus) related.add(String(e.requiresId));
      if (String(e.requiresId) === focus) related.add(String(e.conceptId));
    }
  }
  const edgeKey = shown.map(e => `${e.requiresId}>${e.conceptId}`).join(',');
  const layoutKey = rows.map(r => r.join(',')).join('|');

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      const next: Line[] = [];
      for (const pair of edgeKey ? edgeKey.split(',') : []) {
        const [from, to] = pair.split('>');
        const a = tileRefs.current.get(from)?.getBoundingClientRect();
        const b = tileRefs.current.get(to)?.getBoundingClientRect();
        if (!a || !b) continue;
        const x1 = a.left + a.width / 2 - box.left;
        const y1 = a.bottom - box.top;
        const x2 = b.left + b.width / 2 - box.left;
        const y2 = b.top - box.top;
        if (y2 <= y1) continue;
        const mid = (y2 - y1) / 2;
        next.push({
          key: pair,
          from,
          to,
          d: `M${x1} ${y1} C${x1} ${y1 + mid} ${x2} ${y2 - mid} ${x2} ${y2}`,
        });
      }
      setLines(prev =>
        prev.length === next.length && prev.every((l, i) => l.d === next[i].d)
          ? prev
          : next
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [edgeKey, layoutKey]);

  return (
    <div
      className={`beds${focus ? ' beds--focus' : ''}${busy ? ' beds--busy' : ''}`}
      ref={wrapRef}
    >
      {shown.length > 0 && (
        <p className="beds__hint">
          Hover or tap a plant to see what it builds on.
        </p>
      )}
      <svg className="beds__lines" aria-hidden="true">
        {lines.map(l => (
          <path
            key={l.key}
            d={l.d}
            className={
              focus && (l.from === focus || l.to === focus) ? 'on' : undefined
            }
          />
        ))}
      </svg>
      {rows.map((row, depth) => (
        <section className="bed" key={depth}>
          {rows.length > 1 && (
            <h2 className="bed__label">
              {depth === 0 ? 'Foundations' : `Level ${depth + 1}`}
            </h2>
          )}
          <ul className="bed__plants">
            {row.map(id => {
              const c = byId.get(id)!;
              const p = plants.get(id)!;
              return (
                <li
                  key={String(id)}
                  className={`tile${related.has(String(id)) ? ' tile--related' : ''}`}
                  tabIndex={0}
                  onMouseEnter={() => setFocus(String(id))}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(String(id))}
                  onBlur={() => setFocus(null)}
                  ref={el => {
                    if (el) tileRefs.current.set(String(id), el);
                    else tileRefs.current.delete(String(id));
                  }}
                  title={c.summary || undefined}
                >
                  <Plant
                    stage={p.stage}
                    wilted={p.wilted}
                    top={STAGE_TOP[p.stage]}
                    label={describe(c.name, p)}
                  />
                  <span className="tile__label">
                    <span className="tile__name">{c.name}</span>
                    {p.percent !== null && (
                      <span className="tile__pct">
                        {p.percent}%{p.wilted && ' · due'}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function describe(name: string, p: PlantState) {
  const parts = [name, STAGE_WORDS[p.stage]];
  if (p.percent !== null) parts.push(`${p.percent}% mastered`);
  if (p.wilted) parts.push('due for review');
  return parts.join(', ');
}

const LEGEND: { stage: Stage; wilted?: boolean; text: string }[] = [
  { stage: 'seed', text: 'not tested yet' },
  { stage: 'sprout', text: 'under 40%' },
  { stage: 'sapling', text: '40 to 69%' },
  { stage: 'budding', text: '70 to 94%' },
  { stage: 'flowering', text: '95% and up' },
  { stage: 'sapling', wilted: true, text: 'due for review' },
];

function Legend() {
  return (
    <section className="legend" aria-label="How to read the garden">
      <ul>
        {LEGEND.map(item => (
          <li key={item.text}>
            <Plant
              stage={item.stage}
              wilted={item.wilted}
              size={44}
              top={STAGE_TOP.flowering}
            />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
