'use client';

// Garden view — plant tiles arranged by prerequisite depth.
// Ported from spacetimedb/src/App.tsx (Beds, Stats, Legend components).

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Plant, { STAGE_TOP, STAGE_WORDS, type Stage } from '@/components/Plant';
import { gardenRows, plantState, examCountdown, type GardenEdge } from '@/lib/garden';
import type { CourseGraph } from '@/lib/graph';

type Line = { key: string; from: string; to: string; d: string };

const LEGEND: { stage: Stage; wilted?: boolean; text: string }[] = [
  { stage: 'seed',      text: 'not tested yet' },
  { stage: 'sprout',    text: 'under 40%' },
  { stage: 'sapling',   text: '40 to 69%' },
  { stage: 'budding',   text: '70 to 94%' },
  { stage: 'flowering', text: '95% and up' },
  { stage: 'sapling', wilted: true, text: 'due for review' },
];

export default function GardenView({ graph }: { graph: CourseGraph }) {
  const now = Date.now();

  const plants = useMemo(() =>
    new Map(graph.nodes.map(n => [n.id, plantState(n.mastery, n.attempts, n.due)])),
    [graph]
  );

  const total    = graph.nodes.length;
  const tested   = [...plants.values()].filter(p => p.tested).length;
  const solid    = graph.nodes.filter(n => n.mastery >= 0.7 && n.attempts > 0).length;
  const due      = [...plants.values()].filter(p => p.wilted).length;

  const examMs = graph.course.examDate;
  const subtitle = [
    examMs !== null ? examCountdown(examMs, now) : null,
  ].filter(Boolean).join(' · ');

  const edges: GardenEdge[] = graph.edges.map(e => ({ from: e.from, to: e.to }));
  const ids = graph.nodes.map(n => n.id);
  const rows = gardenRows(ids, edges);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));

  return (
    <div className="garden-page">
      <div className="garden-header">
        <h1 className="garden-title">{graph.course.name}</h1>
        {subtitle && <p className="garden-subtitle">{subtitle}</p>}
        {total > 0 && <GardenStats total={total} tested={tested} solid={solid} due={due} />}
      </div>

      {total === 0 ? (
        <div className="garden-message">
          <Plant stage="seed" size={120} top={STAGE_TOP.seed} />
          <p className="garden-message__title">The beds are ready</p>
          <p className="garden-message__body">Sprout hasn&apos;t mapped the concepts for this course yet.</p>
        </div>
      ) : (
        <Beds concepts={graph.nodes.map(n => ({ id: n.id, name: n.name, summary: n.summary }))} edges={edges} plants={plants} rows={rows} />
      )}

      {total > 0 && <GardenLegend />}
    </div>
  );
}

function GardenStats({ total, tested, solid, due }: { total: number; tested: number; solid: number; due: number }) {
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="garden-stats">
      <dl className="garden-stats__row">
        <div><dt>tested</dt><dd>{tested}<span className="garden-stats__of"> of {total}</span></dd></div>
        <div><dt>solid</dt><dd>{solid}</dd></div>
        <div><dt>due for review</dt><dd>{due}</dd></div>
      </dl>
      <div className="garden-track" role="img" aria-label={`${tested} of ${total} tested, ${solid} solid`}>
        <div className="garden-track__tested" style={{ width: pct(tested) }} />
        <div className="garden-track__solid"  style={{ width: pct(solid) }} />
      </div>
    </div>
  );
}

function Beds({ concepts, edges, plants, rows }: {
  concepts: { id: number; name: string; summary: string }[];
  edges: GardenEdge[];
  plants: Map<number, ReturnType<typeof plantState>>;
  rows: number[][];
}) {
  const byId = new Map(concepts.map(c => [c.id, c]));
  const known = new Set(concepts.map(c => c.id));
  const shown = edges.filter(e => e.from !== e.to && known.has(e.from) && known.has(e.to));

  const wrapRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const busy = shown.length > 12;
  const [focus, setFocus] = useState<string | null>(null);
  const related = new Set<string>();
  if (focus) {
    related.add(focus);
    for (const e of shown) {
      if (String(e.to)   === focus) related.add(String(e.from));
      if (String(e.from) === focus) related.add(String(e.to));
    }
  }
  const edgeKey  = shown.map(e => `${e.from}>${e.to}`).join(',');
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
        const x1 = a.left + a.width / 2 - box.left, y1 = a.bottom - box.top;
        const x2 = b.left + b.width / 2 - box.left, y2 = b.top   - box.top;
        if (y2 <= y1) continue;
        const mid = (y2 - y1) / 2;
        next.push({ key: pair, from, to, d: `M${x1} ${y1} C${x1} ${y1+mid} ${x2} ${y2-mid} ${x2} ${y2}` });
      }
      setLines(prev => prev.length === next.length && prev.every((l, i) => l.d === next[i].d) ? prev : next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [edgeKey, layoutKey]);

  return (
    <div className={`garden-beds${focus ? ' garden-beds--focus' : ''}${busy ? ' garden-beds--busy' : ''}`} ref={wrapRef}>
      {shown.length > 0 && <p className="garden-beds__hint">Hover or tap a plant to see what it builds on.</p>}
      <svg className="garden-beds__lines" aria-hidden="true">
        {lines.map(l => (
          <path key={l.key} d={l.d} className={focus && (l.from === focus || l.to === focus) ? 'on' : undefined} />
        ))}
      </svg>
      {rows.map((row, depth) => (
        <section className="garden-bed" key={depth}>
          {rows.length > 1 && (
            <h2 className="garden-bed__label">{depth === 0 ? 'Foundations' : `Level ${depth + 1}`}</h2>
          )}
          <ul className="garden-bed__plants">
            {row.map(id => {
              const c = byId.get(id)!;
              const p = plants.get(id)!;
              return (
                <li
                  key={id}
                  className={`garden-tile${related.has(String(id)) ? ' garden-tile--related' : ''}`}
                  tabIndex={0}
                  onMouseEnter={() => setFocus(String(id))}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(String(id))}
                  onBlur={() => setFocus(null)}
                  ref={el => { if (el) tileRefs.current.set(String(id), el); else tileRefs.current.delete(String(id)); }}
                  title={c.summary || undefined}
                >
                  <Plant stage={p.stage} wilted={p.wilted} top={STAGE_TOP[p.stage]} label={describeLabel(c.name, p)} />
                  <span className="garden-tile__label">
                    <span className="garden-tile__name">{c.name}</span>
                    {p.percent !== null && <span className="garden-tile__pct">{p.percent}%{p.wilted && ' · due'}</span>}
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

function describeLabel(name: string, p: ReturnType<typeof plantState>) {
  const parts = [name, STAGE_WORDS[p.stage]];
  if (p.percent !== null) parts.push(`${p.percent}% mastered`);
  if (p.wilted) parts.push('due for review');
  return parts.join(', ');
}

function GardenLegend() {
  return (
    <section className="garden-legend" aria-label="How to read the garden">
      <ul>
        {LEGEND.map(item => (
          <li key={item.text}>
            <Plant stage={item.stage} wilted={item.wilted} size={44} top={STAGE_TOP.flowering} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
