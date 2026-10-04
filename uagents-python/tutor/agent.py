"""Sprout tutor agent, standalone (the Sprout orchestrator also runs the same logic in-process).

Run from uagents-python/:  python -m tutor.agent
Env (from .env): ASI_ONE_API_KEY, TUTOR_SEED (fixes the address), ASI_ONE_MODEL, SPROUT_CARDS_URL,
SPACETIMEDB_HOST / SPACETIMEDB_DB / SPACETIMEDB_TOKEN, TRUSTED_ORCHESTRATORS.
"""

import asyncio
import os

from dotenv import load_dotenv

load_dotenv()  # before the skill modules read their settings

from uagents import Agent, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, chat_protocol_spec  # noqa: E402

from relay import relay_protocol  # noqa: E402
from tutor.skill import on_ack, on_chat  # noqa: E402

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

agent = Agent(
    name="sprout-tutor",
    seed=os.getenv("TUTOR_SEED", "sprout tutor agent dev seed"),
    port=int(os.getenv("TUTOR_PORT", "8003")),
    mailbox=True,
)

chat = Protocol(spec=chat_protocol_spec)
chat.on_message(ChatMessage)(on_chat)
chat.on_message(ChatAcknowledgement)(on_ack)

agent.include(chat, publish_manifest=True)
agent.include(relay_protocol(on_chat))  # turns relayed by another orchestrator

if __name__ == "__main__":
    agent.run()
