// Generates one standalone HyperFrames composition per motion graphic (G01.html … G16.html).
// Run: node build.mjs → scenes/G01 … scenes/G16, each a renderable HyperFrames project.
import { writeFileSync, mkdirSync, existsSync, symlinkSync } from "node:fs";

const W = 1920, H = 1080;

const COMMON_CSS = `
@font-face { font-family: "Instrument Serif"; src: url("assets/InstrumentSerif-Regular.ttf") format("truetype"); font-weight: 400; font-style: normal; }
@font-face { font-family: "Instrument Serif"; src: url("assets/InstrumentSerif-Italic.ttf") format("truetype"); font-weight: 400; font-style: italic; }
@font-face { font-family: "DejaVu Sans Mono"; src: url("assets/DejaVuSansMono.ttf") format("truetype"); font-weight: 400; font-style: normal; }
:root {
  --paper: #fbf6ef; --cream: #f4eadf; --tan: #dccbb2; --green: #0b6122; --primary: #0a4d17;
  --mid: #4e8a5e; --vein: #a4d7a2; --bloom: #e8a33d; --wilt: #b0584c; --focus: #1f6fb2; --ink: #222222;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: transparent; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Instrument Serif", Georgia, serif; color: var(--ink); }
.scene { position: absolute; inset: 0; }
.abs { position: absolute; }
#bg { position: absolute; inset: 0;
  background: radial-gradient(1300px 900px at 18% 12%, #ffffff 0%, rgba(255,255,255,0) 70%),
              radial-gradient(1200px 900px at 92% 95%, #dcebd3 0%, rgba(220,235,211,0) 70%), #f3ebdd; }
.leaf { position: absolute; width: 300px; height: auto; opacity: 0.9; }
#leaf-a { left: -90px; top: -80px; }
#leaf-b { right: -100px; bottom: -90px; }
.frost { background: rgba(255,255,255,0.66); border: 2px solid rgba(11,97,34,0.16); border-radius: 36px;
  box-shadow: 0 30px 80px rgba(11,97,34,0.14), inset 0 2px 0 rgba(255,255,255,0.85); }
.over .frost { background: rgba(255,253,249,0.95); }
.solid { background: #fffdf9; border: 2px solid rgba(11,97,34,0.18); border-radius: 30px;
  box-shadow: 0 24px 60px rgba(11,97,34,0.16); }
.kicker { position: absolute; left: 192px; top: 120px; display: flex; align-items: center; gap: 20px;
  font-style: italic; font-size: 44px; color: var(--mid); }
.kicker i { display: block; width: 80px; height: 4px; background: var(--vein); transform-origin: 0 50%; }
.head { font-size: 96px; line-height: 1.02; letter-spacing: -2px; color: var(--green); }
.chip { display: inline-flex; align-items: center; gap: 14px; font-size: 38px; color: var(--green);
  background: rgba(164,215,162,0.38); border-radius: 999px; padding: 6px 28px 10px; white-space: nowrap; }
.pill { display: inline-flex; align-items: center; justify-content: center; gap: 16px; border-radius: 999px; white-space: nowrap; }
.mono { font-family: "DejaVu Sans Mono", monospace; letter-spacing: -0.5px; }
.it { font-style: italic; }
.dot { width: 16px; height: 16px; border-radius: 50%; background: var(--mid); display: inline-block; flex: none; }
.plant { position: absolute; width: 100%; height: 100%; left: 0; top: 0; }
svg text { font-family: "Instrument Serif", Georgia, serif; }
`;

const LEAF_SVG = (fill = "#0b6122", vein = "#a4d7a2") =>
  `<svg viewBox="0 0 70 70" width="100%" height="100%"><path class="lf" d="M5 62 C5 28 30 6 66 4 C66 38 44 64 5 62Z" fill="${fill}"/><path d="M12 56 L52 18" stroke="${vein}" stroke-width="3" stroke-linecap="round"/></svg>`;

const CHECK = (c = "#0b6122") =>
  `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="18" fill="${c}"/><path d="M11 21 L18 27 L29 14" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const LOCK = `<svg viewBox="0 0 40 46" width="34" height="40"><rect x="4" y="19" width="32" height="25" rx="6" fill="#8a8a82"/><path d="M11 20 V13 a9 9 0 0 1 18 0 V20" stroke="#8a8a82" stroke-width="5" fill="none"/></svg>`;

const stageFor = (m) => (m < 0.2 ? 0 : m < 0.4 ? 1 : m < 0.6 ? 2 : m < 0.8 ? 3 : 4);

// JS shared by every composition: eases, a stroke-draw helper and the corner-leaf drift.
const COMMON_JS = (dur, full) => `
const tl = gsap.timeline({ paused: true });
const E = { out: "power3.out", expo: "expo.out", back: "back.out(1.5)", soft: "sine.inOut", in: "power2.in" };
function draw(sel, t, d, ease) {
  document.querySelectorAll(sel).forEach((el) => {
    const len = el.getTotalLength();
    el.style.strokeDasharray = len + " " + len;
    tl.set(el, { opacity: 0 }, 0);
    tl.set(el, { opacity: 1 }, t);
    tl.fromTo(el, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: d, ease: ease || "power2.inOut" }, t);
  });
}
function kick(t) {
  tl.fromTo("#kick", { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, t);
  tl.fromTo("#kick i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: E.soft }, t + 0.1);
}
function count(el, from, to, t, d, fmt) {
  const o = { v: from };
  const node = document.querySelector(el);
  const f = fmt || ((v) => Math.round(v).toLocaleString("en-US"));
  tl.to(o, { v: to, duration: d, ease: "power2.out", onUpdate: () => { node.textContent = f(o.v); } }, t);
}
${full ? `
tl.fromTo("#leaf-a", { rotate: -12, x: -40, y: -30 }, { rotate: 2, x: 0, y: 0, duration: 1.4, ease: E.out }, 0);
tl.fromTo("#leaf-b", { rotate: 192, x: 40, y: 30 }, { rotate: 180, x: 0, y: 0, duration: 1.4, ease: E.out }, 0.1);
tl.to("#leaf-a", { rotate: -5, duration: ${Math.max(1, dur - 1.5)}, ease: E.soft }, 1.4);
tl.to("#leaf-b", { rotate: 186, duration: ${Math.max(1, dur - 1.5)}, ease: E.soft }, 1.5);` : ""}
`;

function page({ id, title, dur, full, css = "", html, js }) {
  const bg = full
    ? `<div id="bg"><img id="leaf-a" class="leaf" data-layout-allow-overflow src="assets/leaf.png" alt="" /><img id="leaf-b" class="leaf" data-layout-allow-overflow src="assets/leaf.png" alt="" /></div>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${title}</title>
    <script src="assets/gsap.min.js"></script>
    <style>${COMMON_CSS}${css}</style>
  </head>
  <body>
    <div id="root" data-composition-id="${id}" data-start="0" data-duration="${dur}" data-width="${W}" data-height="${H}">
      ${bg}
      <section id="sc" class="scene clip${full ? "" : " over"}" data-start="0" data-duration="${dur}" data-track-index="1">
${html}
      </section>
    </div>
    <script>
${COMMON_JS(dur, full)}
${js}
window.__timelines["${id}"] = tl;
    </script>
  </body>
</html>
`;
}

const G = [];

// ───────────────────────── G01 · Learning is cumulative (FULL, 14s)
{
  const nodes = ["Row operations", "Matrix inverse", "Determinants", "Eigenvalues"];
  const ys = [830, 650, 470, 290];
  G.push({
    id: "G01", title: "Learning is cumulative", dur: 14, full: true,
    css: `
#stem { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; }
.node { position: absolute; left: 640px; height: 100px; display: flex; align-items: center; gap: 22px; }
.node .lw { width: 86px; height: 86px; flex: none; transform-origin: 8% 88%; }
.node .lab { font-size: 50px; color: var(--ink); background: rgba(255,255,255,0.8); border: 2px solid rgba(11,97,34,0.16);
  border-radius: 999px; padding: 6px 32px 10px; white-space: nowrap; }
#ring { position: absolute; left: 622px; top: 762px; width: 136px; height: 136px; border-radius: 50%; border: 5px dashed var(--wilt); }
#bubble { position: absolute; left: 1150px; top: 200px; width: 560px; padding: 30px 40px 36px; border-radius: 36px 36px 36px 8px; }
#bubble small { display: block; font-size: 30px; font-style: italic; color: var(--mid); }
#bubble b { display: block; font-weight: 400; font-size: 60px; color: var(--ink); }
#say { position: absolute; left: 1150px; top: 610px; width: 600px; font-size: 92px; line-height: 1.02; color: var(--green); letter-spacing: -2px; }
#say em { color: var(--wilt); }
`,
    html: `
<div class="kicker" id="kick"><i></i><span>learning is cumulative</span></div>
<svg id="stem" viewBox="0 0 ${W} ${H}"><path id="stem-p" d="M683 960 C672 780 694 600 680 430 C672 330 684 260 683 230" stroke="#0b6122" stroke-width="7" stroke-linecap="round" fill="none"/></svg>
<div id="ring"></div>
${nodes.map((n, i) => `<div class="node" id="n${i}" style="top:${ys[i] - 50}px"><div class="lw" id="lw${i}">${LEAF_SVG()}</div><span class="lab">${n}</span></div>`).join("\n")}
<div class="frost" id="bubble"><small>you, to any chatbot</small><b>“Explain eigenvalues.”</b></div>
<div id="say">It assumes you already know <em class="it">this.</em></div>
`,
    js: `
kick(0.2);
draw("#stem-p", 0.3, 2.6, "power1.inOut");
${ys.map((_, i) => `tl.fromTo("#lw${i}", { scale: 0, rotate: -50 }, { scale: 1, rotate: 0, duration: 0.6, ease: E.back }, ${0.6 + i * 0.6});
tl.fromTo("#n${i} .lab", { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, ${0.75 + i * 0.6});`).join("\n")}
tl.fromTo("#bubble", { y: -40, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: E.expo }, 3.6);
tl.to("#n1, #n2, #n3, #bubble", { opacity: 0.32, duration: 0.8, ease: E.soft }, 6.4);
tl.to("#n0", { scale: 1.12, transformOrigin: "0% 50%", duration: 0.8, ease: E.out }, 6.4);
tl.to("#lw0 .lf", { attr: { fill: "#b0584c" }, duration: 0.8, ease: E.soft }, 6.9);
tl.to("#lw0", { rotate: 34, duration: 1.1, ease: "power2.inOut" }, 6.9);
tl.to("#n0 .lab", { color: "#b0584c", borderColor: "rgba(176,88,76,0.5)", duration: 0.6 }, 6.9);
tl.fromTo("#ring", { scale: 0.6, opacity: 0 }, { scale: 1.05, opacity: 1, duration: 0.6, ease: E.out }, 7.4);
tl.to("#ring", { scale: 1.3, opacity: 0, duration: 1.0, ease: "power1.out" }, 8.1);
tl.fromTo("#ring", { scale: 0.7, opacity: 0.9 }, { scale: 1.3, opacity: 0, duration: 1.2, ease: "power1.out", immediateRender: false }, 9.3);
tl.fromTo("#say", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E.expo }, 8.2);
`,
  });
}

// ───────────────────────── G02 · The context pile (FULL, 17s)
{
  const items = [
    { k: "para", w: 560, x: -40, r: -2 },
    { k: "pdf", t: "lecture-03.pdf", x: 120, r: 3 },
    { k: "para", w: 520, x: 60, r: 1.5 },
    { k: "pdf", t: "notes.pdf", x: -160, r: -4 },
    { k: "syl", w: 600, x: 20, r: -1 },
    { k: "pdf", t: "hw2-solutions.pdf", x: 90, r: 2.5 },
    { k: "para", w: 540, x: -90, r: -3 },
    { k: "pdf", t: "chapter-4-slides.pdf", x: -20, r: 1 },
    { k: "para", w: 500, x: 130, r: 4 },
    { k: "pdf", t: "textbook-excerpt.pdf", x: -110, r: -2 },
  ];
  const words = [0, 640, 1180, 1690, 2320, 2900, 3380, 3910, 4400, 4812];
  const base = 800; // top of input bar
  const step = 46;
  const html = items.map((it, i) => {
    const y = base - 40 - (i + 1) * step;
    let inner;
    if (it.k === "pdf") inner = `<div class="pdf solid" style="margin-left:${it.x}px"><span class="tag mono">PDF</span>${it.t}</div>`;
    else if (it.k === "syl") inner = `<div class="para solid" style="width:${it.w}px;margin-left:${it.x}px"><small>CS 201 · syllabus</small><span style="width:88%"></span><span style="width:70%"></span></div>`;
    else inner = `<div class="para solid" style="width:${it.w}px;margin-left:${it.x}px"><span style="width:94%"></span><span style="width:80%"></span><span style="width:62%"></span></div>`;
    return `<div class="it-w" id="p${i}" style="top:${y}px">${inner}</div>`;
  }).join("\n");
  G.push({
    id: "G02", title: "The context pile", dur: 17, full: true,
    css: `
#bar { position: absolute; left: 410px; width: 1100px; top: ${base}px; height: 116px; display: flex; align-items: center; padding: 0 30px 0 50px; border-radius: 999px; }
#bar span { font-size: 42px; color: #8b8070; font-style: italic; flex: 1; }
#send { width: 74px; height: 74px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; }
#pile { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
.it-w { position: absolute; left: 0; width: ${W}px; display: flex; justify-content: center; }
.para { padding: 18px 26px 20px; border-radius: 20px; }
.para small { display: block; font-size: 28px; color: var(--mid); font-style: italic; margin-bottom: 4px; }
.para span { display: block; height: 12px; border-radius: 6px; background: var(--tan); margin: 9px 0; }
.pdf { display: flex; align-items: center; gap: 18px; font-size: 38px; padding: 10px 30px 14px 14px; border-radius: 999px; }
.pdf .tag { font-size: 22px; color: #fff; background: var(--wilt); border-radius: 999px; padding: 6px 14px; }
#counter { position: absolute; right: 192px; top: 110px; padding: 22px 36px 26px; text-align: right; }
#counter b { display: block; font-weight: 400; font-size: 110px; line-height: 1; color: var(--wilt); letter-spacing: -2px; }
#counter small { font-size: 32px; font-style: italic; color: var(--mid); }
#line2 { position: absolute; left: 192px; top: 190px; font-size: 62px; color: var(--green); width: 760px; line-height: 1.05; }
`,
    html: `
<div class="kicker" id="kick"><i></i><span>the re-explain loop</span></div>
<div id="line2">Every new chat starts from zero.</div>
<div class="frost" id="counter"><b id="wc">0</b><small>words of context pasted</small></div>
<div id="pile">${html}</div>
<div class="frost" id="bar"><span>Message your chatbot…</span><div id="send"><svg viewBox="0 0 40 40" width="34" height="34"><path d="M20 32 V9 M10 18 L20 8 L30 18" stroke="#f4eadf" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>
`,
    js: `
kick(0.2);
tl.fromTo("#bar", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E.expo }, 0.3);
tl.fromTo("#counter", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 0.6);
const rots = ${JSON.stringify(items.map((i) => i.r))};
const words = ${JSON.stringify(words)};
for (let i = 0; i < rots.length; i++) {
  const t = 1.2 + i * 1.05;
  const el = "#p" + i + " > div";
  tl.fromTo(el, { y: -700, rotate: rots[i] * 4, opacity: 0 }, { y: 0, rotate: rots[i], opacity: 1, duration: 0.55, ease: "power2.in" }, t);
  tl.to(el, { scaleY: 0.9, scaleX: 1.04, transformOrigin: "50% 100%", duration: 0.08, ease: "power1.out" }, t + 0.55);
  tl.to(el, { scaleY: 1, scaleX: 1, duration: 0.3, ease: E.back }, t + 0.63);
  count("#wc", words[i], words[i + 1] || words[i], t + 0.55, 0.5);
  tl.to("#bar", { y: 4, duration: 0.08 }, t + 0.55);
  tl.to("#bar", { y: 0, duration: 0.25, ease: E.back }, t + 0.63);
}
tl.fromTo("#line2", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E.out }, 6.0);
tl.to("#pile", { rotate: -1.4, transformOrigin: "50% 74%", duration: 0.45, ease: E.soft }, 13.4);
tl.to("#pile", { rotate: 1.1, duration: 0.6, ease: E.soft }, 13.85);
tl.to("#pile", { rotate: 0, duration: 0.6, ease: E.soft }, 14.45);
`,
  });
}

// ───────────────────────── G03 · Sprout wordmark (FULL, 7s)
G.push({
  id: "G03", title: "Sprout wordmark", dur: 7, full: true,
  css: `
#mini { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
.m { position: absolute; padding: 18px 28px 20px; border-radius: 20px; }
.m span { display: block; height: 12px; border-radius: 6px; background: var(--tan); margin: 9px 0; }
.mp { position: absolute; width: max-content; display: flex; align-items: center; gap: 18px; font-size: 38px; padding: 10px 30px 14px 14px; border-radius: 999px; }
.mp .tag { font-size: 22px; color: #fff; background: var(--wilt); border-radius: 999px; padding: 6px 14px; }
#sweep { position: absolute; left: -1100px; top: 60px; width: 1000px; height: auto; }
#wm { position: absolute; left: 0; right: 0; top: 300px; display: flex; flex-direction: column; align-items: center; }
#wmw { position: relative; font-size: 300px; line-height: 1; letter-spacing: -6px; color: var(--green); padding-right: 60px; }
#wmask { display: block; overflow: hidden; padding: 0 30px 40px 0; }
#word { display: block; }
#wleaf { position: absolute; right: 4px; top: 30px; width: 70px; height: 70px; }
#tag { font-style: italic; font-size: 72px; color: var(--green); margin-top: 0; }
`,
  html: `
<div id="mini">
  <div class="m solid" style="left:640px;top:330px;width:560px" data-r="-2"><span style="width:94%"></span><span style="width:80%"></span><span style="width:62%"></span></div>
  <div class="mp solid" style="left:820px;top:430px" data-r="3"><span class="tag mono">PDF</span>lecture-03.pdf</div>
  <div class="m solid" style="left:700px;top:500px;width:520px" data-r="1.5"><span style="width:90%"></span><span style="width:70%"></span></div>
  <div class="mp solid" style="left:600px;top:600px" data-r="-4"><span class="tag mono">PDF</span>notes.pdf</div>
  <div class="m solid" style="left:760px;top:670px;width:600px" data-r="-1"><span style="width:88%"></span><span style="width:76%"></span><span style="width:52%"></span></div>
</div>
<img id="sweep" src="assets/leaf.png" alt="" data-layout-allow-overflow />
<div id="wm">
  <div id="wmw"><span id="wmask"><span id="word">sprout</span></span><div id="wleaf">${LEAF_SVG()}</div></div>
  <div id="tag">a study partner that remembers what you know</div>
</div>
`,
  js: `
document.querySelectorAll("#mini > div").forEach((el, i) => {
  tl.fromTo(el, { x: 0, y: 0, rotate: +el.dataset.r, opacity: 1 }, { x: 1500, y: -260, rotate: 40, opacity: 0, duration: 0.9, ease: "power2.in", immediateRender: true }, 0.75 + i * 0.05);
});
tl.fromTo("#sweep", { x: 0, y: 260, rotate: -40 }, { x: 3200, y: -120, rotate: 30, duration: 1.3, ease: "power2.inOut" }, 0.5);
tl.fromTo("#word", { yPercent: 105, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 0.9, ease: E.expo }, 1.6);
tl.fromTo("#wleaf", { scale: 0, rotate: -60, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.6, ease: E.back }, 2.25);
tl.fromTo("#tag", { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 2.6);
`,
});

// ───────────────────────── G04 · Five verbs (FULL, 18s)
{
  const verbs = ["map the course", "find the gaps", "teach the next thing", "schedule the review", "pick up where you left off"];
  const t0 = [2.0, 4.6, 7.0, 9.4, 11.8];
  G.push({
    id: "G04", title: "Five verbs", dur: 18, full: true,
    css: `
#card { position: absolute; left: 192px; top: 230px; width: 600px; height: 620px; padding: 50px 54px; }
#card .wm { position: relative; font-size: 168px; line-height: 1; color: var(--green); letter-spacing: -4px; margin-top: 40px; display: inline-block; padding-right: 50px; }
#card .wm .lw { position: absolute; right: -2px; top: 18px; width: 48px; height: 48px; }
#card .handle { font-size: 30px; color: var(--mid); margin-top: 18px; }
#card .desc { font-size: 50px; font-style: italic; color: var(--ink); margin-top: 60px; line-height: 1.1; }
.row { position: absolute; left: 960px; height: 120px; display: flex; align-items: center; gap: 30px; }
.row .pb { position: relative; width: 84px; height: 105px; flex: none; }
.row span { font-size: 60px; color: var(--ink); white-space: nowrap; }
#loop { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; }
#loopl { position: absolute; left: 1560px; display: none; top: 500px; font-size: 36px; font-style: italic; color: var(--mid); width: 170px; }
`,
    html: `
<div class="frost" id="card">
  <span class="chip"><span class="dot"></span>in ASI:One</span><br/>
  <div class="wm">sprout<div class="lw">${LEAF_SVG()}</div></div>
  <div class="handle mono">@blank-agent-184</div>
  <div class="desc">an adaptive study partner, built from five agents</div>
</div>
${verbs.map((v, i) => `<div class="row" id="r${i}" style="top:${215 + i * 132}px"><div class="pb"><img class="plant" src="assets/plant-${i}.svg" alt="" /></div><span>${v}</span></div>`).join("\n")}
<svg id="loop" viewBox="0 0 ${W} ${H}"><path id="loopp" d="M950 815 C860 790 840 620 845 520 C850 400 870 300 948 275" stroke="#a4d7a2" stroke-width="6" fill="none" stroke-linecap="round"/><path id="loopa" d="M922 256 L950 275 L926 298" stroke="#a4d7a2" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
`,
    js: `
tl.fromTo("#card", { x: -80, opacity: 0, scale: 0.96 }, { x: 0, opacity: 1, scale: 1, duration: 0.8, ease: E.expo }, 0.3);
tl.fromTo("#card .lw", { scale: 0, rotate: -60 }, { scale: 1, rotate: 0, duration: 0.6, ease: E.back }, 0.9);
${t0.map((t, i) => `tl.fromTo("#r${i}", { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E.out }, ${t});
tl.fromTo("#r${i} .pb", { scale: 0.4, transformOrigin: "50% 100%" }, { scale: 1, duration: 0.6, ease: E.back }, ${t});`).join("\n")}
tl.to("#r0, #r1, #r2, #r3", { opacity: 0.55, duration: 0.6 }, 13.2);
draw("#loopp", 13.4, 1.4, "power2.inOut");
tl.fromTo("#loopa", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 14.7);
tl.to("#r0, #r1, #r2, #r3", { opacity: 1, duration: 0.6, stagger: 0.12 }, 14.8);
`,
  });
}

// ───────────────────────── G05 · Play together (FULL, 8s)
{
  const code = "48219".split("").map((c) => `<span>${c}</span>`).join("");
  G.push({
    id: "G05", title: "Play together", dur: 8, full: true,
    css: `
#copy { position: absolute; left: 192px; top: 300px; width: 640px; }
#copy .sub { font-size: 48px; line-height: 1.15; margin-top: 30px; opacity: 0.85; }
.dev { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; border: 6px solid #2f3a32; background: #fffdf9; }
.dev .code { display: flex; gap: 10px; font-size: 64px; color: var(--green); }
.dev .code span { width: 52px; text-align: center; border-bottom: 4px solid var(--vein); }
.dev .st { font-size: 34px; font-style: italic; color: #8b8070; display: flex; align-items: center; gap: 12px; }
.dev .st i { width: 20px; height: 20px; border-radius: 50%; background: var(--tan); display: block; }
#lap { left: 880px; top: 220px; width: 600px; height: 380px; border-radius: 24px; }
#lapbase { position: absolute; left: 840px; top: 600px; width: 680px; height: 26px; border-radius: 0 0 20px 20px; background: #2f3a32; }
#tab { left: 1100px; top: 640px; width: 400px; height: 290px; border-radius: 30px; }
#tab .code { font-size: 52px; } #tab .code span { width: 42px; }
#pho { left: 1530px; top: 330px; width: 200px; height: 400px; border-radius: 36px; }
#pho .code { font-size: 40px; gap: 4px; } #pho .code span { width: 30px; } #pho .st { font-size: 28px; }
#net { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; }
#db { position: absolute; left: 1260px; top: 960px; transform-origin: 50% 50%; }
`,
    html: `
<div id="copy"><div class="head">Turn any course into a game</div><div class="sub">Friends join with one code, from any device, in real time.</div></div>
<svg id="net" viewBox="0 0 ${W} ${H}"><path id="netp" d="M1180 626 C1180 760 1300 800 1330 960 M1300 930 C1330 860 1630 820 1630 730" stroke="#a4d7a2" stroke-width="6" fill="none" stroke-linecap="round"/></svg>
<div class="dev" id="lap"><div class="code">${code}</div><div class="st"><i></i><em>host · waiting</em></div></div>
<div id="lapbase"></div>
<div class="dev" id="tab"><div class="code">${code}</div><div class="st"><i></i><em>joining…</em></div></div>
<div class="dev" id="pho"><div class="code">${code}</div><div class="st"><i></i><em>joining…</em></div></div>
<span class="chip mono" id="db" style="font-size:30px">SpacetimeDB</span>
`,
    js: `
tl.fromTo("#copy .head", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E.expo }, 0.2);
tl.fromTo("#copy .sub", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 0.5);
tl.fromTo("#lap, #lapbase", { y: 60, opacity: 0, rotate: -3 }, { y: 0, opacity: 1, rotate: 0, duration: 0.7, ease: E.expo }, 0.8);
tl.fromTo("#tab", { y: 80, opacity: 0, rotate: 4 }, { y: 0, opacity: 1, rotate: 0, duration: 0.7, ease: E.expo }, 1.1);
tl.fromTo("#pho", { x: 80, opacity: 0, rotate: 5 }, { x: 0, opacity: 1, rotate: 0, duration: 0.7, ease: E.expo }, 1.4);
draw("#netp", 2.4, 1.0);
tl.fromTo("#db", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: E.back }, 2.9);
const join = (sel, t, label) => {
  tl.to(sel + " .st i", { backgroundColor: "#4e8a5e", scale: 1.3, duration: 0.25, ease: E.out }, t);
  tl.to(sel + " .st i", { scale: 1, duration: 0.3, ease: E.back }, t + 0.25);
  tl.set(sel + " .st em", { textContent: label }, t);
  tl.to(sel + " .st", { color: "#0b6122", duration: 0.3 }, t);
};
join("#lap", 3.4, "host · 3 players");
join("#tab", 4.0, "joined");
join("#pho", 4.6, "joined");
`,
  });
}

// ───────────────────────── G06 · The router (FULL, 8s)
{
  const cx = 960, cy = 560;
  const spec = [
    { n: "Curriculum", x: 520, y: 330 },
    { n: "Tutor", x: 1400, y: 330 },
    { n: "Garden", x: 1400, y: 790 },
    { n: "Arcade", x: 520, y: 790 },
  ];
  G.push({
    id: "G06", title: "The router", dur: 8, full: true,
    css: `
#edges { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; }
#hub { position: absolute; left: ${cx - 150}px; top: ${cy - 150}px; width: 300px; height: 300px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
#hub b { font-weight: 400; font-size: 92px; color: var(--green); line-height: 1; }
#hub small { font-size: 30px; font-style: italic; color: var(--mid); }
.sp { position: absolute; width: 330px; height: 110px; margin-left: -165px; margin-top: -55px; display: flex; align-items: center; justify-content: center; font-size: 52px; color: var(--green); }
#msg { position: absolute; left: 230px; top: ${cy - 40}px; font-size: 36px; padding: 10px 30px 14px; background: var(--focus); color: #fff; }
#cap { position: absolute; left: 0; right: 0; top: 925px; text-align: center; font-size: 44px; font-style: italic; color: var(--mid); }
`,
    html: `
<div class="kicker" id="kick"><i></i><span>not a single prompt</span></div>
<svg id="edges" viewBox="0 0 ${W} ${H}">
${spec.map((s, i) => `<line id="e${i}" x1="${cx}" y1="${cy}" x2="${s.x}" y2="${s.y}" stroke="#dccbb2" stroke-width="6" stroke-linecap="round"/>`).join("")}
<line id="hot" x1="${cx}" y1="${cy}" x2="${spec[0].x}" y2="${spec[0].y}" stroke="#0b6122" stroke-width="9" stroke-linecap="round"/>
</svg>
${spec.map((s, i) => `<div class="sp frost" id="s${i}" style="left:${s.x}px;top:${s.y}px;border-radius:999px">${s.n}</div>`).join("\n")}
<div class="frost" id="hub"><b>sprout</b><small>orchestrator</small></div>
<span class="pill" id="msg">“here's my syllabus”</span>
<div id="cap">The orchestrator routes each request to the specialist that owns it.</div>
`,
    js: `
kick(0.1);
tl.fromTo("#hub", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: E.back }, 0.2);
draw("#edges line:not(#hot)", 0.5, 0.6);
tl.fromTo(".sp", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: E.back, stagger: 0.1 }, 0.7);
tl.fromTo("#msg", { x: -200, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E.out }, 1.0);
tl.to("#msg", { x: ${cx - 230 - 150}, scale: 0.4, opacity: 0, duration: 0.8, ease: "power2.in" }, 1.9);
tl.to("#hub", { scale: 1.08, duration: 0.15, ease: E.out }, 2.6);
tl.to("#hub", { scale: 1, duration: 0.4, ease: E.back }, 2.75);
draw("#hot", 2.8, 0.6, "power2.out");
tl.to("#s0", { backgroundColor: "#0a4d17", color: "#f4eadf", scale: 1.08, duration: 0.4, ease: E.out }, 3.3);
tl.to("#s1, #s2, #s3, #e1, #e2, #e3", { opacity: 0.3, duration: 0.6 }, 3.3);
tl.fromTo("#cap", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 3.8);
`,
  });
}

// ───────────────────────── G07 · Clean graph (OVER, 12s)
{
  const tags = ["concepts extracted", "prerequisites linked", "broken refs removed", "cycles removed"];
  G.push({
    id: "G07", title: "Clean graph", dur: 12, full: false,
    css: `
#col { position: absolute; left: 1290px; top: 150px; width: 440px; }
.tg { display: flex; align-items: center; gap: 18px; height: 84px; padding: 0 26px; margin-bottom: 14px; font-size: 40px; color: var(--ink); border-radius: 999px; }
.tg .ck { width: 40px; height: 40px; flex: none; }
#mini { position: absolute; left: 1290px; top: 560px; width: 440px; height: 360px; }
#mini svg { width: 100%; height: 100%; overflow: visible; }
#mini .ttl { position: absolute; left: 28px; top: 16px; font-size: 30px; font-style: italic; color: var(--mid); }
`,
    html: `
<div id="col">${tags.map((t, i) => `<div class="tg frost" id="t${i}"><div class="ck">${CHECK()}</div>${t}</div>`).join("")}</div>
<div class="frost" id="mini"><span class="ttl">cleaning the graph</span>
<svg viewBox="0 0 440 360">
  <g id="edgesM" stroke="#7fa88a" stroke-width="4" fill="none" stroke-linecap="round">
    <line id="ma" x1="220" y1="95" x2="130" y2="185"/><line id="mb" x1="220" y1="95" x2="310" y2="185"/>
    <line id="mc" x1="130" y1="185" x2="110" y2="285"/><line id="md" x1="310" y1="185" x2="330" y2="285"/>
  </g>
  <path id="cyc" d="M330 285 C400 240 400 120 228 92" stroke="#b0584c" stroke-width="5" fill="none" stroke-dasharray="10 9" stroke-linecap="round"/>
  <g id="cut" opacity="0"><path d="M372 160 l26 -26 M372 134 l26 26" stroke="#b0584c" stroke-width="5" stroke-linecap="round"/></g>
  <g fill="#0b6122"><circle id="c0" cx="220" cy="95" r="17"/><circle id="c1" cx="130" cy="185" r="17"/><circle id="c2" cx="310" cy="185" r="17"/><circle id="c3" cx="110" cy="285" r="17"/><circle id="c4" cx="330" cy="285" r="17"/></g>
</svg></div>
`,
    js: `
${tags.map((_, i) => `tl.fromTo("#t${i}", { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, ${0.3 + i * 2});
tl.fromTo("#t${i} .ck", { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 0.45, ease: E.back }, ${0.6 + i * 2});`).join("\n")}
tl.fromTo("#mini", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 7.4);
tl.fromTo("#mini circle", { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.4, ease: E.back, stagger: 0.08 }, 7.6);
draw("#edgesM line", 7.9, 0.5);
tl.fromTo("#cyc", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 8.4);
tl.fromTo("#cut", { opacity: 0, scale: 0.4, transformOrigin: "385px 147px" }, { opacity: 1, scale: 1, duration: 0.3, ease: E.back }, 9.1);
tl.to("#cyc", { opacity: 0, duration: 0.5 }, 9.5);
tl.to("#cut", { opacity: 0, duration: 0.4 }, 9.8);
tl.to("#c4", { attr: { cx: 350, cy: 270 }, duration: 0.6, ease: E.back }, 9.9);
tl.to("#md", { attr: { x2: 350, y2: 270 }, duration: 0.6, ease: E.back }, 9.9);
tl.to("#col, #mini", { opacity: 0, x: 40, duration: 0.4, ease: E.in }, 11.5);
`,
  });
}

// ───────────────────────── G08 · Draft → confirmed (OVER, 8s)
G.push({
  id: "G08", title: "Draft to confirmed", dur: 8, full: false,
  css: `
#wrap { position: absolute; left: 1280px; top: 130px; width: 450px; }
#pillbox { position: relative; height: 96px; perspective: 800px; }
.st { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 16px; border-radius: 999px; font-size: 46px; backface-visibility: hidden; }
#draft { background: var(--tan); color: #5f5444; }
#active { background: var(--primary); color: var(--cream); }
#list { margin-top: 22px; padding: 26px 30px 30px; }
#list div { display: flex; align-items: center; gap: 16px; font-size: 36px; height: 62px; color: var(--ink); }
#list svg { flex: none; }
#list .arrow { color: var(--green); font-style: italic; }
`,
  html: `
<div id="wrap">
  <div id="pillbox"><div class="st" id="draft"><span class="mono" style="font-size:30px">status</span> draft</div><div class="st" id="active"><span class="mono" style="font-size:30px">status</span> active</div></div>
  <div class="frost" id="list">
    <div id="l0">${CHECK()}course activated</div>
    <div id="l1">${CHECK()}mastery records created</div>
    <div id="l2" class="arrow">handed to the Tutor →</div>
  </div>
</div>
`,
  js: `
tl.fromTo("#pillbox", { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: E.out }, 0);
tl.fromTo("#draft", { rotateX: 0 }, { rotateX: 180, duration: 0.6, ease: "power2.inOut" }, 0.6);
tl.fromTo("#active", { rotateX: -180 }, { rotateX: 0, duration: 0.6, ease: "power2.inOut" }, 0.6);
tl.fromTo("#list", { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.out }, 1.1);
tl.fromTo("#list > div", { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: E.out, stagger: 0.5 }, 1.3);
tl.to("#wrap", { opacity: 0, x: 40, duration: 0.4, ease: E.in }, 7.5);
`,
});

// ───────────────────────── G09 · What's next? (FULL, 16s)
{
  const cs = [
    { n: "Arrays", m: 0.92 }, { n: "Linked lists", m: 0.81 }, { n: "Stacks & queues", m: 0.74 },
    { n: "Recursion", m: 0.55 }, { n: "Hash tables", m: 0.38 }, { n: "Trees", m: 0.30, lock: 1 },
    { n: "Heaps", m: 0.20, lock: 1 }, { n: "Graphs", m: 0.10, lock: 1 },
  ];
  const slotX = (i) => 270 + i * 197; // centre x of 8 slots
  // After filter + sort: ready concepts by mastery ascending
  const ready = cs.map((c, i) => ({ ...c, i })).filter((c) => !c.lock).sort((a, b) => a.m - b.m);
  const target = {};
  ready.forEach((c, k) => { target[c.i] = slotX(k) + 120; });
  cs.forEach((c, i) => { if (c.lock) target[i] = slotX(i); });
  G.push({
    id: "G09", title: "What's next", dur: 16, full: true,
    css: `
#q { position: absolute; left: 192px; top: 190px; }
.pc { position: absolute; top: 384px; width: 190px; margin-left: -95px; display: flex; flex-direction: column; align-items: center; }
.pc .pb { position: relative; width: 150px; height: 188px; }
.pc .nm { font-size: 32px; text-align: center; margin-top: 10px; white-space: nowrap; }
.pc .ms { font-size: 30px; font-style: italic; color: var(--mid); }
.pc .lk { position: absolute; top: -8px; right: 26px; opacity: 0; }
#bed { position: absolute; left: 192px; right: 192px; top: 572px; height: 18px; border-radius: 9px; background: var(--tan); }
#halo { position: absolute; left: ${target[4]}px; top: 360px; width: 220px; height: 330px; margin-left: -110px; border-radius: 40px; border: 5px solid var(--bloom); background: rgba(232,163,61,0.12); }
#steps { position: absolute; left: 192px; top: 740px; display: flex; gap: 24px; }
#steps .chip { font-size: 34px; }
#steps .chip b { font-weight: 400; color: var(--mid); margin-right: 6px; }
#pick { position: absolute; left: 192px; top: 830px; font-size: 52px; padding: 14px 44px 20px; background: var(--bloom); color: #3d2a08; }
#src { position: absolute; left: 0; right: 192px; top: 860px; text-align: right; font-size: 34px; font-style: italic; color: var(--mid); }
#src .mono { font-style: normal; font-size: 28px; color: var(--green); }
`,
    html: `
<div class="kicker" id="kick"><i></i><span>algorithm · the next concept</span></div>
<div class="head" id="q">What should we learn next?</div>
<div id="bed"></div>
<div id="halo"></div>
${cs.map((c, i) => `<div class="pc" id="c${i}" style="left:${slotX(i)}px"><div class="pb"><img class="plant" src="assets/plant-${stageFor(c.m)}.svg" alt="" /></div><div class="lk">${LOCK}</div><div class="nm">${c.n}</div><div class="ms">${Math.round(c.m * 100)}%</div></div>`).join("\n")}
<div id="steps"><span class="chip" id="st1"><b>1</b>skip locked concepts</span><span class="chip" id="st2"><b>2</b>sort by mastery</span><span class="chip" id="st3"><b>3</b>take the weakest</span></div>
<span class="pill" id="pick">Ready &amp; weakest → Hash tables</span>
<div id="src">chosen by <span class="mono">compute_next_step</span> in SpacetimeDB, not by the model</div>
`,
    js: `
kick(0.2);
tl.fromTo("#q", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E.expo }, 0.4);
tl.fromTo("#bed", { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 1, duration: 0.8, ease: E.out }, 0.8);
tl.fromTo(".pc", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.back, stagger: 0.1 }, 1.0);
tl.fromTo(".pc .pb", { scale: 0.3, transformOrigin: "50% 100%" }, { scale: 1, duration: 0.6, ease: E.back, stagger: 0.1 }, 1.0);
// 1. filter locked
tl.fromTo("#st1", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.out }, 3.4);
${cs.map((c, i) => (c.lock ? `tl.to("#c${i} .lk", { opacity: 1, duration: 0.3 }, ${3.8 + (i - 5) * 0.2});
tl.to("#c${i} .pb, #c${i} .nm, #c${i} .ms", { opacity: 0.3, filter: "grayscale(1)", duration: 0.5 }, ${3.8 + (i - 5) * 0.2});` : "")).join("\n")}
// 2. sort the ready ones by mastery
tl.fromTo("#st2", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.out }, 6.4);
${cs.map((c, i) => `tl.to("#c${i}", { x: ${target[i] + (c.lock ? 140 : 0) - slotX(i)}, duration: 1.1, ease: "power3.inOut" }, 6.8);`).join("\n")}
tl.to("#c5, #c6, #c7", { opacity: 0.55, duration: 0.6 }, 6.8);
// 3. pick the weakest
tl.fromTo("#st3", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.out }, 9.4);

tl.fromTo("#halo", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: E.back }, 9.8);
tl.to("#c4", { y: -16, duration: 0.6, ease: E.back }, 9.8);
tl.fromTo("#pick", { scale: 0.7, opacity: 0, transformOrigin: "0% 50%" }, { scale: 1, opacity: 1, duration: 0.6, ease: E.back }, 10.4);
tl.fromTo("#src", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 12.2);
`,
  });
}

// ───────────────────────── G10 · Which format? (FULL, 12s)
{
  // Beta(a,b) densities drawn as curves (computed here, not at render time).
  const lnG = (z) => { // Lanczos log-gamma
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnG(1 - z);
    z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  };
  const beta = (a, b, x) => Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + lnG(a + b) - lnG(a) - lnG(b));
  const fmts = [
    { n: "Worked example", a: 9, b: 3, s: [0.62, 0.77, 0.71, 0.81] },
    { n: "Flashcards", a: 4, b: 5, s: [0.52, 0.31, 0.49, 0.46] },
    { n: "Diagram", a: 5, b: 4, s: [0.44, 0.66, 0.51, 0.58] },
    { n: "Analogy", a: 2, b: 3, s: [0.21, 0.55, 0.30, 0.39] },
  ];
  const cw = 300, ch = 150;
  const curve = (a, b) => {
    let mx = 0; const pts = [];
    for (let k = 1; k < 60; k++) { const x = k / 60; const y = beta(a, b, x); pts.push([x, y]); mx = Math.max(mx, y); }
    return "M0 " + ch + " " + pts.map(([x, y]) => `L${(x * cw).toFixed(1)} ${(ch - (y / mx) * (ch - 10)).toFixed(1)}`).join(" ") + ` L${cw} ${ch} Z`;
  };
  G.push({
    id: "G10", title: "Which format", dur: 12, full: true,
    css: `
#q { position: absolute; left: 192px; top: 190px; }
.fc { position: absolute; top: 340px; width: 350px; height: 400px; padding: 28px 25px; }
.fc .nm { font-size: 44px; color: var(--ink); }
.fc svg { display: block; margin-top: 20px; overflow: visible; }
.fc .val { font-size: 64px; color: var(--green); margin-top: 18px; }
.fc .val small { font-size: 28px; font-style: italic; color: var(--mid); margin-left: 8px; }
.fc .tag { position: absolute; right: 22px; top: -26px; font-size: 32px; padding: 6px 22px 10px; background: var(--primary); color: var(--cream); opacity: 0; }
#lab { position: absolute; left: 192px; top: 790px; font-size: 40px; font-style: italic; color: var(--mid); }
#line { position: absolute; left: 0; right: 0; top: 865px; text-align: center; font-size: 66px; color: var(--green); letter-spacing: -1px; }
`,
    html: `
<div class="kicker" id="kick"><i></i><span>algorithm · the teaching format</span></div>
<div class="head" id="q" style="font-size:84px">Which way should it teach?</div>
${fmts.map((f, i) => `<div class="fc frost" id="f${i}" style="left:${192 + i * 395}px"><span class="pill tag">picked</span><div class="nm">${f.n}</div>
<svg width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}"><path d="${curve(f.a, f.b)}" fill="rgba(164,215,162,0.45)" stroke="#4e8a5e" stroke-width="3"/><line id="mk${i}" x1="0" y1="0" x2="0" y2="${ch}" stroke="#1f6fb2" stroke-width="4"/><circle id="md${i}" cx="0" cy="0" r="9" fill="#1f6fb2"/></svg>
<div class="val"><span id="v${i}">0.00</span><small>sampled</small></div></div>`).join("\n")}
<div id="lab">Thompson sampling: draw from what has worked for you, then pick the highest.</div>
<div id="line">The model writes the lesson. The database picks the path.</div>
`,
    js: `
kick(0.2);
tl.fromTo("#q", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E.expo }, 0.3);
tl.fromTo(".fc", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.expo, stagger: 0.12 }, 0.7);
const S = ${JSON.stringify(fmts.map((f) => f.s))};
for (let i = 0; i < 4; i++) {
  tl.set("#mk" + i + ", #md" + i, { opacity: 0 }, 0);
  tl.to("#mk" + i + ", #md" + i, { opacity: 1, duration: 0.2 }, 2.0);
  let t = 2.0;
  for (let k = 0; k < S[i].length; k++) {
    const x = S[i][k] * ${cw};
    tl.to("#mk" + i, { attr: { x1: x, x2: x }, duration: 0.45, ease: "power2.inOut" }, t);
    tl.to("#md" + i, { attr: { cx: x }, duration: 0.45, ease: "power2.inOut" }, t);
    count("#v" + i, k ? S[i][k - 1] : 0, S[i][k], t, 0.45, (v) => v.toFixed(2));
    t += 0.55;
  }
}
tl.fromTo("#lab", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 2.2);
tl.to("#f1, #f2, #f3", { opacity: 0.5, duration: 0.5 }, 4.6);
tl.to("#f0", { y: -24, borderColor: "rgba(11,97,34,0.7)", duration: 0.6, ease: E.back }, 4.6);
tl.to("#f0 .tag", { opacity: 1, duration: 0.3 }, 4.8);
tl.to("#lab", { opacity: 0, duration: 0.4 }, 8.2);
tl.fromTo("#line", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E.expo }, 8.4);
`,
  });
}

// ───────────────────────── G11 · One tap, one transaction (FULL, 28s)
G.push({
  id: "G11", title: "One tap one transaction", dur: 28, full: true,
  css: `
#card { position: absolute; left: 230px; top: 100px; width: 1460px; height: 880px; padding: 40px 60px; }
#hd { display: flex; align-items: baseline; gap: 18px; }
#hd .mono { font-size: 46px; color: var(--green); }
#hd .it { font-size: 50px; color: var(--mid); }
#evt { position: absolute; right: 60px; top: 38px; font-size: 36px; padding: 8px 28px 12px; background: var(--wilt); color: #fff; }
#vein { position: absolute; left: 92px; top: 150px; width: 6px; height: 590px; background: var(--vein); border-radius: 3px; transform-origin: 50% 0; }
.rw { position: absolute; left: 70px; width: 1320px; height: 130px; display: flex; align-items: center; gap: 30px; }
.rw .bul { width: 50px; height: 50px; border-radius: 50%; background: var(--green); color: var(--cream); font-size: 30px; display: flex; align-items: center; justify-content: center; flex: none; }
.rw .ti { width: 330px; flex: none; }
.rw .ti b { display: block; font-weight: 400; font-size: 48px; color: var(--ink); line-height: 1; }
.rw .ti small { font-size: 28px; font-style: italic; color: var(--mid); }
.bar { position: relative; width: 420px; height: 26px; border-radius: 13px; background: var(--tan); overflow: hidden; flex: none; }
.bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; border-radius: 13px; background: var(--mid); transform-origin: 0 50%; }
.num { font-size: 56px; color: var(--green); width: 130px; flex: none; }
.pb { position: relative; width: 84px; height: 105px; flex: none; }
.prm { display: flex; gap: 12px; }
.prm span { font-size: 26px; padding: 6px 16px 8px; }
.cal { display: flex; align-items: center; gap: 18px; font-size: 46px; }
.cal .old { color: #8b8070; position: relative; }
.cal .old::after { content: ""; position: absolute; left: -6px; right: -6px; top: 55%; height: 4px; background: var(--wilt); transform: scaleX(var(--s, 0)); transform-origin: 0 50%; }
.cal .new { color: var(--green); }
#log { font-size: 28px; width: 640px; height: 92px; overflow: hidden; border-radius: 16px; background: rgba(220,203,178,0.35); padding: 6px 18px; }
#log div { height: 40px; line-height: 40px; color: #6e6457; }
#log .nw { color: var(--green); }
#brk { position: absolute; right: 30px; top: 160px; width: 40px; height: 570px; border: 6px solid var(--green); border-left: none; border-radius: 0 24px 24px 0; transform-origin: 0 50%; }
#cm { position: absolute; right: -40px; top: 415px; font-size: 30px; padding: 6px 18px 8px; background: var(--primary); color: var(--cream); }
#ag { position: absolute; left: 60px; right: 60px; bottom: 40px; display: flex; align-items: center; gap: 34px; font-size: 38px; }
#ag .a { display: flex; align-items: center; gap: 12px; color: var(--ink); }
#ag .a i { width: 22px; height: 22px; border-radius: 50%; background: var(--tan); display: block; }
#ag .msg { margin-left: auto; font-style: italic; color: var(--mid); }
`,
  html: `
<div class="frost" id="card">
  <div id="hd"><span class="mono">record_attempt</span><span class="it">· one transaction</span></div>
  <span class="pill" id="evt">Didn't know · Hash tables</span>
  <div id="vein"></div>
  <div class="rw" id="r1" style="top:150px"><div class="bul">1</div><div class="ti"><b>BKT</b><small>probability of mastery</small></div>
    <div class="bar"><i id="mb"></i></div><div class="num" id="mn">0.62</div>
    <div class="pb"><img class="plant" id="pl3" src="assets/plant-3.svg" alt="" /><img class="plant" id="pl2" src="assets/plant-2.svg" alt="" /></div>
    <div class="prm" id="prm" style="position:absolute;left:440px;top:96px"><span class="solid mono">prior .31</span><span class="solid mono">learn .18</span><span class="solid mono">slip .09</span><span class="solid mono">guess .21</span></div></div>
  <div class="rw" id="r2" style="top:320px"><div class="bul">2</div><div class="ti"><b>SM-2</b><small>next review</small></div>
    <div class="cal"><svg viewBox="0 0 40 40" width="52" height="52"><rect x="4" y="8" width="32" height="28" rx="5" fill="none" stroke="#0b6122" stroke-width="3.5"/><path d="M4 16 H36 M13 4 V11 M27 4 V11" stroke="#0b6122" stroke-width="3.5" stroke-linecap="round"/></svg><span class="old" id="old">in 6 days</span><span>→</span><span class="new" id="nw">tomorrow</span></div></div>
  <div class="rw" id="r3" style="top:460px"><div class="bul">3</div><div class="ti"><b>Format policy</b><small>flashcard evidence</small></div>
    <div class="bar"><i id="fb" style="background:#1f6fb2"></i></div><div class="num" id="fn" style="color:#1f6fb2">0.46</div></div>
  <div class="rw" id="r4" style="top:600px"><div class="bul">4</div><div class="ti"><b>Attempt logged</b><small>history for fitting</small></div>
    <div id="log" class="mono"><div id="lg">#1041 · stacks · knew it</div><div class="nw">#1042 · hash tables · didn't know</div></div></div>
  <div id="brk"></div><span class="pill mono" id="cm">commit</span>
  <div id="ag"><span class="a"><i></i>Curriculum</span><span class="a"><i></i>Tutor</span><span class="a"><i></i>Garden</span><span class="a"><i></i>Arcade</span><span class="msg">every agent sees the new state</span></div>
</div>
`,
  js: `
tl.fromTo("#card", { y: 60, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: E.expo }, 0.1);
tl.fromTo("#evt", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.back }, 0.6);
tl.fromTo("#vein", { scaleY: 0 }, { scaleY: 0, duration: 0.01 }, 0);
tl.set("#r1, #r2, #r3, #r4, #brk, #cm, #ag", { opacity: 0 }, 0);
tl.set("#mb", { scaleX: 0.62 }, 0);
tl.set("#fb", { scaleX: 0.46 }, 0);
tl.set("#pl2", { opacity: 0 }, 0);
tl.set("#prm span", { opacity: 0 }, 0);
// 1 BKT
tl.to("#vein", { scaleY: 0.25, duration: 0.6, ease: E.out }, 1.8);
tl.fromTo("#r1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, 2.0);
tl.to("#mb", { scaleX: 0.41, backgroundColor: "#b0584c", duration: 1.2, ease: "power2.inOut" }, 3.0);
count("#mn", 0.62, 0.41, 3.0, 1.2, (v) => v.toFixed(2));
tl.to("#mn", { color: "#b0584c", duration: 0.4 }, 3.0);
tl.to("#pl3", { opacity: 0, rotate: 10, transformOrigin: "50% 100%", duration: 0.5 }, 3.6);
tl.fromTo("#pl2", { opacity: 0, rotate: -6 }, { opacity: 1, rotate: 0, transformOrigin: "50% 100%", duration: 0.6, ease: E.back }, 3.8);
tl.fromTo("#prm span", { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: E.out, stagger: 0.25 }, 5.0);
// 2 SM-2
tl.to("#vein", { scaleY: 0.5, duration: 0.6, ease: E.out }, 8.2);
tl.fromTo("#r2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, 8.4);
tl.set("#nw", { opacity: 0 }, 0);
tl.fromTo("#old", { "--s": 0 }, { "--s": 1, duration: 0.5, ease: E.out }, 9.4);
tl.fromTo("#nw", { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.back }, 9.7);
// 3 format policy
tl.to("#vein", { scaleY: 0.75, duration: 0.6, ease: E.out }, 12.6);
tl.fromTo("#r3", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, 12.8);
tl.to("#fb", { scaleX: 0.40, duration: 1.0, ease: "power2.inOut" }, 13.8);
count("#fn", 0.46, 0.40, 13.8, 1.0, (v) => v.toFixed(2));
// 4 attempt logged
tl.to("#vein", { scaleY: 1, duration: 0.6, ease: E.out }, 16.6);
tl.fromTo("#r4", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, 16.8);
tl.fromTo("#log div", { y: 0 }, { y: -40, duration: 0.6, ease: E.out }, 17.6);
tl.set("#log", { paddingTop: 6 }, 0);
// commit
tl.fromTo("#brk", { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.6, ease: E.out }, 20.4);
tl.fromTo("#cm", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: E.back }, 20.8);
// every agent sees it
tl.fromTo("#ag", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.out }, 22.6);
tl.to("#ag .a i", { backgroundColor: "#4e8a5e", scale: 1.5, duration: 0.25, ease: E.out, stagger: 0.15 }, 23.4);
tl.to("#ag .a i", { scale: 1, duration: 0.35, ease: E.back, stagger: 0.15 }, 23.65);
`,
});

// ───────────────────────── G12 · The chat goes, the garden stays (FULL, 10s)
{
  const garden = [4, 3, 2, 4, 1, 3, 2];
  G.push({
    id: "G12", title: "The garden stays", dur: 10, full: true,
    css: `
#chat { position: absolute; left: 510px; top: 130px; width: 900px; height: 470px; padding: 34px 40px; }
#chat .bar { display: flex; gap: 12px; margin-bottom: 26px; }
#chat .bar i { width: 18px; height: 18px; border-radius: 50%; background: var(--tan); display: block; }
.bb { max-width: 600px; font-size: 34px; padding: 14px 26px 18px; border-radius: 26px; margin-bottom: 16px; }
.bb.me { margin-left: auto; background: rgba(31,111,178,0.12); }
.bb.ai { background: rgba(164,215,162,0.35); }
#sun { position: absolute; left: 760px; top: 420px; width: 400px; height: 400px; border-radius: 50%;
  background: radial-gradient(circle, #ffd98a 0%, rgba(255,217,138,0.6) 42%, rgba(255,217,138,0) 72%); }
#gard { position: absolute; left: 330px; right: 330px; top: 640px; height: 260px; display: flex; justify-content: space-between; align-items: flex-end; }
#gard .pb { position: relative; width: 140px; height: 175px; }
#soil { position: absolute; left: 300px; right: 300px; top: 890px; height: 22px; border-radius: 11px; background: var(--tan); }
#say { position: absolute; left: 0; right: 0; top: 260px; text-align: center; font-size: 84px; line-height: 1.05; color: var(--green); letter-spacing: -2px; }
#say em { color: var(--mid); }
`,
    html: `
<div id="sun"></div>
<div class="frost" id="chat"><div class="bar"><i></i><i></i><i></i></div>
  <div class="bb me">let's do hash tables</div>
  <div class="bb ai">Sure. Picture a row of buckets…</div>
  <div class="bb me">got it, thanks!</div>
</div>
<div id="say">Closing the chat removes the conversation, <em class="it">not the learning.</em></div>
<div id="soil"></div>
<div id="gard">${garden.map((s, i) => `<div class="pb" id="g${i}"><img class="plant" src="assets/plant-${s}.svg" alt="" /></div>`).join("")}</div>
`,
    js: `
tl.fromTo("#chat", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.expo }, 0.1);
tl.fromTo("#soil", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: E.out }, 0.2);
tl.fromTo("#gard .pb", { scale: 0.3, opacity: 0, transformOrigin: "50% 100%" }, { scale: 1, opacity: 1, duration: 0.6, ease: E.back, stagger: 0.08 }, 0.4);
tl.to("#chat", { scaleY: 0.08, scaleX: 0.6, duration: 0.7, ease: "power2.in" }, 2.4);
tl.to("#chat", { y: 520, x: 260, rotate: 38, opacity: 0, duration: 1.4, ease: "power1.in" }, 3.0);
tl.fromTo("#sun", { y: 220, scale: 0.6, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 1.2, ease: "power2.out" }, 3.6);
tl.to("#gard .pb", { y: -8, duration: 0.6, ease: E.soft, stagger: 0.06, yoyo: true, repeat: 1 }, 3.8);
tl.fromTo("#say", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E.expo }, 4.4);
`,
  });
}

// ───────────────────────── G13 · Welcome back (OVER, 14s)
{
  const tags = ["active course", "mastery per concept", "reviews due", "last-session recap", "next topic"];
  G.push({
    id: "G13", title: "Welcome back", dur: 14, full: false,
    css: `
#col { position: absolute; left: 1290px; top: 170px; width: 440px; }
#hdr { white-space: nowrap; font-size: 34px; font-style: italic; color: var(--green); background: rgba(251,246,239,0.92); border-radius: 999px; padding: 6px 24px 10px; display: inline-block; margin-bottom: 18px; margin-left: 40px; }
.tg { position: relative; height: 80px; margin-bottom: 52px; margin-left: 40px; display: flex; align-items: center; gap: 16px; padding: 0 26px; font-size: 38px; border-radius: 999px; }
.tg .ln { position: absolute; right: 100%; top: 50%; width: 110px; height: 4px; margin-top: -2px; background: var(--vein); transform-origin: 100% 50%; }
.tg .ln::before { content: ""; position: absolute; left: -9px; top: -7px; width: 18px; height: 18px; border-radius: 50%; background: var(--green); }
`,
    html: `
<div id="col"><span id="hdr">rebuilt from the shared graph</span>
${tags.map((t, i) => `<div class="tg frost" id="t${i}"><span class="ln"></span><span class="dot"></span>${t}</div>`).join("\n")}</div>
`,
    js: `
tl.fromTo("#hdr", { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.out }, 0.2);
${tags.map((_, i) => `tl.fromTo("#t${i}", { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E.out }, ${0.5 + i * 2.5});
tl.fromTo("#t${i} .ln", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: E.out }, ${0.8 + i * 2.5});`).join("\n")}
tl.to("#col", { opacity: 0, x: 40, duration: 0.4, ease: E.in }, 13.5);
`,
  });
}

// ───────────────────────── G14 · One state, two screens (FULL, 18s)
{
  const players = [
    { n: "Maya", a: 2400, b: 2400 },
    { n: "Dev", a: 2150, b: 2150 },
    { n: "You", a: 1900, b: 2750 },
  ];
  const board = (p) => `<div class="lb">${players.map((pl, i) => `<div class="lr" data-i="${i}" style="top:${i * 58}px"><span class="nm">${pl.n}</span><span class="tr"><i style="width:${(pl.a / 3000) * 100}%"></i></span><span class="sc">${pl.a}</span></div>`).join("")}</div>`;
  G.push({
    id: "G14", title: "One state two screens", dur: 18, full: true,
    css: `
#node { position: absolute; left: 680px; top: 170px; width: 560px; padding: 30px 36px 34px; }
#node .t { font-size: 34px; color: var(--green); margin-bottom: 14px; }
#node .rr { display: flex; justify-content: space-between; font-size: 30px; height: 50px; align-items: center; border-top: 2px solid rgba(11,97,34,0.1); color: #4b453c; }
#node .rr b { font-weight: 400; color: var(--green); }
#wires { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; }
.scr { position: absolute; border: 6px solid #2f3a32; background: #fffdf9; padding: 26px 24px; }
#host { left: 192px; top: 470px; width: 560px; height: 360px; border-radius: 22px; }
#hostb { position: absolute; left: 160px; top: 830px; width: 624px; height: 24px; border-radius: 0 0 18px 18px; background: #2f3a32; }
#phone { left: 1450px; top: 420px; width: 280px; height: 520px; border-radius: 40px; padding: 30px 20px; }
.scr .lab { font-size: 28px; font-style: italic; color: var(--mid); margin-bottom: 16px; }
.lb { position: relative; height: 174px; }
.lr { position: absolute; left: 0; right: 0; height: 50px; display: flex; align-items: center; gap: 12px; font-size: 30px; }
.lr .nm { width: 80px; } .lr .tr { flex: 1; height: 18px; border-radius: 9px; background: var(--tan); overflow: hidden; }
.lr .tr i { display: block; height: 100%; background: var(--mid); border-radius: 9px; }
.lr .sc { width: 72px; text-align: right; color: var(--green); font-size: 26px; }
#phone .lr .nm { width: 64px; font-size: 26px; } #phone .lr .sc { display: none; }
#ans { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 30px; }
#ans span { height: 70px; border-radius: 16px; background: var(--cream); border: 2px solid var(--tan); display: flex; align-items: center; justify-content: center; font-size: 34px; }
#ans #ab { position: relative; }
#rip { position: absolute; left: 50%; top: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; border: 4px solid var(--focus); opacity: 0; }
.pk { position: absolute; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: var(--focus); box-shadow: 0 0 0 8px rgba(31,111,178,0.18); opacity: 0; }
#mast { position: absolute; left: 720px; top: 860px; width: 480px; padding: 18px 28px 22px; }
#mast .t { font-size: 30px; font-style: italic; color: var(--mid); }
#mast .row { display: flex; align-items: center; gap: 16px; margin-top: 8px; font-size: 30px; }
#mast .tr { flex: 1; height: 20px; border-radius: 10px; background: var(--tan); overflow: hidden; }
#mast .tr i { display: block; height: 100%; width: 100%; background: var(--mid); transform-origin: 0 50%; }
#cap { position: absolute; left: 780px; top: 560px; width: 330px; text-align: center; font-size: 38px; font-style: italic; color: var(--green); }
`,
    html: `
<svg id="wires" viewBox="0 0 ${W} ${H}">
  <path id="w1" d="M680 330 C560 330 480 380 470 466" stroke="#a4d7a2" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path id="w2" d="M1240 330 C1400 330 1580 340 1590 416" stroke="#a4d7a2" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path id="w3" d="M1160 485 L1160 856" stroke="#a4d7a2" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="4 14"/>
</svg>
<div class="frost" id="node"><div class="t mono">SpacetimeDB · game room</div>
  <div class="rr"><span>timer</span><b id="tm">0:15</b></div>
  <div class="rr"><span>answers</span><b id="an">2 / 3</b></div>
  <div class="rr"><span>scores</span><b id="scor">updated</b></div>
  <div class="rr"><span>standings</span><b id="sd">Maya · Dev · You</b></div>
</div>
<div class="scr" id="host"><div class="lab">host screen</div>${board()}</div><div id="hostb"></div>
<div class="scr" id="phone"><div class="lab">player phone</div>${board()}<div id="ans"><span>A</span><span id="ab">B<i id="rip"></i></span><span>C</span><span>D</span></div></div>
<div class="pk" id="up"></div><div class="pk" id="d1"></div><div class="pk" id="d2"></div>
<div id="cap">one update redraws every screen</div>
<div class="frost" id="mast"><div class="t">course owner's answer → same mastery update</div><div class="row"><span>Hash tables</span><span class="tr"><i id="mi"></i></span><span id="mv">0.41</span></div></div>
`,
    js: `
tl.fromTo("#node", { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E.expo }, 0.2);
tl.fromTo("#host, #hostb", { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: E.expo }, 0.6);
tl.fromTo("#phone", { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: E.expo }, 0.8);
draw("#w1, #w2", 1.3, 0.8);
tl.set("#scor", { textContent: "–" }, 0);
const secs = { v: 15 };
tl.to(secs, { v: 3, duration: 12, ease: "none", onUpdate: () => { document.getElementById("tm").textContent = "0:" + String(Math.ceil(secs.v)).padStart(2, "0"); } }, 2.0);
// player taps B
tl.to("#ab", { scale: 0.92, backgroundColor: "#cfe6cc", duration: 0.1 }, 3.4);
tl.to("#ab", { scale: 1, duration: 0.3, ease: E.back }, 3.5);
tl.fromTo("#rip", { scale: 0.4, opacity: 0.9 }, { scale: 3, opacity: 0, duration: 0.5, ease: "power2.out" }, 3.4);
tl.set("#up", { x: 1590, y: 416, opacity: 1 }, 3.7);
tl.to("#up", { x: 1240, y: 330, duration: 0.9, ease: "power2.inOut" }, 3.7);
tl.to("#up", { opacity: 0, duration: 0.15 }, 4.6);
tl.set("#an", { textContent: "3 / 3" }, 4.7);
tl.fromTo("#node", { scale: 1 }, { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1 }, 4.7);
tl.set("#scor", { textContent: "You +850" }, 5.1);
tl.set("#sd", { textContent: "You · Maya · Dev" }, 5.1);
// twin pulses down to both screens at once
tl.set("#d1", { x: 680, y: 330, opacity: 1 }, 5.6);
tl.set("#d2", { x: 1240, y: 330, opacity: 1 }, 5.6);
tl.to("#d1", { x: 470, y: 466, duration: 0.8, ease: "power2.inOut" }, 5.6);
tl.to("#d2", { x: 1590, y: 416, duration: 0.8, ease: "power2.inOut" }, 5.6);
tl.to("#d1, #d2", { opacity: 0, duration: 0.15 }, 6.4);
// both leaderboards reorder together: You 3rd → 1st
for (const s of ["#host", "#phone"]) {
  tl.to(s + " .lr[data-i='2']", { y: -116, duration: 0.7, ease: "power3.inOut" }, 6.5);
  tl.to(s + " .lr[data-i='0']", { y: 58, duration: 0.7, ease: "power3.inOut" }, 6.5);
  tl.to(s + " .lr[data-i='1']", { y: 58, duration: 0.7, ease: "power3.inOut" }, 6.5);
  tl.to(s + " .lr[data-i='2'] .tr i", { width: "${(2750 / 3000) * 100}%", backgroundColor: "#0b6122", duration: 0.7, ease: E.out }, 6.5);
}
const sc = { v: 1900 };
tl.to(sc, { v: 2750, duration: 0.7, ease: E.out, onUpdate: () => { document.querySelector("#host .lr[data-i='2'] .sc").textContent = Math.round(sc.v); } }, 6.5);
tl.fromTo("#cap", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 8.6);
// owner's answers feed mastery
draw("#w3", 10.8, 0.6);
tl.set("#mi", { scaleX: 0.41 }, 0);
tl.fromTo("#mast", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 11.2);
tl.to("#mi", { scaleX: 0.47, duration: 0.9, ease: "power2.inOut" }, 12.2);
count("#mv", 0.41, 0.47, 12.2, 0.9, (v) => v.toFixed(2));
`,
  });
}

// ───────────────────────── G15 · One system (FULL, 26s)
{
  const fetch = ["ASI:One", "Agent Chat Protocol", "Agentverse", "interactive cards"];
  const specs = ["Curriculum", "Tutor", "Garden", "Arcade"];
  const sx = [520, 820, 1120, 1420];
  const reducers = ["prerequisites", "BKT mastery", "SM-2 reviews", "format bandit", "game state"];
  G.push({
    id: "G15", title: "One system", dur: 26, full: true,
    css: `
.lyr { position: absolute; left: 230px; font-size: 34px; font-style: italic; color: var(--mid); width: 220px; }
#fx { position: absolute; left: 430px; top: 150px; display: flex; gap: 16px; align-items: center; }
#fx .chip { font-size: 34px; background: rgba(31,111,178,0.12); color: #164d7c; }
#fx .ar { font-size: 34px; color: #8aa0b2; }
#hub { position: absolute; left: 820px; top: 290px; width: 280px; height: 100px; display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 64px; color: var(--green); border-radius: 999px; }
.sp { position: absolute; top: 520px; width: 250px; height: 90px; margin-left: -125px; display: flex; align-items: center; justify-content: center; font-size: 42px; color: var(--green); border-radius: 999px; }
#llm { position: absolute; left: 1600px; top: 380px; width: 120px; height: 120px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #6b4b10; border: 3px dashed var(--bloom); background: rgba(232,163,61,0.1); }
#soil { position: absolute; left: 192px; right: 192px; top: 760px; height: 172px; border-radius: 40px;
  background: linear-gradient(180deg, rgba(220,203,178,0.85), rgba(196,174,140,0.9)); padding: 26px 40px; }
#soil .t { font-size: 50px; color: #3f3324; }
#soil .t small { font-size: 30px; font-style: italic; color: #5f5444; margin-left: 14px; }
#red { display: flex; gap: 16px; margin-top: 22px; }
#red span { font-size: 28px; padding: 8px 20px 10px; border-radius: 999px; background: rgba(255,253,249,0.75); color: #5f5444; }
#links { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; }
`,
    html: `
<div class="kicker" id="kick" style="top:60px"><i></i><span>one system</span></div>
<div id="dia" style="position:absolute;inset:0;transform:translateY(40px)">
<div class="lyr" id="l1" style="top:160px">Fetch.ai</div>
<div id="fx">${fetch.map((f, i) => `${i ? `<span class="ar" id="ar${i}">${i === 3 ? "+" : "→"}</span>` : ""}<span class="chip" id="fx${i}">${f}</span>`).join("")}</div>
<div class="lyr" id="l2" style="top:315px">agents</div>
<svg id="links" viewBox="0 0 ${W} ${H}">
  <path id="k0" d="M960 215 L960 288" stroke="#8aa0b2" stroke-width="5" fill="none" stroke-linecap="round"/>
  ${sx.map((x, i) => `<path class="sk" d="M960 392 C960 450 ${x} 450 ${x} 518" stroke="#4e8a5e" stroke-width="5" fill="none" stroke-linecap="round"/>`).join("")}
  ${sx.map((x, i) => `<path class="rt" d="M${x} 612 C${x - 30} 660 ${x + 30} 700 ${x} 758" stroke="#8b6f4e" stroke-width="5" fill="none" stroke-linecap="round"/>`).join("")}
  ${sx.map((x) => `<path class="lm" d="M${x + 110} 540 C${x + 300} 470 1500 440 1598 440" stroke="#e8a33d" stroke-width="3" fill="none" stroke-dasharray="8 10"/>`).join("")}
</svg>
<div class="frost" id="hub">sprout</div>
${specs.map((s, i) => `<div class="sp frost" id="s${i}" style="left:${sx[i]}px">${s}</div>`).join("")}
<div id="llm">LLM</div>
<div id="soil"><div class="t">SpacetimeDB<small>shared memory and decision logic</small></div>
  <div id="red">${reducers.map((r) => `<span>${r}</span>`).join("")}</div></div>
</div>
`,
    js: `
kick(0.2);
tl.fromTo("#l1", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 3.0);
${fetch.map((_, i) => `tl.fromTo("#fx${i}", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.back }, ${3.2 + i * 1.1});${i ? `
tl.fromTo("#ar${i}", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${3.0 + i * 1.1});` : ""}`).join("\n")}
tl.fromTo("#l2", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 8.4);
draw("#k0", 8.4, 0.5);
tl.fromTo("#hub", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: E.back }, 8.8);
draw(".sk", 9.6, 0.7);
${specs.map((_, i) => `tl.fromTo("#s${i}", { y: 20, scale: 0.8, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: E.back }, ${10.0 + i * 0.5});`).join("\n")}
tl.fromTo("#soil", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E.expo }, 13.4);
draw(".rt", 13.9, 0.9, "power1.out");
tl.fromTo("#red span", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: E.out, stagger: 0.15 }, 14.6);
// models generate content
tl.fromTo("#llm", { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: E.back }, 17.2);
tl.fromTo(".lm", { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.1 }, 17.5);
// reducers enforce
tl.to("#red span", { backgroundColor: "#0a4d17", color: "#f4eadf", duration: 0.4, stagger: 0.18 }, 19.6);
tl.to(".rt", { stroke: "#0b6122", duration: 0.6 }, 19.6);
`,
  });
}

// ───────────────────────── G16 · End card (FULL, 10s)
G.push({
  id: "G16", title: "End card", dur: 10, full: true,
  css: `
#stage { position: absolute; left: 0; right: 0; top: 0; height: ${H}px; }
#should { position: absolute; left: 0; right: 0; top: 400px; text-align: center; font-size: 130px; font-style: italic; color: #6e6457; }
#should span { position: relative; display: inline-block; }
#strike { position: absolute; left: -10px; right: -10px; top: 56%; height: 8px; border-radius: 4px; background: var(--wilt); transform-origin: 0 50%; }
#next { position: absolute; left: 0; right: 0; top: 420px; display: flex; justify-content: center; }
#next .pill { font-size: 72px; padding: 18px 60px 26px; background: var(--primary); color: var(--cream); box-shadow: 0 24px 60px rgba(10,77,23,0.35); }
#end { position: absolute; left: 0; right: 0; top: 220px; display: flex; flex-direction: column; align-items: center; }
#wmw { position: relative; font-size: 230px; line-height: 1; letter-spacing: -5px; color: var(--green); padding-right: 50px; }
#wmask { display: block; overflow: hidden; padding: 0 24px 34px 0; }
#word { display: block; }
#wleaf { position: absolute; right: 4px; top: 22px; width: 56px; height: 56px; }
#info { position: absolute; left: 0; right: 0; top: 560px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
#info div { font-size: 44px; color: var(--ink); }
#info .mono { font-size: 36px; color: var(--green); }
`,
  html: `
<div id="stage">
  <div id="should"><span>“I should study”<i id="strike"></i></span></div>
  <div id="next"><span class="pill">Learn next → Hash tables</span></div>
  <div id="end"><div id="wmw"><span id="wmask"><span id="word">sprout</span></span><div id="wleaf">${LEAF_SVG()}</div></div></div>
  <div id="info">
    <div id="i0">Message <span class="mono">@blank-agent-184</span> on ASI:One</div>
    <div id="i1" class="mono">github.com/ArushNo1/sprout</div>
    <div id="i2" class="mono">sproutlearn.tech</div>
  </div>
</div>
`,
  js: `
tl.fromTo("#should", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E.out }, 0.1);
tl.fromTo("#strike", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 1.0);
tl.to("#should", { y: -40, opacity: 0, duration: 0.4, ease: E.in }, 1.7);
tl.fromTo("#next", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: E.back }, 2.15);
tl.to("#next", { y: -380, scale: 0.55, opacity: 0, duration: 0.6, ease: E.in }, 3.4);
tl.fromTo("#word", { yPercent: 105, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 0.9, ease: E.expo }, 3.7);
tl.fromTo("#wleaf", { scale: 0, rotate: -60, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.6, ease: E.back }, 4.3);
tl.fromTo("#info > div", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E.out, stagger: 0.18 }, 4.8);
`,
});

for (const g of G) {
  const dir = new URL(`./scenes/${g.id}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("index.html", dir), page(g));
  writeFileSync(new URL("meta.json", dir), JSON.stringify({ id: g.id, name: g.id + " " + g.title }));
  const link = new URL("assets", dir);
  if (!existsSync(link)) symlinkSync("../../assets", link);
}
writeFileSync(new URL("./graphics.json", import.meta.url), JSON.stringify(G.map(({ id, title, dur, full }) => ({ id, title, dur, overlay: !full })), null, 2));
console.log(`wrote ${G.length} compositions`);
