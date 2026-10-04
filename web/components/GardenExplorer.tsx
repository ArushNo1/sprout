'use client';

// The garden as one interactive map that fits the screen: plants laid out by prerequisite depth,
// with pan and zoom, whole-chain highlighting, filters, search, keyboard navigation and a detail panel.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plant, { STAGE_TOP, STAGE_WORDS, type Stage } from '@/components/Plant';
import { examCountdown, plantState } from '@/lib/garden';
import {
  CELL, arrowTarget, boundsOf, fitView, layoutMap, matchesFilter, relatedTo, statusOf, wrapName, zoomAt,
  type Direction, type Filter, type Orientation, type Related, type View,
} from '@/lib/gardenLayout';
import type { CourseGraph } from '@/lib/graph';

const PLANT_PX = 90;
const GROUND_Y = 106; // where the soil sits inside a cell, measured from its top
const DRAG_SLOP = 5;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'due', label: 'Due' },
  { id: 'growing', label: 'Growing' },
  { id: 'solid', label: 'Solid' },
  { id: 'seed', label: 'Not started' },
];

const LEGEND: { stage: Stage; wilted?: boolean; text: string }[] = [
  { stage: 'seed', text: 'not tested yet' },
  { stage: 'sprout', text: 'under 40%' },
  { stage: 'sapling', text: '40 to 69%' },
  { stage: 'budding', text: '70 to 94%' },
  { stage: 'flowering', text: '95% and up' },
  { stage: 'sapling', wilted: true, text: 'due for review' },
];

export default function GardenExplorer({ graphs, initialCourse }: { graphs: CourseGraph[]; initialCourse: number | null }) {
  const [courseId, setCourseId] = useState(() => (graphs.some(g => g.course.id === initialCourse) ? initialCourse! : graphs[0].course.id));
  const graph = graphs.find(g => g.course.id === courseId) ?? graphs[0];

  const [flip, setFlip] = useState<Orientation | null>(null); // null = pick whichever fits better
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [now, setNow] = useState<number | null>(null); // set after mount, so server and client markup agree
  const [copied, setCopied] = useState(false);

  const canvas = useRef<HTMLDivElement>(null);
  const moved = useRef(false); // the user has panned or zoomed, so a resize shouldn't re-fit
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; dist: number; slop: boolean } | null>(null);
  const didDrag = useRef(false); // survives pointerup, so the click that follows a drag can be ignored

  useEffect(() => setNow(Date.now()), []);

  // ---- derived data ----
  const edges = useMemo(() => graph.edges.map(e => ({ from: e.from, to: e.to })), [graph]);
  const ids = useMemo(() => graph.nodes.map(n => n.id), [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph]);

  const best = useMemo<Orientation>(() => {
    if (size.w === 0) return 'rows';
    const k = (o: Orientation) => fitView(layoutMap(ids, edges, o).bounds, size.w, size.h).k;
    return k('columns') > k('rows') * 1.08 ? 'columns' : 'rows';
  }, [ids, edges, size]);
  const orientation = flip ?? best;
  const layout = useMemo(() => layoutMap(ids, edges, orientation), [ids, edges, orientation]);

  const info = useMemo(() => new Map(graph.nodes.map(n => {
    const p = plantState(n.mastery, n.attempts, n.due);
    return [n.id, { plant: p, status: statusOf(n.mastery, n.attempts), due: p.wilted }];
  })), [graph]);

  const counts = useMemo(() => {
    const c = { all: graph.nodes.length, due: 0, growing: 0, solid: 0, seed: 0 };
    for (const v of info.values()) { c[v.status]++; if (v.due) c.due++; }
    return c;
  }, [graph, info]);

  const focusId = selected ?? hovered;
  const related = useMemo<Related | null>(() => (focusId === null ? null : relatedTo(focusId, edges)), [focusId, edges]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => new Set(q ? graph.nodes.filter(n => n.name.toLowerCase().includes(q)).map(n => n.id) : []), [q, graph]);
  const filtering = filter !== 'all' || q !== '';
  const passes = (id: number) => {
    const i = info.get(id)!;
    return matchesFilter(filter, i.status, i.due) && (q === '' || matches.has(id));
  };

  // ---- view control ----
  const refit = useCallback((animated: boolean) => {
    if (size.w === 0) return;
    moved.current = false;
    setAnimate(animated);
    setView(fitView(layout.bounds, size.w, size.h));
  }, [layout, size]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit when the course, layout or (before the user has touched the view) the window size changes.
  useEffect(() => {
    if (size.w === 0) return;
    if (!moved.current) refit(false);
  }, [refit, size]);
  useEffect(() => { refit(false); }, [courseId, orientation]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusChain = useCallback((id: number) => {
    const r = relatedTo(id, edges);
    const pts = [id, ...r.ancestors, ...r.descendants].map(i => layout.pos.get(i)!).filter(Boolean);
    moved.current = true;
    setAnimate(true);
    setView(fitView(boundsOf(pts), size.w, size.h, 56, 1.5));
  }, [edges, layout, size]);

  const reveal = useCallback((id: number) => {
    const p = layout.pos.get(id);
    if (!p) return;
    // On a phone the detail panel is a sheet over the lower part of the map, so keep the plant above it.
    const usable = window.innerWidth < 900 ? size.h * 0.5 : size.h;
    const sx = view.x + p.x * view.k, sy = view.y + p.y * view.k;
    const mx = (CELL.w / 2) * view.k, my = (CELL.h / 2) * view.k;
    if (sx - mx < 0 || sy - my < 0 || sx + mx > size.w || sy + my > usable) {
      moved.current = true;
      setAnimate(true);
      setView(v => ({ ...v, x: size.w / 2 - p.x * v.k, y: usable / 2 - p.y * v.k }));
    }
  }, [layout, view, size]);

  const select = useCallback((id: number | null) => {
    setSelected(id);
    if (id !== null) reveal(id);
  }, [reveal]);

  const switchCourse = (id: number) => {
    setCourseId(id);
    setSelected(null); setHovered(null); setFilter('all'); setQuery(''); setFlip(null);
    try { window.history.replaceState(null, '', `?course=${id}`); } catch { /* not critical */ }
  };

  // ---- wheel (needs a non-passive listener to stop the page scrolling) ----
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      moved.current = true;
      setAnimate(false);
      setView(v => zoomAt(v, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- pointer: drag to pan, two fingers to pinch ----
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) didDrag.current = false;
    const pts = [...pointers.current.values()];
    gesture.current = { x: e.clientX, y: e.clientY, dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, slop: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const r = canvas.current!.getBoundingClientRect();
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cx = (pts[0].x + pts[1].x) / 2 - r.left, cy = (pts[0].y + pts[1].y) / 2 - r.top;
      if (g.dist > 0) { moved.current = true; setAnimate(false); setView(v => zoomAt(v, dist / g.dist, cx, cy)); }
      didDrag.current = true;
      gesture.current = { ...g, dist, slop: true };
      return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.slop && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!g.slop) {
      setDragging(true);
      didDrag.current = true;
      canvas.current?.setPointerCapture(e.pointerId); // only once it's a drag, so taps still reach the plants
    }
    moved.current = true;
    setAnimate(false);
    setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    gesture.current = { ...g, x: e.clientX, y: e.clientY, slop: true };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
      // A tap on empty ground clears the selection; a drag never does.
      if (g && !didDrag.current && (e.target as Element).closest('.gx-node') === null) setSelected(null);
    }
  };

  const zoomBy = (f: number) => { moved.current = true; setAnimate(true); setView(v => zoomAt(v, f, size.w / 2, size.h / 2)); };

  // ---- keyboard ----
  const onNodeKey = (e: React.KeyboardEvent, id: number) => {
    const dirs: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); return; }
    if (e.key === 'Escape') { setSelected(null); return; }
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    // In the columns layout the level axis is horizontal, so the arrows rotate with it.
    const mapped: Direction = orientation === 'columns' ? ({ up: 'left', down: 'right', left: 'up', right: 'down' } as const)[dir] : dir;
    const target = arrowTarget(id, mapped, layout, edges);
    if (target === null) return;
    select(target);
    requestAnimationFrame(() => document.getElementById(`gx-node-${target}`)?.focus());
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && matches.size > 0) {
      const first = layout.rows.flat().find(i => matches.has(i))!;
      select(first);
      focusChain(first);
    } else if (e.key === 'Escape') setQuery('');
  };

  const copyAsk = async (name: string) => {
    try { await navigator.clipboard.writeText(`Teach me ${name}`); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };

  const sel = selected !== null ? byId.get(selected) ?? null : null;
  const examMs = graph.course.examDate;

  return (
    <section className="gx" aria-label={`${graph.course.name} garden`}>
      <div className="gx-bar">
        {graphs.length > 1 ? (
          <select className="gx-select" aria-label="Course" value={courseId} onChange={e => switchCourse(Number(e.target.value))}>
            {graphs.map(g => <option key={g.course.id} value={g.course.id}>{g.course.name}</option>)}
          </select>
        ) : (
          <h1 className="gx-title">{graph.course.name}</h1>
        )}
        <input
          className="gx-search" type="search" placeholder="Find a concept…" aria-label="Find a concept"
          value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onSearchKey}
        />
        <div className="gx-filters" role="group" aria-label="Show">
          {FILTERS.map(f => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <b>{counts[f.id]}</b>
            </button>
          ))}
        </div>
      </div>

      <div className={`gx-main${sel ? ' has-selection' : ''}`}>
        <div
          ref={canvas}
          className={`gx-canvas panel${dragging ? ' is-dragging' : ''}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onDoubleClick={e => { if ((e.target as Element).closest('.gx-node') === null) refit(true); }}
        >
          {graph.nodes.length === 0 ? (
            <div className="gx-hint" style={{ left: 24, top: 24 }}>Sprout hasn&apos;t mapped the concepts for this course yet.</div>
          ) : size.w > 0 && (
            <svg className="gx-svg" role="group" aria-label="Concept map. Use arrow keys to move along prerequisites.">
              <g className={`gx-world${animate && !dragging ? ' is-animated' : ''}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
                {edges.map(e => {
                  const a = layout.pos.get(e.from), b = layout.pos.get(e.to);
                  if (!a || !b) return null;
                  let cls = 'gx-edge';
                  if (related && focusId !== null) {
                    const upSide = (i: number) => i === focusId || related.ancestors.has(i);
                    const downSide = (i: number) => i === focusId || related.descendants.has(i);
                    cls += upSide(e.from) && upSide(e.to) ? ' is-up' : downSide(e.from) && downSide(e.to) ? ' is-down' : ' is-dim';
                  } else if (filtering && !(passes(e.from) && passes(e.to))) cls += ' is-dim';
                  return <path key={`${e.from}-${e.to}`} className={cls} d={edgePath(a, b, orientation)} />;
                })}
                {layout.rows.flat().map(id => {
                  const n = byId.get(id)!;
                  const i = info.get(id)!;
                  const p = layout.pos.get(id)!;
                  const isUp = !!related && focusId !== null && related.ancestors.has(id);
                  const isDown = !!related && focusId !== null && related.descendants.has(id);
                  const inChain = focusId === id || isUp || isDown;
                  const dim = related ? !inChain : filtering && !passes(id);
                  const top = STAGE_TOP[i.plant.stage];
                  const ph = (PLANT_PX * (100 - top)) / 80;
                  const lines = wrapName(n.name);
                  return (
                    <g
                      key={id} id={`gx-node-${id}`} role="button" tabIndex={0} transform={`translate(${p.x} ${p.y})`}
                      className={`gx-node${dim ? ' is-dim' : ''}${selected === id ? ' is-selected' : ''}${isUp ? ' is-up' : ''}${isDown ? ' is-down' : ''}${q && matches.has(id) ? ' is-match' : ''}${focusId === id ? ' is-related' : ''}`}
                      aria-pressed={selected === id}
                      aria-label={describe(n.name, i.plant, STAGE_WORDS)}
                      onClick={() => { if (!didDrag.current) select(selected === id ? null : id); }}
                      onDoubleClick={() => focusChain(id)}
                      onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(id)} onBlur={() => setHovered(null)}
                      onKeyDown={e => onNodeKey(e, id)}
                    >
                      <rect className="gx-halo" x={-CELL.w / 2} y={-CELL.h / 2} width={CELL.w} height={CELL.h} rx={22} />
                      <g transform={`translate(${-PLANT_PX / 2} ${-CELL.h / 2 + GROUND_Y - ph})`}>
                        <Plant stage={i.plant.stage} wilted={i.plant.wilted} size={PLANT_PX} top={top} />
                      </g>
                      {i.due && <circle className="gx-badge" cx={PLANT_PX / 2 - 4} cy={-CELL.h / 2 + 22} r={8} />}
                      {lines.map((ln, li) => (
                        <text key={li} className="gx-name" x={0} y={-CELL.h / 2 + GROUND_Y + 30 + li * 24}>{ln}</text>
                      ))}
                      {i.plant.percent !== null && (
                        <text className={`gx-pct${i.due ? ' is-due' : ''}`} x={0} y={-CELL.h / 2 + GROUND_Y + 30 + lines.length * 24 + 2}>
                          {i.plant.percent}%{i.due ? ' · due' : ''}
                        </text>
                      )}
                      <title>{n.summary || n.name}</title>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          <div className="gx-legend" aria-hidden="true">
            <span><i style={{ borderColor: 'var(--bar-fill)' }} />builds on</span>
            <span><i style={{ borderColor: 'var(--bloom)' }} />unlocks</span>
          </div>
          <div className="gx-tools">
            <button className="gx-tool" aria-label="Zoom in" onClick={() => zoomBy(1.3)}>+</button>
            <button className="gx-tool" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>−</button>
            <button className="gx-tool gx-tool--wide" onClick={() => refit(true)}>Fit</button>
            <button className="gx-tool gx-tool--wide" onClick={() => { setFlip(orientation === 'rows' ? 'columns' : 'rows'); }} title="Flip the layout">
              {orientation === 'rows' ? '↔' : '↕'}
            </button>
          </div>
          <p className="gx-hint">{selected === null ? 'Tap a plant to see what it builds on and unlocks. Drag to move, scroll to zoom.' : 'Double-tap a plant to zoom to its chain. Esc clears.'}</p>
        </div>

        <aside className="gx-panel panel" aria-live="polite">
          {sel && info.get(sel.id) ? (
            <Detail
              key={sel.id} node={sel} graph={graph} info={info} now={now} copied={copied}
              onPick={id => { select(id); }} onFocus={() => focusChain(sel.id)} onClear={() => setSelected(null)}
              onCopy={() => copyAsk(sel.name)}
            />
          ) : (
            <Summary
              graph={graph} counts={counts} info={info} now={now} examMs={examMs}
              onPick={id => { select(id); focusChain(id); }} onFilterDue={() => setFilter('due')}
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, o: Orientation): string {
  if (o === 'rows') {
    const x1 = a.x, y1 = a.y + CELL.h / 2 - 2, x2 = b.x, y2 = b.y - CELL.h / 2 + 8;
    const m = Math.max(24, (y2 - y1) / 2);
    return `M${x1} ${y1} C${x1} ${y1 + m} ${x2} ${y2 - m} ${x2} ${y2}`;
  }
  const x1 = a.x + CELL.w / 2 - 14, y1 = a.y - CELL.h / 2 + 66, x2 = b.x - CELL.w / 2 + 14, y2 = b.y - CELL.h / 2 + 66;
  const m = Math.max(24, (x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + m} ${y1} ${x2 - m} ${y2} ${x2} ${y2}`;
}

function describe(name: string, p: ReturnType<typeof plantState>, words: Record<Stage, string>) {
  const parts = [name, words[p.stage]];
  if (p.percent !== null) parts.push(`${p.percent}% mastered`);
  if (p.wilted) parts.push('due for review');
  return parts.join(', ');
}

type Info = Map<number, { plant: ReturnType<typeof plantState>; status: string; due: boolean }>;

function Summary({ graph, counts, info, now, examMs, onPick, onFilterDue }: {
  graph: CourseGraph; counts: { all: number; due: number; growing: number; solid: number; seed: number };
  info: Info; now: number | null; examMs: number | null; onPick: (id: number) => void; onFilterDue: () => void;
}) {
  const tested = counts.all - counts.seed;
  const pct = (n: number) => `${counts.all ? (n / counts.all) * 100 : 0}%`;
  const weakest = [...graph.nodes].filter(n => n.attempts > 0).sort((a, b) => a.mastery - b.mastery)[0];
  return (
    <div>
      <p className="eyebrow">{examMs !== null && now !== null ? examCountdown(examMs, now) : 'Your course'}</p>
      <h2>{graph.course.name}</h2>
      <p className="gx-big">{counts.solid}<small> of {counts.all} solid</small></p>
      <div className="track" role="img" aria-label={`${tested} of ${counts.all} tested, ${counts.solid} solid`}>
        <i className="t1" style={{ width: pct(tested) }} /><i className="t2" style={{ width: pct(counts.solid) }} />
      </div>
      <div className="gx-chips" style={{ marginTop: 14 }}>
        {counts.due > 0 && <button className="chip chip--tag" onClick={onFilterDue}>{counts.due} due for review</button>}
        <span className="chip chip--tag">{tested} tested</span>
        <span className="chip chip--tag">{counts.seed} not started</span>
      </div>
      {weakest && (
        <>
          <h3>Weakest right now</h3>
          <button className="chip" onClick={() => onPick(weakest.id)}>{weakest.name} <b>{Math.floor(weakest.mastery * 100)}%</b></button>
        </>
      )}
      <h3>How to read it</h3>
      <ul className="gx-legend-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
        {LEGEND.map(item => (
          <li key={item.text} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, fontStyle: 'italic', color: 'var(--green)', fontSize: 16 }}>
            <Plant stage={item.stage} wilted={item.wilted} size={34} top={STAGE_TOP.flowering} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ marginTop: 14, fontSize: 17 }}>Plants higher up are learned first. Lines run from what you need to what it unlocks.</p>
    </div>
  );
}

function Detail({ node, graph, info, now, copied, onPick, onFocus, onClear, onCopy }: {
  node: CourseGraph['nodes'][number]; graph: CourseGraph; info: Info; now: number | null; copied: boolean;
  onPick: (id: number) => void; onFocus: () => void; onClear: () => void; onCopy: () => void;
}) {
  const i = info.get(node.id)!;
  const names = new Map(graph.nodes.map(n => [n.id, n]));
  const needs = graph.edges.filter(e => e.to === node.id).map(e => e.from);
  const unlocks = graph.edges.filter(e => e.from === node.id).map(e => e.to);
  const chip = (id: number) => {
    const n = names.get(id)!;
    const s = info.get(id)!;
    const dot = s.due ? 'dot--due' : s.status === 'solid' ? 'dot--done' : 'dot--todo';
    return (
      <button key={id} className="chip" onClick={() => onPick(id)}>
        <span className={`dot ${dot}`} aria-hidden="true" />{n.name}
      </button>
    );
  };
  const blocked = needs.filter(id => info.get(id)!.status !== 'solid');
  return (
    <div>
      <p className="eyebrow">{i.due ? 'Due for review' : STAGE_WORDS[i.plant.stage]}</p>
      <h2>{node.name}</h2>
      {node.summary && <p className="body">{node.summary}</p>}
      <p className="gx-big">{i.plant.percent !== null ? <>{i.plant.percent}%<small> mastered · {node.attempts} {node.attempts === 1 ? 'answer' : 'answers'}</small></> : <small>Not tested yet</small>}</p>
      <div className="track"><i className="t2" style={{ width: `${(i.plant.percent ?? 0)}%` }} /></div>
      {node.nextReview !== null && now !== null && (
        <p className="muted" style={{ marginTop: 8 }}>{node.nextReview <= now ? 'Review is due now' : `Next review ${new Date(node.nextReview).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</p>
      )}
      <h3>Builds on{blocked.length > 0 ? ` · ${blocked.length} not solid yet` : ''}</h3>
      <div className="gx-chips">{needs.length ? needs.map(chip) : <span className="muted">Nothing: a good place to start</span>}</div>
      <h3>Unlocks</h3>
      <div className="gx-chips">{unlocks.length ? unlocks.map(chip) : <span className="muted">Nothing further</span>}</div>
      <div className="gx-actions">
        <button className="cta" onClick={onFocus}>Zoom to chain</button>
        <button className="cta cta--ghost" onClick={onCopy}>{copied ? 'Copied' : 'Copy “Teach me this”'}</button>
        <button className="cta cta--ghost" onClick={onClear}>Close</button>
      </div>
    </div>
  );
}
