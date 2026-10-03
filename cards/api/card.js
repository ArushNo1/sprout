import { cardSize, cardTree, parseCardQuery, png } from "../lib/render.js";

export function GET(request) {
  const data = parseCardQuery(new URL(request.url).searchParams);
  return png(cardTree(data), cardSize(data.rows, Boolean(data.subtitle)));
}
