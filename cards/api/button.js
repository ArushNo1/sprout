import { BUTTON_SIZE, buttonTree, png } from "../lib/render.js";

export function GET(request) {
  const q = new URL(request.url).searchParams;
  const label = (q.get("label") || "Continue").slice(0, 24);
  return png(buttonTree({ label, variant: q.get("variant") }), BUTTON_SIZE);
}
