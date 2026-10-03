import { PRODUCT_SIZE, parseProductQuery, png, productTree } from "../lib/render.js";

export function GET(request) {
  return png(productTree(parseProductQuery(new URL(request.url).searchParams)), PRODUCT_SIZE);
}
