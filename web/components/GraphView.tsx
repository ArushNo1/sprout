'use client';

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { useMemo, useRef, useState } from 'react';
import type { CourseGraph, GraphNode, Stage } from '@/lib/graph';

const ROW = 120; // vertical gap between prerequisite levels
const COLORS: Record<Stage, string> = { seed: 'var(--seed)', sprout: 'var(--sprout)', plant: 'var(--plant)', bloom: 'var(--bloom)' };
const STAGE_LABEL: Record<Stage, string> = { seed: 'Not started', sprout: 'Shaky', plant: 'Growing', bloom: 'Solid' };
const radius = (n: GraphNode) => 12 + n.mastery * 12;

type Placed = GraphNode & { x: number; y: number };

/** Prerequisites sit above what they unlock. Run once, to completion, so the picture doesn't jitter. */
function layout(graph: CourseGraph): Placed[] {
  const nodes = graph.nodes.map(n => ({ ...n, x: (n.id % 7) * 40 - 120, y: n.depth * ROW }));
  const links = graph.edges.map(e => ({ source: e.from, target: e.to }));
  const sim = forceSimulation(nodes)
    .force('link', forceLink<Placed, { source: number; target: number }>(links).id(n => n.id).distance(ROW).strength(0.25))
    .force('charge', forceManyBody().strength(-380))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY<Placed>(n => n.depth * ROW).strength(1))
    .force('collide', forceCollide<Placed>(n => radius(n) + 26))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();
  return nodes;
}

function bounds(nodes: Placed[]) {
  const pad = 70;
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
}

export default function GraphView({ graph }: { graph: CourseGraph }) {
  const nodes = useMemo(() => layout(graph), [graph]);
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const home = useMemo(() => bounds(nodes), [nodes]);
  const [view, setView] = useState(home);
  const [selected, setSelected] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const sel = selected === null ? null : byId.get(selected) ?? null;
  const hot = (id: number) => selected !== null && (id === selected);
  const counts = nodes.reduce((c, n) => ({ ...c, [n.stage]: (c[n.stage] ?? 0) + 1 }), {} as Partial<Record<Stage, number>>);
  const due = nodes.filter(n => n.due).length;

  function zoom(factor: number, cx?: number, cy?: number) {
    setView(v => {
      const px = cx ?? v.x + v.w / 2, py = cy ?? v.y + v.h / 2;
      const w = Math.min(home.w * 4, Math.max(home.w / 6, v.w * factor)), k = w / v.w;
      return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h: v.h * k };
    });
  }

  const toGraph = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * view.h };
  };

  return (
    <div className="graph-wrap">
      <div>
        <div className="graph">
          <svg
            ref={svg}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            role="img"
            aria-label={`Concept graph for ${graph.course.name}`}
            onWheel={e => { const p = toGraph(e); zoom(e.deltaY > 0 ? 1.12 : 0.9, p.x, p.y); }}
            onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; svg.current!.setPointerCapture(e.pointerId); }}
            onPointerMove={e => {
              const d = drag.current;
              if (!d) return;
              const r = svg.current!.getBoundingClientRect();
              const dx = ((e.clientX - d.x) / r.width) * view.w, dy = ((e.clientY - d.y) / r.height) * view.h;
              if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
              drag.current = { ...d, x: e.clientX, y: e.clientY };
              setView(v => ({ ...v, x: v.x - dx, y: v.y - dy }));
            }}
            onPointerUp={e => { if (drag.current && !drag.current.moved && e.target === svg.current) setSelected(null); drag.current = null; }}
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="var(--muted)" />
              </marker>
            </defs>
            {graph.edges.map(e => {
              const a = byId.get(e.from), b = byId.get(e.to);
              if (!a || !b) return null;
              const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
              return (
                <line key={`${e.from}-${e.to}`} className={`edge${hot(e.from) || hot(e.to) ? ' hot' : ''}`}
                  x1={a.x + ux * radius(a)} y1={a.y + uy * radius(a)} x2={b.x - ux * (radius(b) + 3)} y2={b.y - uy * (radius(b) + 3)}
                  markerEnd="url(#arrow)" opacity={0.4 + e.confidence * 0.6} />
              );
            })}
            {nodes.map(n => (
              <g key={n.id} className={`node${n.due ? ' due' : ''}${n.id === selected ? ' selected' : ''}`} transform={`translate(${n.x} ${n.y})`}>
                <circle r={radius(n)} fill={n.due ? 'var(--wilt)' : COLORS[n.stage]} opacity={n.stage === 'seed' ? 0.7 : 1}
                  onClick={() => { if (!drag.current?.moved) setSelected(n.id); }}>
                  <title>{`${n.name}: ${Math.round(n.mastery * 100)}%`}</title>
                </circle>
                <text y={radius(n) + 14}>{n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="legend">
          {(Object.keys(COLORS) as Stage[]).map(s => (
            <span key={s}><span className="dot" style={{ background: COLORS[s] }} />{STAGE_LABEL[s]} ({counts[s] ?? 0})</span>
          ))}
          <span><span className="dot" style={{ background: 'var(--wilt)' }} />Due for review ({due})</span>
          <span style={{ marginLeft: 'auto' }}>
            <button onClick={() => zoom(0.8)} aria-label="Zoom in">+</button>{' '}
            <button onClick={() => zoom(1.25)} aria-label="Zoom out">−</button>{' '}
            <button onClick={() => setView(home)}>Reset</button>
          </span>
        </div>
      </div>
      <aside className="card" aria-live="polite">
        {sel ? <Detail node={sel} graph={graph} onPick={setSelected} /> : (
          <>
            <strong>{nodes.length} concepts</strong>
            <p className="muted">{graph.edges.length} prerequisite links. Arrows point from what you need first to what it unlocks. Click a concept for details; drag to pan, scroll to zoom.</p>
            {graph.course.examDate && <p className="muted">Exam {new Date(graph.course.examDate).toLocaleDateString()}</p>}
          </>
        )}
      </aside>
    </div>
  );
}

function Detail({ node, graph, onPick }: { node: Placed; graph: CourseGraph; onPick: (id: number) => void }) {
  const names = new Map(graph.nodes.map(n => [n.id, n.name]));
  const needs = graph.edges.filter(e => e.to === node.id).map(e => e.from);
  const unlocks = graph.edges.filter(e => e.from === node.id).map(e => e.to);
  const list = (ids: number[]) => ids.length ? ids.map(id => (
    <button key={id} className="pill" onClick={() => onPick(id)}>{names.get(id)}</button>
  )) : <span className="muted">none</span>;
  return (
    <>
      <strong>{node.name}</strong> <span className="pill">{node.due ? 'Due for review' : STAGE_LABEL[node.stage]}</span>
      <p className="muted">{node.summary}</p>
      <div>{Math.round(node.mastery * 100)}% mastered · {node.attempts} {node.attempts === 1 ? 'answer' : 'answers'}</div>
      <div className="bar"><span style={{ width: `${node.mastery * 100}%` }} /></div>
      {node.nextReview && <p className="muted">Next review {new Date(node.nextReview).toLocaleDateString()}</p>}
      <p><span className="muted">Needs first:</span><br />{list(needs)}</p>
      <p><span className="muted">Unlocks:</span><br />{list(unlocks)}</p>
    </>
  );
}
