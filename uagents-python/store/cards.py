"""ASI:One cards for the store. Images come from the sprout-cards Vercel project.

Card replies arrive as text JSON {"selection": {<inputs>, "action": ...}, "approved": true}.
Text-only replies end the chat session, or ASI:One doesn't show them.
"""

import json
import os
from datetime import datetime, timezone
from urllib.parse import quote, urlencode
from uuid import uuid4

from uagents_core.contrib.protocols.chat import ChatMessage, EndSessionContent, MetadataContent, TextContent

from cart import label, summary_lines, total_cents
from catalog import BY_ID, CATEGORIES, MAX_QTY, money, products_in

CARDS_URL = os.getenv("SPROUT_CARDS_URL", "https://sprout-cards-six.vercel.app")
CARD_WIDTH = "560"
TAGS = {"digital": "Digital", "pass": "Digital", "physical": "Ships"}


def text_message(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")],
    )


def _card(text: str, kind: str, payload: dict) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=text),
            MetadataContent(type="metadata", metadata={
                "card_protocol_version": "1",
                "requires_card_interaction": "true",
                "card_kind": kind,
                "card_payload": json.dumps(payload),
                "preferred_drawer_width_px": CARD_WIDTH,
            }),
        ],
    )


def parse_selection(text: str) -> dict:
    """Card replies are JSON text, sometimes after an @mention. Returns {} for plain chat."""
    text = (text or "").strip()
    if text.startswith("@"):
        text = text.split(None, 1)[1] if " " in text else ""
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    selection = data.get("selection", data)
    return selection if isinstance(selection, dict) and selection.get("action") else {}


def _button(label_text: str, action: str, primary: bool = False, **extra) -> dict:
    return {"type": "button", "label": label_text, "primary": primary,
            "action": {"selection": {"action": action, **extra}}}


def _row(*buttons) -> dict:
    return {"type": "group", "direction": "row", "gap": 8, "children": list(buttons)}


def product_image(p: dict, wide: bool = False) -> str:
    """4:3 tile with price and description, or a wide one for carousels (they crop to ~16:9
    and print the name and price under the image)."""
    params = {"name": p["name"], "category": CATEGORIES[p["category"]]["name"], "tag": TAGS[p["kind"]]}
    if wide:
        params["layout"] = "wide"
    else:
        params.update(price=money(p["price_cents"]), desc=p["desc"])
    return f"{CARDS_URL}/api/product?{urlencode(params, quote_via=quote)}"


def _cart_label(cart: dict) -> str:
    n = len(cart.get("lines", []))
    return f"Cart ({n})" if n else "Cart"


def home_card(cart: dict) -> ChatMessage:
    root = {"type": "section", "children": [
        {"type": "image", "src": f"{CARDS_URL}/header.png", "alt": "Sprout store", "aspect_ratio": "1080:300"},
        {"type": "text", "style": "muted",
         "value": "Exam prep built from your course, SAT, ACT and AP practice, and school supplies."},
        _row(_button("Exam prep", "category", True, category="exam_prep"),
             _button("SAT, ACT & AP", "category", True, category="test_practice")),
        _row(_button("School supplies", "category", True, category="supplies"),
             _button(_cart_label(cart), "cart")),
    ]}
    return _card("Welcome to the Sprout store. What do you need?", "custom", {"root": root})


def category_card(category: str, cart: dict) -> ChatMessage:
    cat = CATEGORIES[category]
    items = [{
        "id": p["id"],
        "image": product_image(p, wide=True),
        "title": p["name"],
        "subtitle": p["desc"],
        "secondary_text": money(p["price_cents"]),
        "primary_cta": {"label": "Choose" if p.get("options") or p["kind"] == "physical" else "Add to cart",
                        "selection": {"action": "pick", "product_id": p["id"]}},
    } for p in products_in(category)]
    payload = {"title": cat["name"], "subtitle": cat["blurb"], "style": "slide", "items": items,
               "root_cta": {"label": _cart_label(cart), "selection": {"action": "cart"}}}
    return _card(f"{cat['name']}: swipe through and pick what you need.", "carousel", payload)


def options_card(product_id: str, error: str = "") -> ChatMessage:
    p = BY_ID[product_id]
    children = [{"type": "image", "src": product_image(p), "alt": p["name"], "aspect_ratio": "4:3"}]
    if error:
        children.append({"type": "badge", "label": error, "variant": "warning"})
    for opt in p.get("options", []):
        field = {"type": "input", "name": opt["name"], "kind": opt["kind"], "label": opt["label"],
                 "required": bool(opt.get("required"))}
        if opt["kind"] == "select":
            field["options"] = [{"value": c, "label": c} for c in opt["choices"]]
        if opt.get("placeholder"):
            field["placeholder"] = opt["placeholder"]
        children.append(field)
    if p["kind"] == "physical":
        children.append({"type": "input", "name": "qty", "kind": "select", "label": "Quantity",
                         "options": [{"value": str(n), "label": str(n)} for n in range(1, MAX_QTY + 1)],
                         "default": "1"})
    children.append(_row(_button("Add to cart", "add", True, product_id=product_id),
                         _button("Back", "category", category=p["category"])))
    return _card(f"{p['name']}, {money(p['price_cents'])}.", "custom", {"root": {"type": "section", "children": children}})


def cart_card(cart: dict, note: str = "") -> ChatMessage:
    lines = cart.get("lines", [])
    children = [{"type": "heading", "value": "Your cart", "level": 2}]
    if note:
        children.append({"type": "badge", "label": note, "variant": "success"})
    if not lines:
        children += [{"type": "text", "value": "Your cart is empty.", "style": "muted"},
                     _row(_button("Browse the store", "home", True))]
        return _card("Your cart is empty.", "custom", {"root": {"type": "section", "children": children}})
    children += [{"type": "text", "value": s, "style": "body"} for s in summary_lines(cart)]
    children += [
        {"type": "divider"},
        {"type": "text", "value": f"Total {money(total_cents(cart))}", "style": "emphasis"},
        {"type": "input", "name": "remove", "kind": "select", "label": "Remove an item",
         "options": [{"value": str(i), "label": label(line)} for i, line in enumerate(lines)]},
        _row(_button("Checkout", "checkout", True), _button("Keep shopping", "home")),
        _row(_button("Remove item", "remove"), _button("Empty cart", "clear")),
    ]
    return _card(f"Your cart: {money(total_cents(cart))}.", "custom", {"root": {"type": "section", "children": children}})


def receipt_card(order: dict) -> ChatMessage:
    children = [
        {"type": "heading", "value": "Order confirmed", "level": 2},
        {"type": "badge", "label": f"Order {order['id']} · {money(order['total_cents'])} · test mode", "variant": "success"},
    ]
    children += [{"type": "text", "value": s, "style": "body"} for s in order["summary"]]
    if order.get("shipping"):
        children.append({"type": "text", "style": "muted",
                         "value": f"Ships to {order['shipping']['name']}, {order['shipping']['address']}"})
    children.append(_row(_button("Back to store", "home", True), _button("My orders", "orders")))
    return _card("Payment received. Thanks!", "custom", {"root": {"type": "section", "children": children}})
