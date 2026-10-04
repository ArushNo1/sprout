// Talks to the play page that embeds an arcade game (spacetimedb/src/play/Arcade.tsx).
// The page sends the questions; the game reports each answer as it happens. The
// iframe is sandboxed without same-origin, so postMessage is the only channel.
//
//   page -> game: {type: "sprout-questions", title, questions: [{prompt, choices, correct, explanation}], answered: [index]}
//   game -> page: {type: "sprout-ready"} | {type: "sprout-start"} | {type: "sprout-answer", index, choice} | {type: "sprout-done", score, practice}
window.Sprout = (() => {
  let resolveQuestions;
  const ready = new Promise((r) => (resolveQuestions = r));
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || e.data.type !== "sprout-questions") return;
    resolveQuestions(e.data);
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

  return {
    PALETTE,
    FONT,
    // Resolves with the questions once the page sends them.
    questions: () => ready,
    // Call when a run begins (the first and every replay): the board keeps the best run.
    start: () => send({ type: "sprout-start" }),
    answer: (index, choice) => send({ type: "sprout-answer", index, choice }),
    done: (score, practice) => send({ type: "sprout-done", score, practice }),
  };
})();
