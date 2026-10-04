// Renders sample PNGs into preview/ so the design can be checked without deploying.
import { mkdirSync, writeFileSync } from "node:fs";
import { journeyLayout, journeyTree, parseJourneyQuery, BUTTON_SIZE, PRODUCT_SIZE, PRODUCT_WIDE_SIZE, productWideTree, buttonTree, cardSize, cardTree, parseCardQuery, parseProductQuery, png, productTree } from "../lib/render.js";

mkdirSync("preview", { recursive: true });
const save = async (name, res) => writeFileSync(`preview/${name}.png`, Buffer.from(await res.arrayBuffer()));

const progress = parseCardQuery(new URLSearchParams(
  "title=Multiplying Matrices&subtitle=Linear Algebra&r=2.1~0.6&r=2.2~0.9&r=2.5~1&r=2.7~0.49&r=2.9~0.84"));
await save("progress", png(cardTree(progress), cardSize(progress.rows, true)));

const map = parseCardQuery(new URLSearchParams(
  "title=CS 1332 Data Structures and Algorithms&subtitle=CS 1332 · 26 concepts · exam in 19 days" +
  "&r=Foundations~1~6&r=Linear ADTs~0.5~3&r=Trees~1~6&r=Hashing and Sorting~1~7&r=Graphs~0.67~4"));
await save("map", png(cardTree(map), cardSize(map.rows, true)));

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
console.log("wrote preview/*.png");
