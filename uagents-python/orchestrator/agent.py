"""Sprout orchestrator: the one agent students talk to in ASI:One.

It decides which specialist handles each message and relays their replies,
cards included (see ../relay.py):
- Curriculum agent: new students, pasted syllabi, "add a course", and the
  upload and map cards.
- Tutor agent: everything about studying ("let's keep going", quizzes,
  reviews) and its progress, question and lesson cards.

A brand-new chat goes to the tutor when the student already has an active
course in Sprout's database, so it opens with where they left off, what's due
and days to the exam; otherwise it goes to the curriculum agent's upload card.
After a student confirms a course map, the orchestrator hands them to the tutor.

Env (from .env): ORCHESTRATOR_SEED, CURRICULUM_ADDRESS, TUTOR_ADDRESS,
SPACETIMEDB_HOST / SPACETIMEDB_DB / SPACETIMEDB_TOKEN.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    MetadataContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # shared sprout_db.py and relay.py

from sprout_db import DbError, enabled, sql, sql_str
from relay import StudentReplies, StudentTurn, fresh
from routing import CURRICULUM, TUTOR, choose_route

load_dotenv()

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

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
    """Sends the student's turn to a specialist. `then` names a specialist to start after it replies."""
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
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    if any(isinstance(c, EndSessionContent) for c in msg.content) and not any(isinstance(c, TextContent) for c in msg.content):
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    new_chat = any(isinstance(c, StartSessionContent) for c in msg.content)
    state = load(ctx, sender)
    route = choose_route(text, new_chat, state.get("cards_from"), await asyncio.to_thread(has_course, sender))
    ctx.logger.info(f"{sender[:16]} -> {route.specialist} ({route.why})")
    await forward(ctx, sender, route.specialist, route.text, route.start, route.then)


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
        if any(isinstance(c, MetadataContent) and c.metadata.get("card_kind") for c in msg.content):
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
