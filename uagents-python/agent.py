import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

AGENT_NAME = os.getenv("AGENT_NAME", "sprout")
AGENT_SEED = os.environ["AGENT_SEED"]  # keep secret; determines the agent address
AGENT_PORT = int(os.getenv("AGENT_PORT", "8000"))

# mailbox=True lets Agentverse relay messages to this agent, so no public endpoint is needed.
agent = Agent(
    name=AGENT_NAME,
    seed=AGENT_SEED,
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)

chat_proto = Protocol(spec=chat_protocol_spec)


def reply_to(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")],
    )


def handle_text(text: str) -> str:
    """Replace with the agent's real logic."""
    return f"Sprout heard: {text}"


@agent.on_event("startup")
async def on_startup(ctx: Context):
    ctx.logger.info(f"I'm {ctx.agent.name}, address: {ctx.agent.address}")


@chat_proto.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    kinds = [type(c).__name__ for c in msg.content]
    ctx.logger.info(f"[inbound] ChatMessage from {sender} content={kinds}")
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id),
    )
    text = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    if text:
        await ctx.send(sender, reply_to(handle_text(text)))
        ctx.logger.info(f"[outbound] replied to {sender}")


@chat_proto.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"Ack from {sender} for {msg.acknowledged_msg_id}")


agent.include(chat_proto, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
