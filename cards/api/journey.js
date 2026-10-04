import { journeyLayout, journeyTree, parseJourneyQuery, png } from "../lib/render.js";

export function GET(request) {
  const data = parseJourneyQuery(new URL(request.url).searchParams);
  const layout = journeyLayout(data.nodes);
  return png(journeyTree(data, layout), layout.size);
}
