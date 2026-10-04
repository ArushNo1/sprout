import { GAME_SIZE, gameTree, parseGameQuery, png } from "../lib/render.js";

export function GET(request) {
  return png(gameTree(parseGameQuery(new URL(request.url).searchParams)), GAME_SIZE);
}
