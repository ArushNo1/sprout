// The garden's plant art as SVG strings, ported from web/components/Plant.tsx, so cards can show
// the same plants the garden page does. Stages 0-4: seed, sprout, sapling, budding, flowering.
const C = { card: "#F4EADF", green: "#0B6122", fill: "#4E8A5E", track: "#DCCBB2", primary: "#0A4D17", vein: "#A4D7A2" };
const X = 40, Y = 86;

const leaf = (x, y, angle, L, W, fill = C.green, vein = true) =>
  `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M0 0 C${L * 0.25} ${-W} ${L * 0.75} ${-W} ${L} 0 C${L * 0.75} ${W} ${L * 0.25} ${W} 0 0Z" fill="${fill}"/>` +
  (vein ? `<path d="M${L * 0.12} 0 L${L * 0.8} 0" stroke="${C.vein}" stroke-width="1.3" stroke-linecap="round"/>` : "") + `</g>`;
const stem = (top, bend = 0) =>
  `<path d="M${X} ${Y} Q${X + bend} ${(Y + top) / 2} ${X} ${top}" stroke="${C.green}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`;
const flower = (cx, cy) =>
  [0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="${cx}" cy="${cy - 8.5}" rx="5.2" ry="8.5" transform="rotate(${a} ${cx} ${cy})" fill="${C.track}" stroke="${C.green}" stroke-width="1.3"/>`).join("") +
  `<circle cx="${cx}" cy="${cy}" r="5.4" fill="${C.primary}"/><circle cx="${cx - 1.4}" cy="${cy - 1.4}" r="1.8" fill="${C.vein}"/>`;
const bud = (cx, cy) =>
  `<path d="M${cx} ${cy - 11} C${cx + 7} ${cy - 5} ${cx + 6} ${cy + 3} ${cx} ${cy + 3} C${cx - 6} ${cy + 3} ${cx - 7} ${cy - 5} ${cx} ${cy - 11}Z" fill="${C.track}" stroke="${C.green}" stroke-width="1.3"/>` +
  leaf(cx, cy + 3, -125, 8, 3.2, C.green, false) + leaf(cx, cy + 3, -55, 8, 3.2, C.green, false);

const GROWTH = [
  () => `<ellipse cx="${X}" cy="82.5" rx="8.5" ry="6" transform="rotate(-18 ${X} 82.5)" fill="${C.card}" stroke="${C.green}" stroke-width="1.6"/><path d="M${X - 4} 81 Q${X} 78 ${X + 4} 79.5" stroke="${C.fill}" stroke-width="1.1" stroke-linecap="round" fill="none"/>`,
  () => stem(68, 3) + leaf(X, 68, -155, 13, 6, C.fill, false) + leaf(X, 68, -25, 13, 6, C.fill, false),
  () => stem(50, -4) + leaf(X - 1, 74, -165, 17, 7) + leaf(X - 1, 64, -15, 17, 7) + leaf(X, 51, -140, 12, 5, C.fill, false) + leaf(X, 51, -40, 12, 5, C.fill, false),
  () => stem(38, 4) + leaf(X + 1, 76, -168, 19, 8) + leaf(X + 1, 66, -12, 19, 8) + leaf(X + 1, 55, -150, 15, 6.5) + bud(X, 35),
  () => stem(36, -4) + leaf(X - 1, 76, -168, 19, 8) + leaf(X - 1, 67, -12, 19, 8) + leaf(X - 1, 56, -155, 15, 6.5) + leaf(X - 1, 48, -28, 13, 5.5) + flower(X, 24),
];

// Early stages are drawn small; scale them up from the soil so a seed or sprout reads at card size.
const SCALE = [1.9, 1.55, 1.2, 1, 1];
const grown = (i) => SCALE[i] === 1 ? GROWTH[i]() : `<g transform="translate(${X} 88) scale(${SCALE[i]}) translate(${-X} -88)">${GROWTH[i]()}</g>`;

// An 80x100 picture of one plant on its patch of soil, as a data URI for an <img>.
export function plantSrc(stage) {
  const s = Math.max(0, Math.min(4, stage | 0));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" width="80" height="100">${grown(s)}` +
    `<ellipse cx="${X}" cy="91" rx="27" ry="7.5" fill="${C.track}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
