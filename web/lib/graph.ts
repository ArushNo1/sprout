// Turns a learner's rows into the knowledge graph the page draws. Pure, so it can be tested without a database.
import { lit, sql, type Row } from './stdb.ts';

export type Stage = 'seed' | 'sprout' | 'plant' | 'bloom';

export type GraphNode = {
  id: number;
  name: string;
  summary: string;
  depth: number; // longest prerequisite chain above this concept (0 = none)
  mastery: number; // P(mastered), 0-1
  attempts: number;
  stage: Stage;
  due: boolean; // review overdue: drawn wilting
  nextReview: number | null; // ms since epoch
};

export type GraphEdge = { from: number; to: number; confidence: number }; // from = prerequisite

export type CourseGraph = {
  course: { id: number; name: string; status: string; examDate: number | null };
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export const stageOf = (p: number, attempts: number): Stage =>
  attempts === 0 ? 'seed' : p >= 0.85 ? 'bloom' : p >= 0.6 ? 'plant' : 'sprout';

/** Longest-path depth per node. Edges that would loop (the database rejects cycles, but be safe) are ignored. */
export function depths(ids: number[], edges: { from: number; to: number }[]): Map<number, number> {
  const memo = new Map<number, number>();
  const parents = new Map<number, number[]>();
  for (const e of edges) parents.set(e.to, [...(parents.get(e.to) ?? []), e.from]);
  const visit = (id: number, path: Set<number>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (path.has(id)) return 0;
    path.add(id);
    const d = Math.max(-1, ...(parents.get(id) ?? []).map(p => visit(p, path))) + 1;
    path.delete(id);
    memo.set(id, d);
    return d;
  };
  ids.forEach(id => visit(id, new Set()));
  return memo;
}

const micros = (v: unknown) => (typeof v === 'number' ? v / 1000 : null);

export function buildGraph(courseRow: Row, concepts: Row[], prereqs: Row[], mastery: Row[], now = Date.now()): CourseGraph {
  const byConcept = new Map(mastery.map(m => [Number(m.concept_id), m]));
  const ids = concepts.map(c => Number(c.id));
  const edges: GraphEdge[] = prereqs
    .map(p => ({ from: Number(p.requires_id), to: Number(p.concept_id), confidence: Number(p.confidence) }))
    .filter(e => ids.includes(e.from) && ids.includes(e.to));
  const depth = depths(ids, edges);
  const nodes = concepts.map(c => {
    const m = byConcept.get(Number(c.id));
    const p = m ? Number(m.p_mastered) : Number(c.p_init ?? 0.2);
    const attempts = m ? Number(m.attempts) : 0;
    const next = m ? micros(m.next_review) : null;
    return {
      id: Number(c.id),
      name: String(c.name),
      summary: String(c.summary ?? ''),
      depth: depth.get(Number(c.id)) ?? 0,
      mastery: p,
      attempts,
      stage: stageOf(p, attempts),
      due: next !== null && next <= now,
      nextReview: next,
    };
  });
  return {
    course: {
      id: Number(courseRow.id),
      name: String(courseRow.name),
      status: String(courseRow.status),
      examDate: micros(courseRow.exam_date),
    },
    nodes,
    edges,
  };
}

/** All of a learner's courses as graphs, or null if the learner doesn't exist. */
export async function loadGraphs(address: string): Promise<CourseGraph[] | null> {
  const a = lit(address);
  const learner = await sql(`SELECT * FROM learner WHERE address = ${a}`);
  if (learner.length === 0) return null;
  const [courses, mastery] = await Promise.all([
    sql(`SELECT * FROM course WHERE user_address = ${a}`),
    sql(`SELECT * FROM mastery WHERE user_address = ${a}`),
  ]);
  return Promise.all(
    courses.map(async course => {
      const cid = Number(course.id);
      const [concepts, prereqs] = await Promise.all([
        sql(`SELECT * FROM concept WHERE course_id = ${cid}`),
        sql(`SELECT * FROM prerequisite WHERE course_id = ${cid}`),
      ]);
      return buildGraph(course, concepts, prereqs, mastery.filter(m => Number(m.course_id) === cid));
    }),
  );
}
