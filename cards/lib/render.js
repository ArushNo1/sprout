// Draws Sprout's cards as plain element trees for @vercel/og (no JSX build step).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "@vercel/og";

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

export function parseProductQuery(params) {
  return {
    name: clip(params.get("name") || "Sprout", 40),
    category: clip(params.get("category") || "", 30),
    price: clip(params.get("price") || "", 10),
    tag: params.get("tag") === "Ships" ? "Ships" : "Digital",
    desc: clip(params.get("desc") || "", 90),
  };
}
