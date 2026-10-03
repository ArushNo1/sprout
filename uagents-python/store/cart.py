"""Cart math and Stripe line items. Pure functions over plain dicts so carts fit in ctx.storage.

A cart is {"lines": [{"product_id", "qty", "options": {...}}]}.
"""

from catalog import BY_ID, MAX_QTY, money


class CartError(ValueError):
    """Something the student can fix, phrased so it can be shown to them."""


def empty_cart() -> dict:
    return {"lines": []}


def clean_options(product: dict, raw: dict) -> dict:
    """Keep only the product's own options, check required ones and select choices."""
    out = {}
    for opt in product.get("options", []):
        value = str(raw.get(opt["name"]) or "").strip()
        if opt.get("required") and not value:
            raise CartError(f"Pick a {opt['label'].lower()} for {product['name']}.")
        if value and opt["kind"] == "select" and value not in opt["choices"]:
            raise CartError(f"{value} isn't an option for {product['name']}.")
        if value:
            out[opt["name"]] = value[:200]
    return out


def add_line(cart: dict, product_id: str, qty=1, options=None) -> dict:
    product = BY_ID.get(product_id)
    if not product:
        raise CartError("That item isn't in the store.")
    try:
        qty = int(qty)
    except (TypeError, ValueError):
        qty = 1
    if product["kind"] != "physical":
        qty = 1  # digital items and passes are one per line
    qty = max(1, min(MAX_QTY, qty))
    opts = clean_options(product, options or {})
    lines = [dict(line) for line in cart.get("lines", [])]
    for line in lines:
        if line["product_id"] == product_id and line.get("options", {}) == opts:
            if product["kind"] != "physical":
                raise CartError(f"{label(line)} is already in your cart.")
            line["qty"] = min(MAX_QTY, line["qty"] + qty)
            return {"lines": lines}
    lines.append({"product_id": product_id, "qty": qty, "options": opts})
    return {"lines": lines}


def remove_line(cart: dict, index) -> dict:
    lines = list(cart.get("lines", []))
    try:
        lines.pop(int(index))
    except (TypeError, ValueError, IndexError):
        pass
    return {"lines": lines}


def label(line: dict) -> str:
    product = BY_ID[line["product_id"]]
    picks = [v for k, v in line.get("options", {}).items() if k in ("section", "subject", "topic", "course")]
    return f"{product['name']} ({', '.join(picks)})" if picks else product["name"]


def line_total(line: dict) -> int:
    return BY_ID[line["product_id"]]["price_cents"] * line["qty"]


def total_cents(cart: dict) -> int:
    return sum(line_total(line) for line in cart.get("lines", []))


def needs_shipping(cart: dict) -> bool:
    return any(BY_ID[line["product_id"]]["kind"] == "physical" for line in cart.get("lines", []))


def summary_lines(cart: dict) -> list:
    out = []
    for line in cart.get("lines", []):
        qty = f" x{line['qty']}" if line["qty"] > 1 else ""
        out.append(f"{label(line)}{qty}: {money(line_total(line))}")
    return out


def stripe_line_items(cart: dict) -> list:
    """Line items for a Stripe Checkout Session (price_data, so no Stripe products to manage)."""
    return [
        {
            "quantity": line["qty"],
            "price_data": {
                "currency": "usd",
                "unit_amount": BY_ID[line["product_id"]]["price_cents"],
                "product_data": {"name": label(line)[:250], "description": BY_ID[line["product_id"]]["desc"]},
            },
        }
        for line in cart.get("lines", [])
    ]
