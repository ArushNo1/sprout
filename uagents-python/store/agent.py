"""Sprout store agent: exam prep, SAT/ACT/AP practice and school supplies, paid with Stripe.

Students shop with cards in ASI:One, pay through the Agent Payment Protocol
(embedded Stripe Checkout, test mode), and get their order in the chat:
digital items are written by the ASI:One model, supplies get a shipping
confirmation. The Exam Pack asks the Curriculum agent for the student's map.

Env (from .env): ASI_ONE_API_KEY, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY,
STORE_SEED (fixes the address), CURRICULUM_ADDRESS, SPROUT_CARDS_URL.
"""

import asyncio
import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)
from uagents_core.contrib.protocols.payment import (
    CommitPayment,
    CompletePayment,
    Funds,
    RejectPayment,
    RequestPayment,
    payment_protocol_spec,
)

from cards import cart_card, category_card, home_card, options_card, parse_selection, receipt_card, text_message
from cart import CartError, add_line, empty_cart, label, needs_shipping, remove_line, stripe_line_items, summary_lines, total_cents
from catalog import BY_ID, CATEGORIES, match_keywords, money
from fulfill import call_llm, needs_map, prompt_for, shipping_note
from messages import ConceptMapReply, GetConceptMap
from stripe_api import create_checkout, get_session, shipping_of

load_dotenv()

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

CURRICULUM_ADDRESS = os.getenv(
    "CURRICULUM_ADDRESS", "agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh")
PASS_DAYS = 30

agent = Agent(
    name="sprout-store",
    seed=os.getenv("STORE_SEED", "sprout store agent dev seed"),
    port=int(os.getenv("STORE_PORT", "8002")),
    mailbox=True,
)


# ---- per-student state in agent storage ----

def _get(ctx: Context, what: str, sender: str, default):
    value = ctx.storage.get(f"{what}:{sender}")
    return value if value is not None else default


def _set(ctx: Context, what: str, sender: str, value):
    ctx.storage.set(f"{what}:{sender}", value)


# ---- chat ----

chat = Protocol(spec=chat_protocol_spec)


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    cart = _get(ctx, "cart", sender, empty_cart())
    if any(isinstance(c, StartSessionContent) for c in msg.content):
        await ctx.send(sender, home_card(cart))
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    sel = parse_selection(text)
    if not sel and text:
        target = match_keywords(text)
        if target and target[0] == "product":
            sel = {"action": "pick", "product_id": target[1]}
        elif target and target[0] == "category":
            sel = {"action": "category", "category": target[1]}
        elif target:
            sel = {"action": target[1]}
    await handle(ctx, sender, sel.get("action") or "home", sel, cart)


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


async def handle(ctx: Context, sender: str, action: str, sel: dict, cart: dict):
    if action == "category" and sel.get("category") in CATEGORIES:
        await ctx.send(sender, category_card(sel["category"], cart))
    elif action == "pick" and sel.get("product_id") in BY_ID:
        p = BY_ID[sel["product_id"]]
        if p.get("options") or p["kind"] == "physical":
            await ctx.send(sender, options_card(p["id"]))
        else:
            await add_to_cart(ctx, sender, cart, p["id"], 1, {})
    elif action == "add" and sel.get("product_id") in BY_ID:
        await add_to_cart(ctx, sender, cart, sel["product_id"], sel.get("qty", 1), sel)
    elif action == "remove":
        cart = remove_line(cart, sel.get("remove"))
        _set(ctx, "cart", sender, cart)
        await ctx.send(sender, cart_card(cart, "Removed"))
    elif action == "clear":
        _set(ctx, "cart", sender, empty_cart())
        await ctx.send(sender, home_card(empty_cart()))
    elif action == "cart":
        await ctx.send(sender, cart_card(cart))
    elif action == "checkout":
        await checkout(ctx, sender, cart)
    elif action == "resend":
        orders = _get(ctx, "orders", sender, [])
        if orders:
            await ctx.send(sender, text_message(await deliver(ctx, sender, orders[-1])))
        else:
            await ctx.send(sender, text_message(orders_text(orders)))
    elif action == "orders":
        await ctx.send(sender, text_message(orders_text(_get(ctx, "orders", sender, []))))
    else:
        await ctx.send(sender, home_card(cart))


async def add_to_cart(ctx: Context, sender: str, cart: dict, product_id: str, qty, options: dict):
    try:
        cart = add_line(cart, product_id, qty, options)
    except CartError as err:
        if BY_ID[product_id].get("options"):
            await ctx.send(sender, options_card(product_id, str(err)))
        else:
            await ctx.send(sender, cart_card(cart, str(err)))
        return
    _set(ctx, "cart", sender, cart)
    await ctx.send(sender, cart_card(cart, f"Added {label(cart['lines'][-1])}"))


def orders_text(orders: list) -> str:
    if not orders:
        return "You haven't ordered anything yet. Say \"store\" to browse."
    out = ["Your orders:"]
    for o in orders[-10:][::-1]:
        out.append(f"- {o['id']} on {o['date']}: {money(o['total_cents'])}, {', '.join(o['summary'])}")
    return "\n".join(out)


# ---- payment (seller side of the Agent Payment Protocol) ----

payments = Protocol(spec=payment_protocol_spec, role="seller")


async def checkout(ctx: Context, sender: str, cart: dict):
    if not cart.get("lines"):
        await ctx.send(sender, cart_card(cart))
        return
    order_id = uuid4().hex[:8].upper()
    try:
        stripe = await asyncio.to_thread(
            create_checkout, stripe_line_items(cart), needs_shipping(cart),
            {"order_id": order_id, "user_address": sender, "service": "sprout_store"})
    except Exception as err:
        ctx.logger.error(f"checkout failed: {err}")
        await ctx.send(sender, cart_card(cart, "Checkout isn't available right now. Try again in a minute."))
        return
    _set(ctx, "pending", sender, {"order_id": order_id, "session_id": stripe["checkout_session_id"],
                                  "cart": cart, "created": time.time()})
    total = total_cents(cart)
    await ctx.send(sender, RequestPayment(
        accepted_funds=[Funds(currency="USD", amount=f"{total / 100:.2f}", payment_method="stripe")],
        recipient=str(ctx.agent.address),
        deadline_seconds=1800,
        reference=order_id,
        description=(f"Sprout order {order_id}: {money(total)}. Test mode: pay with card 4242 4242 4242 4242, "
                     "any future date and any CVC."),
        metadata={"stripe": stripe, "service": "sprout_store", "order_id": order_id},
    ))


@payments.on_message(CommitPayment)
async def on_commit(ctx: Context, sender: str, msg: CommitPayment):
    pending = _get(ctx, "pending", sender, None)
    if not pending or msg.funds.payment_method != "stripe" or msg.transaction_id != pending["session_id"]:
        await ctx.send(sender, RejectPayment(reason="That payment doesn't match your current order."))
        return
    try:
        session = await asyncio.to_thread(get_session, msg.transaction_id)
    except Exception as err:
        ctx.logger.error(f"stripe lookup failed: {err}")
        await ctx.send(sender, RejectPayment(reason="I couldn't reach Stripe to confirm the payment. Approve it again in a moment."))
        return
    cart = pending["cart"]
    if session.get("payment_status") != "paid" or session.get("amount_total") != total_cents(cart):
        await ctx.send(sender, RejectPayment(reason="Stripe hasn't confirmed this payment yet. Finish checkout, then approve again."))
        return

    await ctx.send(sender, CompletePayment(transaction_id=msg.transaction_id))
    order = {"id": pending["order_id"], "date": date.today().isoformat(), "total_cents": total_cents(cart),
             "summary": summary_lines(cart), "lines": cart["lines"], "shipping": shipping_of(session),
             "stripe_session": msg.transaction_id}
    orders = _get(ctx, "orders", sender, [])
    _set(ctx, "orders", sender, (orders + [order])[-50:])
    _set(ctx, "cart", sender, empty_cart())
    _set(ctx, "pending", sender, None)
    await ctx.send(sender, receipt_card(order))
    await ctx.send(sender, text_message(await deliver(ctx, sender, order)))


@payments.on_message(RejectPayment)
async def on_reject(ctx: Context, sender: str, msg: RejectPayment):
    _set(ctx, "pending", sender, None)
    await ctx.send(sender, cart_card(_get(ctx, "cart", sender, empty_cart()), "Payment canceled. Your cart is saved."))


async def fetch_map(ctx: Context, user: str):
    """Ask the Curriculum agent for the student's saved concept map. None if it has none."""
    try:
        reply, _ = await ctx.send_and_receive(CURRICULUM_ADDRESS, GetConceptMap(user=user),
                                              response_type=ConceptMapReply, timeout=25)
    except Exception as err:
        ctx.logger.warning(f"concept map request failed: {err}")
        return None
    if isinstance(reply, ConceptMapReply) and reply.found:
        try:
            return json.loads(reply.concept_map)
        except ValueError:
            return None
    return None


async def deliver(ctx: Context, sender: str, order: dict) -> str:
    """Everything the student bought, as one message."""
    parts = [f"# Order {order['id']}"]
    lines = order["lines"]
    cmap = await fetch_map(ctx, sender) if any(needs_map(l) for l in lines) else None
    for line in lines:
        product = BY_ID[line["product_id"]]
        if product["kind"] == "digital":
            try:
                body = await asyncio.to_thread(call_llm, prompt_for(line, cmap))
            except Exception as err:
                ctx.logger.error(f"writing {line['product_id']} failed: {err}")
                body = "I couldn't write this one right now. Send \"resend\" and I'll try again."
            parts.append(f"## {label(line)}\n\n{body}")
        elif product["kind"] == "pass":
            until = (date.today() + timedelta(days=PASS_DAYS)).isoformat()
            _set(ctx, "pass_until", sender, until)
            parts.append(f"## {product['name']}\n\nActive until {until}: unlimited courses and format insights.")
    physical = [l for l in lines if BY_ID[l["product_id"]]["kind"] == "physical"]
    if physical:
        parts.append(f"## Shipping\n\n{shipping_note(physical, order.get('shipping'))}")
    return "\n\n".join(parts)


agent.include(chat, publish_manifest=True)
agent.include(payments, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
