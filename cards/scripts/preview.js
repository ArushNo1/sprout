// Renders sample PNGs into preview/ so the design can be checked without deploying.
import { mkdirSync, writeFileSync } from "node:fs";
import { gardenSize, gardenTree, parseGardenQuery, GAME_SIZE, gameTree, parseGameQuery, parsePodiumQuery, podiumSize, podiumTree, journeyLayout, journeyTree, parseJourneyQuery, BUTTON_SIZE, PRODUCT_SIZE, PRODUCT_WIDE_SIZE, productWideTree, buttonTree, cardSize, cardTree, parseCardQuery, parseProductQuery, png, productTree } from "../lib/render.js";

mkdirSync("preview", { recursive: true });
const save = async (name, res) => writeFileSync(`preview/${name}.png`, Buffer.from(await res.arrayBuffer()));

const progress = parseCardQuery(new URLSearchParams(
  "title=Multiplying Matrices&subtitle=Linear Algebra&r=2.1~0.6&r=2.2~0.9&r=2.5~1&r=2.7~0.49&r=2.9~0.84"));
await save("progress", png(cardTree(progress), cardSize(progress.rows, true)));

const map = parseCardQuery(new URLSearchParams(
  "title=CS 1332 Data Structures and Algorithms&subtitle=CS 1332 · 26 concepts · exam in 19 days" +
  "&r=Foundations~1~6&r=Linear ADTs~0.5~3&r=Trees~1~6&r=Hashing and Sorting~1~7&r=Graphs~0.67~4"));
await save("map", png(cardTree(map), cardSize(map.rows, true)));

const garden = parseGardenQuery(new URLSearchParams(
  "title=CS 1332 Data Structures&subtitle=26 concepts · exam in 19 days&u=Foundations~000000&u=Linear ADTs~000&u=Trees~000000&u=Hashing and Sorting~0000000&u=Graphs~0000&u=Dynamic Programming~000000000000"));
await save("garden", png(gardenTree(garden), gardenSize(garden.units, true)));
const mixed = parseGardenQuery(new URLSearchParams("title=Linear Algebra&subtitle=7 concepts&u=Systems~4321&u=Matrices~210"));
await save("garden-mixed", png(gardenTree(mixed), gardenSize(mixed.units, true)));

await save("button-primary", png(buttonTree({ label: "Looks right", variant: "primary" }), BUTTON_SIZE));
await save("button-secondary", png(buttonTree({ label: "Edit", variant: "secondary" }), BUTTON_SIZE));
for (const [file, q] of [
  ["product-digital", "name=SAT Practice Set&category=Test practice&price=$2.99&tag=Digital&desc=15 original questions in your chosen section, with explanations"],
  ["product-ships", "name=TI-84 Plus CE Graphing Calculator&category=School supplies&price=$119.99&tag=Ships&desc=Allowed on the SAT, ACT and AP exams"],
]) await save(file, png(productTree(parseProductQuery(new URLSearchParams(q))), PRODUCT_SIZE));
await save("product-wide", png(productWideTree(parseProductQuery(new URLSearchParams("name=TI-84 Plus CE Graphing Calculator&category=School supplies&tag=Ships"))), PRODUCT_WIDE_SIZE));
const journey = parseJourneyQuery(new URLSearchParams(
  "title=Linear Algebra&n=0~done~Linear Systems&n=1~current~Augmented Matrices&n=2~next~Row Operations" +
  "&n=2~next~REF %26 RREF&n=3~later~Next Topic&e=0-1&e=1-2&e=1-3&e=2-4&e=3-4"));
const journeyBox = journeyLayout(journey.nodes);
await save("journey", png(journeyTree(journey, journeyBox), journeyBox.size));
const game = parseGameQuery(new URLSearchParams(
  "course=Linear Algebra&code=QGYA6Y&q=8&s=20&t=Row Operations&t=REF %26 RREF&t=Augmented Matrices&t=Linear Systems"));
await save("game", png(gameTree(game), GAME_SIZE));
const arcade = parseGameQuery(new URLSearchParams(
  "course=Linear Algebra&code=QGYA6Y&q=8&arcade=Quiz Runner&join=sprout-garden-seven.vercel.app/arcade/QGYA6Y&t=Row Operations&t=REF %26 RREF"));
await save("game-arcade", png(gameTree(arcade), GAME_SIZE));
for (const [file, q] of [
  ["podium", "title=Final results&subtitle=Linear Algebra · 8 questions&p=1~6420~Ada&p=2~5310~Pranav&p=3~4100~Bob&p=4~2200~Chris&p=5~900~Dana&me=1"],
  ["podium-two", "title=Final results&subtitle=Linear Algebra · 8 questions&p=1~3118~Pranav&p=2~1648~Ada&me=0"],
]) {
  const data = parsePodiumQuery(new URLSearchParams(q));
  await save(file, png(podiumTree(data), podiumSize(data.players)));
}
console.log("wrote preview/*.png");
