import { parsePodiumQuery, png, podiumSize, podiumTree } from "../lib/render.js";

export function GET(request) {
  const data = parsePodiumQuery(new URL(request.url).searchParams);
  return png(podiumTree(data), podiumSize(data.players));
}
