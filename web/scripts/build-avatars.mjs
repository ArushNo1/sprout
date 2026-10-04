// Builds the agents' profile pictures: public/avatars/<agent>.svg, and .png when Chrome is available.
// One shared frame and the garden's plant art, a different motif and colour for each agent.
// Run from web/:  node scripts/build-avatars.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const C = { card: '#f4eadf', paper: '#fbf6ef', green: '#0b6122', primary: '#0a4d17', mid: '#4e8a5e', track: '#dccbb2', vein: '#a4d7a2', bloom: '#e8a33d', sage: '#dcebd3' };

/** A garden plant (80x100 art) placed with its soil centre at (cx, groundY), `w` wide. */
function plant(stage, cx, groundY, w) {
  const src = readFileSync(`../video/assets/plant-${stage}.svg`, 'utf8');
  const inner = src.slice(src.indexOf('>') + 1, src.lastIndexOf('</svg>'));
  const h = (w * 100) / 80;
  return `<svg x="${cx - w / 2}" y="${groundY - (h * 91) / 100}" width="${w}" height="${h}" viewBox="0 0 80 100" overflow="visible">${inner}</svg>`;
}

const leaf = (x, y, rot, s, fill) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 C0 -150 150 -250 330 -250 C330 -80 200 20 0 0Z" fill="${fill}"/><path d="M20 -16 C120 -90 210 -150 290 -222" stroke="${C.vein}" stroke-width="14" fill="none" stroke-linecap="round"/></g>`;

// The shared frame: coloured field, soft light from the top left, a ring, and a leaf tucked in two corners.
const frame = (bg, ring, leafFill, body, glow = 0.55) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs><radialGradient id="glow" cx="30%" cy="22%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="${glow}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="1024" height="1024" fill="${bg}"/>
${leaf(-40, 250, 8, 0.78, leafFill)}${leaf(1064, 780, 188, 0.78, leafFill)}
<rect width="1024" height="1024" fill="url(#glow)"/>
<circle cx="512" cy="512" r="468" fill="none" stroke="${ring}" stroke-width="10"/>
${body}
</svg>
`;

// Sprout: the one students talk to. A flowering plant on a cream disc, on the deepest green.
const sprout = frame(C.primary, C.vein, C.green, `
<circle cx="512" cy="512" r="372" fill="${C.card}"/>
<circle cx="512" cy="512" r="372" fill="none" stroke="${C.vein}" stroke-width="10" opacity=".7"/>
${plant(4, 512, 696, 470)}
<circle cx="640" cy="318" r="14" fill="${C.bloom}"/><circle cx="398" cy="348" r="9" fill="${C.vein}"/><circle cx="684" cy="430" r="8" fill="${C.vein}"/>`, 0.18);

// Tutor: teaches. A budding plant growing out of an open book, with an amber bookmark.
const tutor = frame(C.card, C.track, C.vein, `
<circle cx="512" cy="512" r="372" fill="#f6e3c4"/>
${plant(3, 512, 500, 400)}
<path d="M512 664 C448 626 336 620 262 646 L262 462 C336 436 448 442 512 480Z" fill="#fff" stroke="${C.green}" stroke-width="16" stroke-linejoin="round"/>
<path d="M512 664 C576 626 688 620 762 646 L762 462 C688 436 576 442 512 480Z" fill="#fff" stroke="${C.green}" stroke-width="16" stroke-linejoin="round"/>
<path d="M512 480 L512 664" stroke="${C.green}" stroke-width="16" stroke-linecap="round"/>
<path d="M312 504 C364 492 430 496 478 520 M312 548 C364 536 430 540 478 564 M312 592 C364 580 430 584 478 608" stroke="${C.track}" stroke-width="12" fill="none" stroke-linecap="round"/>
<path d="M546 520 C594 496 660 492 712 504 M546 564 C594 540 660 536 712 548 M546 608 C594 584 660 580 712 592" stroke="${C.track}" stroke-width="12" fill="none" stroke-linecap="round"/>
<path d="M684 462 L684 590 L714 562 L744 590 L744 470Z" fill="${C.bloom}"/>`);

// Curriculum: maps the course. Plants in a small prerequisite graph on a sage field.
const nodes = { a: [512, 282], b: [330, 470], c: [694, 470], d: [418, 702], e: [606, 702] };
const edges = [['a', 'b'], ['a', 'c'], ['b', 'd'], ['b', 'e'], ['c', 'e']];
const curriculum = frame(C.sage, C.mid, C.vein, `
<circle cx="512" cy="512" r="372" fill="${C.card}" opacity=".9"/>
${edges.map(([f, t]) => `<path d="M${nodes[f][0]} ${nodes[f][1] + 40} C${nodes[f][0]} ${(nodes[f][1] + nodes[t][1]) / 2 + 20} ${nodes[t][0]} ${(nodes[f][1] + nodes[t][1]) / 2 - 20} ${nodes[t][0]} ${nodes[t][1] - 50}" stroke="${C.mid}" stroke-width="12" fill="none" stroke-linecap="round"/>`).join('\n')}
${[['a', 2, 150], ['b', 1, 122], ['c', 1, 122], ['d', 0, 110], ['e', 0, 110]].map(([k, st, w]) => `<circle cx="${nodes[k][0]}" cy="${nodes[k][1]}" r="${w * 0.58}" fill="#fff" stroke="${C.mid}" stroke-width="8"/>${plant(st, nodes[k][0], nodes[k][1] + w * 0.34, w)}`).join('\n')}`);

// Arcade: the games. A controller with a sprout behind it, buttons in the live-game tile colours, on rust.
const arcade = frame('#a8482a', C.vein, '#8f3b21', `
<circle cx="512" cy="512" r="372" fill="${C.card}"/>
${plant(1, 512, 488, 300)}
<path d="M292 600 C292 520 330 468 400 468 L624 468 C694 468 732 520 732 600 C732 652 700 692 660 692 C620 692 600 664 570 644 L454 644 C424 664 404 692 364 692 C324 692 292 652 292 600Z" fill="${C.green}" stroke="${C.primary}" stroke-width="16" stroke-linejoin="round"/>
<rect x="374" y="518" width="36" height="96" rx="8" fill="${C.card}"/><rect x="344" y="548" width="96" height="36" rx="8" fill="${C.card}"/>
<circle cx="636" cy="516" r="26" fill="#d9694a"/><circle cx="680" cy="560" r="26" fill="#4f86b0"/><circle cx="636" cy="604" r="26" fill="${C.bloom}"/><circle cx="592" cy="560" r="26" fill="${C.vein}"/>
<rect x="476" y="548" width="72" height="22" rx="11" fill="${C.primary}" opacity=".7"/>`, 0.4);

// Garden: your progress. Plants at every stage of growth in a row, under a sun, on fresh green.
const garden = frame(C.vein, C.green, '#7fc57c', `
<circle cx="512" cy="512" r="372" fill="${C.card}"/>
<circle cx="690" cy="312" r="96" fill="${C.bloom}" opacity=".22"/><circle cx="690" cy="312" r="58" fill="${C.bloom}"/>
${[0, 1, 2, 3, 4].map(i => plant(i, 512 + (i - 2) * 130, 640, 160)).join('\n')}
<path d="M178 640 C300 672 724 672 846 640" stroke="${C.track}" stroke-width="14" fill="none" stroke-linecap="round" opacity=".8"/>`, 0.45);

const out = { sprout, tutor, curriculum, arcade, garden };
for (const [name, svg] of Object.entries(out)) writeFileSync(`public/avatars/${name}.svg`, svg);

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (existsSync(chrome)) {
  for (const name of Object.keys(out)) {
    const file = `${process.cwd()}/public/avatars/${name}`;
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=1024,1024', `--screenshot=${file}.png`, `file://${file}.svg`], { stdio: 'ignore' });
  }
  console.log('wrote public/avatars/{sprout,tutor,curriculum,arcade,garden}.{svg,png}');
} else console.log('wrote SVGs only (Chrome not found for PNGs)');
