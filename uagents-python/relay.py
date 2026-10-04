"""Lets the orchestrator speak to specialists on a student's behalf, in-process or across agents.

In-process (the fast path Sprout uses): the orchestrator imports a specialist's chat handler and
runs it with an InProcessContext, so the student's messages go straight out and a card tap costs
one hosted-agent hop instead of three.

Across agents (still supported, for other orchestrators): the orchestrator sends a specialist a
StudentTurn (the student's address plus what they typed or tapped); the specialist runs its normal
chat handler as if the student had messaged it directly, and returns the chat messages it would
have sent (cards included) in a StudentReplies. The orchestrator passes those on to the student.

Specialists keep keying state and database rows by the student's address, and
only accept turns from addresses listed in TRUSTED_ORCHESTRATORS.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

from uagents import Context, Model, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    MetadataContent,
    StartSessionContent,
    TextContent,
)


class StudentTurn(Model):
    user: str             # the student's ASI:One address
    text: str = ""        # what they typed, or a card's selection JSON
    start: bool = False   # a brand-new chat


class StudentReplies(Model):
    user: str
    messages: list[str]   # ChatMessage JSON, in the order they were sent


def turn_message(turn: StudentTurn) -> ChatMessage:
    content = [StartSessionContent(type="start-session")] if turn.start else []
    if turn.text:
        content.append(TextContent(type="text", text=turn.text))
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=content)


def fresh(raw: str) -> ChatMessage:
    """A relayed message with its own id and time, as the orchestrator's message to the student."""
    msg = ChatMessage.model_validate_json(raw)
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=msg.content)


def trusted() -> set:
    return {a.strip() for a in os.getenv("TRUSTED_ORCHESTRATORS", "").split(",") if a.strip()}


class CaptureContext:
    """Stands in for the handler's Context: messages to the student are collected instead of sent.

    Storage, logging and messages to anyone else go through the real context.
    """

    def __init__(self, ctx: Context, user: str):
        self._ctx, self._user, self.messages = ctx, user, []

    def __getattr__(self, name):
        return getattr(self._ctx, name)

    async def send(self, destination: str, message, *args, **kwargs):
        if destination == self._user:
            if isinstance(message, ChatMessage):
                self.messages.append(message.model_dump_json())
            return None  # acknowledgements to the student are the orchestrator's job
        return await self._ctx.send(destination, message, *args, **kwargs)


def is_card(msg: ChatMessage) -> bool:
    return any(isinstance(c, MetadataContent) and c.metadata.get("card_kind") for c in msg.content)


class InProcessContext:
    """Stands in for the handler's Context when the orchestrator runs a specialist itself.

    Messages to the student go out right away through the real context, except acknowledgements
    (the orchestrator already sent one). Remembers whether a card went out, so the next tap can be
    routed back to the same specialist.
    """

    def __init__(self, ctx: Context, user: str):
        self._ctx, self._user, self.sent_card = ctx, user, False

    def __getattr__(self, name):
        return getattr(self._ctx, name)

    async def send(self, destination: str, message, *args, **kwargs):
        if destination == self._user:
            if isinstance(message, ChatAcknowledgement):
                return None
            if isinstance(message, ChatMessage) and is_card(message):
                self.sent_card = True
        return await self._ctx.send(destination, message, *args, **kwargs)


async def run_in_process(ctx: Context, on_chat, turn: StudentTurn) -> bool:
    """Runs a specialist's chat handler for one student turn. Returns whether it sent a card."""
    inner = InProcessContext(ctx, turn.user)
    await on_chat(inner, turn.user, turn_message(turn))
    return inner.sent_card


async def handle_turn(ctx: Context, sender: str, turn: StudentTurn, on_chat):
    """Runs the specialist's chat handler as the student and replies with what it would have sent."""
    if sender not in trusted():
        ctx.logger.warning(f"ignored a relayed turn from untrusted {sender[:20]}")
        return
    capture = CaptureContext(ctx, turn.user)
    await on_chat(capture, turn.user, turn_message(turn))
    await ctx.send(sender, StudentReplies(user=turn.user, messages=capture.messages))


def relay_protocol(on_chat) -> Protocol:
    """Specialist side: runs `on_chat(ctx, user, ChatMessage)` for each trusted StudentTurn."""
    proto = Protocol(name="SproutRelay", version="0.1.0")

    @proto.on_message(model=StudentTurn, replies=StudentReplies)
    async def on_turn(ctx: Context, sender: str, turn: StudentTurn):
        await handle_turn(ctx, sender, turn, on_chat)

    return proto
