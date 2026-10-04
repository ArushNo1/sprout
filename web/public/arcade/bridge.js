// Talks to the play page that embeds an arcade game (components/play/Arcade.tsx).
// The page sends the questions; the game reports each answer as it happens. The
// iframe is sandboxed without same-origin, so postMessage is the only channel.
//
//   page -> game: {type: "sprout-questions", title, questions: [{prompt, choices, correct, explanation}], answered: [index]}
//                 {type: "sprout-live", total, rivals: [{name, done, score, me}], crowd: [{right, total}], events: [text]}
//   game -> page: {type: "sprout-ready"} | {type: "sprout-start"} | {type: "sprout-answer", index, choice} | {type: "sprout-done", score, practice}
//
// "sprout-live" is the shared board from SpacetimeDB, re-sent whenever anyone's
// answer lands, so the game can show rivals and the crowd without leaving the canvas.
window.Sprout = (() => {
  let resolveQuestions;
  const ready = new Promise((r) => (resolveQuestions = r));
  let live = { total: 0, rivals: [], crowd: [] };
  const events = [];
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data) return;
    if (e.data.type === "sprout-questions") resolveQuestions(e.data);
    if (e.data.type === "sprout-live") {
      live = e.data;
      events.push(...(e.data.events || []));
      if (events.length > 6) events.splice(0, events.length - 6);
    }
  });
  const send = (msg) => window.parent.postMessage(msg, "*");
  send({ type: "sprout-ready" });

  // Sprout's palette, as 0-255 RGB triples for Kaplay.
  const PALETTE = {
    bg: [10, 42, 22], card: [244, 234, 223], green: [11, 97, 34], fill: [78, 138, 94],
    tan: [220, 203, 178], right: [120, 200, 130], wrong: [210, 95, 70],
    tiles: [[11, 97, 34], [168, 72, 42], [44, 88, 120], [134, 99, 17]],
  };
  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

  // The rival to chase: whoever else is furthest along (then highest score).
  function rivalText() {
    const others = live.rivals.filter((r) => !r.me);
    if (!others.length || !live.total) return "";
    const top = others.sort((a, b) => b.done - a.done || b.score - a.score)[0];
    const name = top.name.length > 12 ? top.name.slice(0, 11) + "…" : top.name;
    return `${name} is on ${top.done} of ${live.total}`;
  }

  return {
    PALETTE,
    FONT,
    // Resolves with the questions once the page sends them.
    questions: () => ready,
    // Call when a run begins (the first and every replay): the board keeps the best run.
    start: () => send({ type: "sprout-start" }),
    answer: (index, choice) => send({ type: "sprout-answer", index, choice }),
    done: (score, practice) => send({ type: "sprout-done", score, practice }),

    // " · 3 of 4 players got this", once anyone else has answered question qi.
    crowd(qi) {
      const c = live.crowd[qi];
      if (!c || !c.total) return "";
      return `\n${c.right} of ${c.total} ${c.total === 1 ? "player" : "players"} got this`;
    },

    // Call inside a scene: a rival line at the top of the question panel and
    // toasts under it when other players score. Kaplay objects, scene-scoped.
    hud({ panelH, z: layer }) {
      const w = width();
      const rival = add([text("", { size: 15, font: FONT }), pos(w / 2, 16), anchor("top"), color(...PALETTE.fill), z(layer)]);
      const toasts = [];
      events.length = 0;  // only news from this run on
      onUpdate(() => {
        rival.text = rivalText();
        while (events.length) {
          const t = add([
            text(events.shift(), { size: 16, font: FONT }), pos(w - 12, panelH + 12), anchor("topright"),
            color(...PALETTE.card), opacity(1), z(layer), { age: 0 },
          ]);
          toasts.unshift(t);
        }
        toasts.forEach((t, i) => {
          t.age += dt();
          t.pos.y = lerp(t.pos.y, panelH + 12 + i * 24, Math.min(1, dt() * 10));
          t.opacity = Math.max(0, Math.min(1, 3 - t.age)) * 0.85;
        });
        for (let i = toasts.length - 1; i >= 0; i--) if (toasts[i].age > 3 || i > 3) { destroy(toasts[i]); toasts.splice(i, 1); }
      });
    },
  };
})();
