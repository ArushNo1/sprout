"""Sprout orchestrator: the one agent students talk to in ASI:One.

It decides which specialist handles each message and runs that specialist's chat logic
in-process (tutor/skill.py, curriculum/skill.py), so a card tap costs one hosted-agent hop.
With SPROUT_IN_PROCESS=0 it relays to the separately hosted specialist agents instead
(see ../relay.py), which is slower: three hops per tap.
- Curriculum agent: new students, pasted syllabi, "add a course", and the
  upload and map cards.
- Tutor agent: everything about studying ("let's keep going", quizzes,
  reviews) and its progress, question and lesson cards.

A brand-new chat goes to the tutor when the student already has an active
course in Sprout's database, so it opens with where they left off, what's due
and days to the exam; otherwise it goes to the curriculum agent's upload card.
After a student confirms a course map, the orchestrator hands them to the tutor.

Run from uagents-python/:  python -m orchestrator.agent
Env (from .env): ORCHESTRATOR_SEED, ASI_ONE_API_KEY (the in-process specialists call the model),
SPACETIMEDB_HOST / SPACETIMEDB_DB / SPACETIMEDB_TOKEN; for relaying, CURRICULUM_ADDRESS and
TUTOR_ADDRESS.
"""

import asyncio
import os
import time
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()  # before the specialist modules read their settings

from uagents import Agent, Context, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import (  # noqa: E402
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

from curriculum.skill import forget as forget_map, on_chat as curriculum_chat  # noqa: E402
from orchestrator.routing import CURRICULUM, TUTOR, card_action, choose_route  # noqa: E402
from relay import StudentReplies, StudentTurn, fresh, is_card, run_in_process  # noqa: E402
from sprout_db import STATS, DbError, enabled, sql, sql_str  # noqa: E402
from tutor.skill import on_chat as tutor_chat  # noqa: E402

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

SKILLS = {CURRICULUM: curriculum_chat, TUTOR: tutor_chat}
IN_PROCESS = os.getenv("SPROUT_IN_PROCESS", "1") != "0"
ADDRESSES = {
    CURRICULUM: os.getenv("CURRICULUM_ADDRESS", "agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh"),
    TUTOR: os.getenv("TUTOR_ADDRESS", ""),
}

agent = Agent(
    name="sprout",
    seed=os.getenv("ORCHESTRATOR_SEED", "sprout orchestrator dev seed"),
    port=int(os.getenv("ORCHESTRATOR_PORT", "8000")),
    mailbox=True,
    publish_agent_details=True,
)


def load(ctx: Context, user: str) -> dict:
    return ctx.storage.get(f"route:{user}") or {}


def save(ctx: Context, user: str, state: dict):
    ctx.storage.set(f"route:{user}", state)


def has_course(user: str) -> bool:
    if not enabled():
        return False
    try:
        return bool(sql(f"SELECT id FROM course WHERE user_address = {sql_str(user)} AND status = 'active'"))
    except DbError:
        return False


def say(text: str) -> ChatMessage:
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(),
                       content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")])


async def forward(ctx: Context, user: str, specialist: str, text: str = "", start: bool = False, then: str = ""):
    """Hands the student's turn to a specialist. `then` names a specialist to start after it replies."""
    if IN_PROCESS:
        try:
            sent_card = await run_in_process(ctx, SKILLS[specialist], StudentTurn(user=user, text=text, start=start))
        except Exception as err:  # a specialist bug shouldn't leave the student without a reply
            ctx.logger.error(f"{specialist} failed: {err}")
            await ctx.send(user, say("Something went wrong on my side. Say \"hi\" to pick up where you were."))
            return
        if sent_card:
            state = load(ctx, user)
            state["cards_from"] = specialist  # the next card tap goes back to whoever sent the card
            save(ctx, user, state)
        if then:
            await forward(ctx, user, then, start=True)
        return
    address = ADDRESSES.get(specialist)
    if not address:
        await ctx.send(user, say("That part of Sprout isn't connected yet. Try again soon."))
        return
    state = load(ctx, user)
    state.update(waiting=specialist, then=then)
    save(ctx, user, state)
    await ctx.send(address, StudentTurn(user=user, text=text, start=start))


chat = Protocol(spec=chat_protocol_spec)


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    # The acknowledgement takes seconds to deliver from a hosted agent, so it goes out alongside the work.
    ack = asyncio.create_task(ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc),
                                                                    acknowledged_msg_id=msg.msg_id)))
    try:
        await handle_turn(ctx, sender, msg)
    finally:
        await ack


async def handle_turn(ctx: Context, sender: str, msg: ChatMessage):
    if any(isinstance(c, EndSessionContent) for c in msg.content) and not any(isinstance(c, TextContent) for c in msg.content):
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    new_chat = any(isinstance(c, StartSessionContent) for c in msg.content)
    started, db_calls, db_seconds = time.monotonic(), STATS["calls"], STATS["seconds"]
    state = load(ctx, sender)
    # Card taps never need the course lookup, and they're most of the traffic.
    known = True if card_action(text) else await asyncio.to_thread(has_course, sender)
    route = choose_route(text, new_chat, state.get("cards_from"), known)
    await forward(ctx, sender, route.specialist, route.text, route.start, route.then)
    if card_action(text) == "forget_confirm":
        forget_map(ctx, sender)
    ctx.logger.info(f"{sender[:16]} -> {route.specialist} ({route.why}) in {time.monotonic() - started:.1f}s, "
                    f"{STATS['calls'] - db_calls} database calls taking {STATS['seconds'] - db_seconds:.1f}s")


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


relay = Protocol(name="SproutRelay", version="0.1.0")


@relay.on_message(model=StudentReplies)
async def on_replies(ctx: Context, sender: str, replies: StudentReplies):
    specialist = next((name for name, address in ADDRESSES.items() if address == sender), None)
    if not specialist:
        ctx.logger.warning(f"ignored replies from unknown {sender[:20]}")
        return
    state = load(ctx, replies.user)
    for raw in replies.messages:
        msg = fresh(raw)
        if is_card(msg):
            state["cards_from"] = specialist  # the next card tap goes back to whoever sent the card
        await ctx.send(replies.user, msg)
    then = state.get("then")
    state.update(waiting="", then="")
    save(ctx, replies.user, state)
    if then:
        await forward(ctx, replies.user, then, start=True)


agent.include(chat, publish_manifest=True)
agent.include(relay)

if __name__ == "__main__":
    agent.run()
