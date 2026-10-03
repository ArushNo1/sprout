import { PRODUCT_SIZE, PRODUCT_WIDE_SIZE, parseProductQuery, png, productTree, productWideTree } from "../lib/render.js";

export function GET(request) {
  const params = new URL(request.url).searchParams;
  const data = parseProductQuery(params);
  return params.get("layout") === "wide"
    ? png(productWideTree(data), PRODUCT_WIDE_SIZE)
    : png(productTree(data), PRODUCT_SIZE);
}
