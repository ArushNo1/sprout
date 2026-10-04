import { gardenSize, gardenTree, parseGardenQuery, png } from "../lib/render.js";

export function GET(request) {
  const data = parseGardenQuery(new URL(request.url).searchParams);
  return png(gardenTree(data), gardenSize(data.units, Boolean(data.subtitle)));
}
