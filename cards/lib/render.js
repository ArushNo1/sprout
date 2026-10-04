// Draws Sprout's cards as plain element trees for @vercel/og (no JSX build step).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "@vercel/og";
import { plantSrc } from "./plants.js";

export const COLORS = {
  card: "#F4EADF",      // cream card
  green: "#0B6122",     // logo green: titles
  barFill: "#4E8A5E",   // progress fill
  track: "#DCCBB2",     // tan track and secondary button
  ink: "#222222",       // row labels
  primary: "#0A4D17",   // primary button
};

const fontDir = join(process.cwd(), "fonts");
const FONTS = [
  { name: "Instrument Serif", data: readFileSync(join(fontDir, "InstrumentSerif-Regular.ttf")), style: "normal", weight: 400 },
  { name: "Instrument Serif", data: readFileSync(join(fontDir, "InstrumentSerif-Italic.ttf")), style: "italic", weight: 400 },
];

const h = (type, style, children = []) => ({ type, props: { style, children } });

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Card: title, italic subtitle, then rows of [label, 0..1 value, optional tail text].
// Satori resolves % widths poorly inside flex-grow, so every width here is in pixels.
const CARD_W = 1080;
const PAD_X = 48;
const GAP = 20;
const TAIL_W = 64;

// Instrument Serif averages ~0.43em per character; shrink long titles to fit one line.
const titleSize = (title) => Math.max(44, Math.min(76, Math.floor((CARD_W - 2 * PAD_X) / (title.length * 0.43))));

export function cardTree({ title, subtitle, rows }) {
  const labelChars = Math.max(3, ...rows.map((r) => r.label.length));
  const labelWidth = Math.min(340, Math.max(64, Math.round(labelChars * 16.5)));
  const hasTail = rows.some((r) => r.tail);
  const trackWidth = CARD_W - 2 * PAD_X - labelWidth - GAP - (hasTail ? GAP + TAIL_W : 0);
  const rowEls = rows.map((r) => {
    const fill = Math.round(Math.max(0, Math.min(1, r.value)) * trackWidth);
    return h("div", { display: "flex", alignItems: "center", height: 44 }, [
      h("div", { display: "flex", width: labelWidth, flexShrink: 0, marginRight: GAP, fontSize: 36, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden" }, r.label),
      h("div", { display: "flex", width: trackWidth, flexShrink: 0, height: 40, borderRadius: 20, backgroundColor: COLORS.track }, [
        ...(fill > 0 ? [h("div", { display: "flex", width: Math.max(40, fill), height: 40, borderRadius: 20, backgroundColor: COLORS.barFill })] : []),
      ]),
      ...(hasTail ? [h("div", { display: "flex", width: TAIL_W, flexShrink: 0, marginLeft: GAP, justifyContent: "flex-end", fontSize: 32, fontStyle: "italic", color: COLORS.green }, r.tail || "")] : []),
    ]);
  });
  return h("div", {
    display: "flex", width: "100%", height: "100%", backgroundColor: COLORS.card, borderRadius: 32,
    flexDirection: "column", padding: `40px ${PAD_X}px 44px`, fontFamily: "Instrument Serif",
  }, [
    h("div", { display: "flex", height: 80, alignItems: "flex-end", fontSize: titleSize(title), color: COLORS.green, lineHeight: 1.05, whiteSpace: "nowrap" }, title),
    ...(subtitle ? [h("div", { display: "flex", fontSize: 36, fontStyle: "italic", color: COLORS.green, marginTop: 4, whiteSpace: "nowrap" }, subtitle)] : []),
    h("div", { display: "flex", flexDirection: "column", gap: 14, marginTop: 34 }, rowEls),
  ]);
}

export function cardSize(rows, hasSubtitle) {
  return { width: CARD_W, height: 40 + 80 + (hasSubtitle ? 44 : 0) + 34 + rows.length * 58 + 30 };
}


// Garden card: one row per unit, one little plant per concept (stage 0-4: seed to flower), and the
// concept count on the right. A legend of the five stages explains what the plants will become.
const G = { plantH: 88, rowH: 100, nameW: 260, countW: 72, maxPlants: 8, legendH: 200 };
const STAGE_NAMES = ["seed", "sprout", "growing", "budding", "flower"];

// The plant pictures are 4:5, so each takes 0.8 * height of width, plus a small gap.
const plantImg = (stage, size) =>
  ({ type: "img", props: { src: plantSrc(stage), width: Math.round(size * 0.8), height: size, style: { marginRight: 6 } } });

export function gardenSize(units, hasSubtitle) {
  return { width: CARD_W, height: 40 + 80 + (hasSubtitle ? 44 : 0) + 30 + units.length * G.rowH + 24 + G.legendH + 30 };
}

export function gardenTree({ title, subtitle, units }) {
  const rows = units.map((u) => {
    const shown = u.stages.slice(0, G.maxPlants), extra = u.stages.length - shown.length;
    return h("div", { display: "flex", alignItems: "center", height: G.rowH }, [
      h("div", { display: "flex", width: G.nameW, flexShrink: 0, fontSize: 36, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden" }, u.name),
      h("div", { display: "flex", flexGrow: 1, alignItems: "flex-end", height: G.plantH }, [
        ...shown.map((st) => plantImg(st, G.plantH)),
        ...(extra > 0 ? [h("div", { display: "flex", fontSize: 30, fontStyle: "italic", color: COLORS.barFill, marginBottom: 20 }, `+${extra}`)] : []),
      ]),
      h("div", { display: "flex", width: G.countW, flexShrink: 0, justifyContent: "flex-end", fontSize: 44, color: COLORS.green }, String(u.stages.length)),
    ]);
  });
  const legend = h("div", { display: "flex", flexDirection: "column", marginTop: 24, paddingTop: 18, borderTop: `3px solid ${COLORS.track}` }, [
    h("div", { display: "flex", fontSize: 32, fontStyle: "italic", color: COLORS.barFill, marginBottom: 8 }, "Each plant is one concept, and the number counts them."),
    h("div", { display: "flex", fontSize: 32, fontStyle: "italic", color: COLORS.barFill, marginBottom: 8 }, "They grow as you master them:"),
    h("div", { display: "flex", justifyContent: "space-between" }, STAGE_NAMES.map((name, i) =>
      h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 150 }, [
        plantImg(i, 64),
        h("div", { display: "flex", fontSize: 28, color: COLORS.green, marginTop: 4 }, name),
      ]))),
  ]);
  return h("div", {
    display: "flex", width: "100%", height: "100%", backgroundColor: COLORS.card, borderRadius: 32,
    flexDirection: "column", padding: `40px ${PAD_X}px 30px`, fontFamily: "Instrument Serif",
  }, [
    h("div", { display: "flex", height: 80, alignItems: "flex-end", fontSize: titleSize(title), color: COLORS.green, lineHeight: 1.05, whiteSpace: "nowrap" }, title),
    ...(subtitle ? [h("div", { display: "flex", fontSize: 36, fontStyle: "italic", color: COLORS.green, marginTop: 4, whiteSpace: "nowrap" }, subtitle)] : []),
    h("div", { display: "flex", flexDirection: "column", marginTop: 30 }, rows),
    legend,
  ]);
}

// Query: title, subtitle, repeated u=unit name~stages, where stages is one digit 0-4 per concept ("0000").
export function parseGardenQuery(params) {
  const units = params.getAll("u").slice(0, 12).map((raw) => {
    const [name = "", stages = ""] = raw.split("~");
    return { name: clip(name.trim(), 20), stages: [...stages].filter((c) => /[0-4]/.test(c)).map(Number) };
  });
  return {
    title: clip(params.get("title") || "Your course", 46),
    subtitle: clip(params.get("subtitle") || "", 60),
    units,
  };
}

export function buttonTree({ label, variant }) {
  const primary = variant !== "secondary";
  return h("div", {
    display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center",
    borderRadius: 18, backgroundColor: primary ? COLORS.primary : COLORS.track,
    color: primary ? COLORS.card : COLORS.green, fontSize: 46, fontFamily: "Instrument Serif",
  }, label);
}

export const BUTTON_SIZE = { width: 540, height: 112 };

export function png(tree, size) {
  return new ImageResponse(tree, {
    ...size,
    fonts: FONTS,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

// Query: title, subtitle, and repeated r=label~value~tail (value 0..1).
export function parseCardQuery(params) {
  const rows = params.getAll("r").slice(0, 12).map((raw) => {
    const [label = "", value = "0", tail = ""] = raw.split("~");
    return { label: clip(label.trim(), 22), value: Number(value) || 0, tail: clip(tail.trim(), 8) };
  });
  return {
    title: clip(params.get("title") || "Your course", 46),
    subtitle: clip(params.get("subtitle") || "", 60),
    rows,
  };
}

// Journey map: rows of concept boxes joined by arrows. Done concepts are faded green,
// the current one dark green, next ones tan; positions are computed here, since
// Satori has no layout engine for free-floating boxes and lines.
const JOURNEY = {
  boxH: 80, rowGap: 110, top: 40 + 80 + 44 + 44, bottom: 44, maxBoxW: 400, boxGap: 40,
  fill: { done: COLORS.barFill, current: COLORS.primary, next: COLORS.track, later: COLORS.track },
  text: { done: "#B9D3BF", current: COLORS.card, next: COLORS.green, later: COLORS.green },
};

export function journeyLayout(nodes) {
  const rows = [...new Set(nodes.map((n) => n.row))].sort((a, b) => a - b);
  const width = CARD_W - 2 * PAD_X;
  const placed = nodes.map((n) => ({ ...n }));
  rows.forEach((row, r) => {
    const inRow = placed.filter((n) => n.row === row);
    const w = Math.min(JOURNEY.maxBoxW, Math.floor((width - (inRow.length - 1) * JOURNEY.boxGap) / inRow.length));
    const total = inRow.length * w + (inRow.length - 1) * JOURNEY.boxGap;
    inRow.forEach((n, i) => {
      n.x = PAD_X + Math.round((width - total) / 2) + i * (w + JOURNEY.boxGap);
      n.y = JOURNEY.top + r * (JOURNEY.boxH + JOURNEY.rowGap);
      n.w = w;
    });
  });
  const height = JOURNEY.top + rows.length * JOURNEY.boxH + Math.max(0, rows.length - 1) * JOURNEY.rowGap + JOURNEY.bottom;
  return { nodes: placed, size: { width: CARD_W, height } };
}

function arrow(from, to) {
  // Leaves the bottom of one box on the side nearest its target and lands on the top of the next.
  const toMid = to.x + to.w / 2, fromMid = from.x + from.w / 2;
  const x1 = Math.max(from.x + from.w * 0.2, Math.min(from.x + from.w * 0.8, fromMid + (toMid - fromMid) * 0.5));
  const x2 = Math.max(to.x + to.w * 0.2, Math.min(to.x + to.w * 0.8, toMid + (fromMid - toMid) * 0.35));
  const y1 = from.y + JOURNEY.boxH + 6, y2 = to.y - 8;
  const angle = Math.atan2(y2 - y1, x2 - x1), head = 20, spread = 0.5;
  const hx = (a) => x2 - head * Math.cos(angle + a), hy = (a) => y2 - head * Math.sin(angle + a);
  const stroke = { stroke: COLORS.primary, strokeWidth: 5, strokeLinecap: "round", fill: "none" };
  return [
    { type: "line", props: { x1, y1, x2, y2, ...stroke } },
    { type: "polyline", props: { points: `${hx(spread)},${hy(spread)} ${x2},${y2} ${hx(-spread)},${hy(-spread)}`, ...stroke } },
  ];
}

// Largest size (40 down to 26) at which the label fits on one line, or else on two.
function boxFontSize(label, boxW) {
  const room = boxW - 36, width = (size) => label.length * 0.43 * size;
  if (width(40) <= room) return 40;
  return Math.max(26, Math.min(36, Math.floor((room * 1.8) / (label.length * 0.43))));
}

export function journeyTree({ title, subtitle, nodes, edges }, layout) {
  const boxes = layout.nodes.map((n) => h("div", {
    display: "flex", position: "absolute", left: n.x, top: n.y, width: n.w, height: JOURNEY.boxH,
    alignItems: "center", justifyContent: "center", textAlign: "center", borderRadius: 16, padding: "0 18px",
    backgroundColor: JOURNEY.fill[n.state], color: JOURNEY.text[n.state],
    fontSize: boxFontSize(n.label, n.w), lineHeight: 1.0, overflow: "hidden",
  }, n.label));
  const lines = edges.flatMap(([a, b]) => (layout.nodes[a] && layout.nodes[b] ? arrow(layout.nodes[a], layout.nodes[b]) : []));
  return h("div", {
    display: "flex", position: "relative", width: "100%", height: "100%", backgroundColor: COLORS.card,
    borderRadius: 32, flexDirection: "column", padding: `40px ${PAD_X}px 0`, fontFamily: "Instrument Serif",
  }, [
    h("div", { display: "flex", height: 80, alignItems: "flex-end", fontSize: titleSize(title), color: COLORS.green, lineHeight: 1.05, whiteSpace: "nowrap" }, title),
    h("div", { display: "flex", fontSize: 36, fontStyle: "italic", color: COLORS.green, marginTop: 4, whiteSpace: "nowrap" }, subtitle || "your learning journey"),
    { type: "svg", props: {
      width: layout.size.width, height: layout.size.height, viewBox: `0 0 ${layout.size.width} ${layout.size.height}`,
      style: { position: "absolute", left: 0, top: 0 }, children: lines,
    } },
    ...boxes,
  ]);
}

// Query: title, subtitle, repeated n=row~state~label (state: done/current/next/later)
// and e=a-b arrows between node indexes in the order given.
export function parseJourneyQuery(params) {
  const states = new Set(["done", "current", "next", "later"]);
  const nodes = params.getAll("n").slice(0, 12).map((raw) => {
    const [row = "0", state = "next", ...label] = raw.split("~");
    return { row: Number(row) || 0, state: states.has(state) ? state : "next", label: clip(label.join("~").trim(), 48) };
  });
  const edges = params.getAll("e").slice(0, 24)
    .map((raw) => raw.split("-").map(Number))
    .filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b));
  return {
    title: clip(params.get("title") || "Your course", 46),
    subtitle: clip(params.get("subtitle") || "", 60),
    nodes,
    edges,
  };
}

// Product tile for the store carousel: 4:3, leaf in the corner, name, price, delivery tag.
export const PRODUCT_SIZE = { width: 1200, height: 900 };
const LEAF = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "leaf.png")).toString("base64")}`;

export function productTree({ name, category, price, tag, desc }) {
  const nameSize = name.length > 24 ? 84 : 104;
  return h("div", {
    display: "flex", width: "100%", height: "100%", backgroundColor: COLORS.card, borderRadius: 40,
    flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", position: "relative",
    fontFamily: "Instrument Serif",
  }, [
    { type: "img", props: { src: LEAF, width: 260, height: 262, style: { position: "absolute", top: -20, right: -24, transform: "rotate(90deg)" } } },
    h("div", { display: "flex", flexDirection: "column", width: 820 }, [
      h("div", { display: "flex", fontSize: 44, fontStyle: "italic", color: COLORS.green }, category),
      h("div", { display: "flex", fontSize: nameSize, color: COLORS.green, lineHeight: 1.02, marginTop: 18 }, name),
      ...(desc ? [h("div", { display: "flex", fontSize: 46, color: COLORS.ink, lineHeight: 1.2, marginTop: 30, opacity: 0.85 }, desc)] : []),
    ]),
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
      h("div", { display: "flex", fontSize: 120, color: COLORS.ink, lineHeight: 1 }, price),
      h("div", {
        display: "flex", padding: "14px 34px", borderRadius: 40, fontSize: 44,
        backgroundColor: tag === "Ships" ? COLORS.track : COLORS.primary,
        color: tag === "Ships" ? COLORS.green : COLORS.card,
      }, tag),
    ]),
  ]);
}

// Wide tile for carousels, which crop to about 16:9 and print the name and price below the image.
export const PRODUCT_WIDE_SIZE = { width: 1200, height: 675 };

export function productWideTree({ name, category, tag }) {
  return h("div", {
    display: "flex", width: "100%", height: "100%", backgroundColor: COLORS.card,
    flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", position: "relative",
    fontFamily: "Instrument Serif",
  }, [
    { type: "img", props: { src: LEAF, width: 300, height: 302, style: { position: "absolute", bottom: -40, right: -30, transform: "rotate(180deg)" } } },
    h("div", { display: "flex", flexDirection: "column", width: 860 }, [
      h("div", { display: "flex", fontSize: 44, fontStyle: "italic", color: COLORS.green }, category),
      h("div", { display: "flex", fontSize: name.length > 24 ? 92 : 112, color: COLORS.green, lineHeight: 1.02, marginTop: 14 }, name),
    ]),
    h("div", { display: "flex" }, [
      h("div", {
        display: "flex", padding: "14px 34px", borderRadius: 40, fontSize: 44,
        backgroundColor: tag === "Ships" ? COLORS.track : COLORS.primary,
        color: tag === "Ships" ? COLORS.green : COLORS.card,
      }, tag),
    ]),
  ]);
}

export function parseProductQuery(params) {
  return {
    name: clip(params.get("name") || "Sprout", 40),
    category: clip(params.get("category") || "", 30),
    price: clip(params.get("price") || "", 10),
    tag: params.get("tag") === "Ships" ? "Ships" : "Digital",
    desc: clip(params.get("desc") || "", 90),
  };
}

// Live game invite: the join code as big tiles, where to join, and what's in the game.
export const GAME_SIZE = { width: 1080, height: 700 };

export function gameTree({ course, code, join, questions, seconds, topics, arcade }) {
  const tiles = code.split("").map((ch) => h("div", {
    display: "flex", width: 132, height: 164, alignItems: "center", justifyContent: "center",
    borderRadius: 22, backgroundColor: COLORS.primary, color: COLORS.card, fontSize: 118, lineHeight: 1,
  }, ch));
  const chips = topics.map((t) => h("div", {
    display: "flex", padding: "6px 22px 10px", borderRadius: 30, backgroundColor: COLORS.track,
    color: COLORS.green, fontSize: 32, whiteSpace: "nowrap",
  }, t));
  return h("div", {
    display: "flex", width: "100%", height: "100%", backgroundColor: COLORS.card, borderRadius: 32,
    flexDirection: "column", padding: `40px ${PAD_X}px 44px`, fontFamily: "Instrument Serif",
  }, [
    h("div", { display: "flex", fontSize: 36, fontStyle: "italic", color: COLORS.green }, arcade ? `arcade · ${arcade}` : "live game"),
    h("div", { display: "flex", fontSize: titleSize(course), color: COLORS.green, lineHeight: 1.05, whiteSpace: "nowrap" }, course),
    h("div", { display: "flex", gap: 16, justifyContent: "center", marginTop: 40 }, tiles),
    h("div", { display: "flex", justifyContent: "center", marginTop: 26, fontSize: 38, color: COLORS.ink }, arcade ? `Play at ${join}` : `Join at ${join} and type the code`),
    h("div", { display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 30 }, chips),
    h("div", { display: "flex", justifyContent: "center", marginTop: "auto", fontSize: 32, fontStyle: "italic", color: COLORS.barFill },
      arcade ? `${questions} questions · play at your own pace · shared high scores` : `${questions} questions, ${seconds} seconds each`),
  ]);
}

// Query: course, code, join, q (question count), s (seconds), repeated t=topic.
export function parseGameQuery(params) {
  return {
    course: clip(params.get("course") || "Sprout", 40),
    code: (params.get("code") || "------").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6).padEnd(6, "-"),
    join: clip(params.get("join") || "sproutlearn.tech/play", 48),
    questions: Math.max(1, Math.min(20, Number(params.get("q")) || 8)),
    seconds: Math.max(5, Math.min(120, Number(params.get("s")) || 20)),
    topics: params.getAll("t").slice(0, 4).map((t) => clip(t.trim(), 26)),
    arcade: clip(params.get("arcade") || "", 24),
  };
}

// Final standings: a podium for the top three, then rows for the rest. "me" marks the student.
export const PODIUM_W = 1080;
const PODIUM = { top: 40 + 80 + 44, stage: 420, row: 58, bottom: 40 };

export function podiumSize(players) {
  const extra = Math.max(0, players.length - 3);
  return { width: PODIUM_W, height: PODIUM.top + PODIUM.stage + (extra ? 20 + extra * PODIUM.row : 0) + PODIUM.bottom };
}

export function podiumTree({ title, subtitle, players }) {
  const byRank = (i) => players[i];
  const step = (p) => {
    if (!p) return h("div", { display: "flex", width: 300 }, []);
    const place = Math.max(1, Math.min(3, p.rank));  // tied players share a step
    const height = { 1: 230, 2: 170, 3: 120 }[place];
    const fill = { 1: COLORS.primary, 2: COLORS.barFill, 3: COLORS.track }[place];
    const ink = place === 3 ? COLORS.green : COLORS.card;
    return h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 300 }, [
      h("div", { display: "flex", fontSize: 44, color: COLORS.ink, whiteSpace: "nowrap", textDecoration: p.me ? "underline" : "none" }, clip(p.name, 14)),
      h("div", { display: "flex", fontSize: 32, fontStyle: "italic", color: COLORS.green, marginBottom: 10 }, p.score.toLocaleString("en-US")),
      h("div", { display: "flex", width: 300, height, borderRadius: "22px 22px 0 0", backgroundColor: fill, color: ink,
        alignItems: "center", justifyContent: "center", fontSize: 84 }, String(p.rank)),
    ]);
  };
  const rest = players.slice(3).map((p) => h("div", { display: "flex", alignItems: "center", height: 48, fontSize: 36, color: COLORS.ink }, [
    h("div", { display: "flex", width: 80, color: COLORS.barFill }, String(p.rank)),
    h("div", { display: "flex", width: 640, textDecoration: p.me ? "underline" : "none" }, clip(p.name, 24)),
    h("div", { display: "flex", width: 264, justifyContent: "flex-end" }, p.score.toLocaleString("en-US")),
  ]));
  return h("div", {
    display: "flex", width: "100%", height: "100%", backgroundColor: COLORS.card, borderRadius: 32,
    flexDirection: "column", padding: `40px ${PAD_X}px ${PODIUM.bottom}px`, fontFamily: "Instrument Serif",
  }, [
    h("div", { display: "flex", height: 80, alignItems: "flex-end", fontSize: titleSize(title), color: COLORS.green, lineHeight: 1.05, whiteSpace: "nowrap" }, title),
    h("div", { display: "flex", fontSize: 36, fontStyle: "italic", color: COLORS.green, marginTop: 4, whiteSpace: "nowrap" }, subtitle),
    h("div", { display: "flex", height: PODIUM.stage, alignItems: "flex-end", justifyContent: "center", gap: 18, borderBottom: `4px solid ${COLORS.track}` },
      [step(byRank(1)), step(byRank(0)), step(byRank(2))]),
    ...(rest.length ? [h("div", { display: "flex", flexDirection: "column", marginTop: 20, gap: 10 }, rest)] : []),
  ]);
}

// Query: title, subtitle, repeated p=rank~score~name, me=index of the student's row (optional).
export function parsePodiumQuery(params) {
  const me = params.get("me");
  const players = params.getAll("p").slice(0, 6).map((raw, i) => {
    const [rank = "0", score = "0", ...name] = raw.split("~");
    return { rank: Number(rank) || i + 1, score: Number(score) || 0, name: clip(name.join("~").trim() || "Player", 24), me: me !== null && Number(me) === i };
  });
  return {
    title: clip(params.get("title") || "Final results", 46),
    subtitle: clip(params.get("subtitle") || "", 60),
    players,
  };
}
