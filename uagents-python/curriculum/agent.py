"""Sprout curriculum agent, standalone: syllabus text in, concept map out.

Two ways in:
- ParseSyllabusRequest from another agent (returns ConceptMapResponse), and GetConceptMap for a
  student's saved map.
- Agent Chat Protocol from ASI:One, handled by curriculum/skill.py (the Sprout orchestrator runs
  the same logic in-process).

Run from uagents-python/:  python -m curriculum.agent
Env (from .env): ASI_ONE_API_KEY (required), CURRICULUM_SEED (fixes the address), ASI_ONE_MODEL
(default "asi1-mini"), SPROUT_CARDS_URL, SPACETIMEDB_HOST / SPACETIMEDB_DB / SPACETIMEDB_TOKEN,
TRUSTED_ORCHESTRATORS.
"""

import asyncio
import json
import os
from typing import Optional

from dotenv import load_dotenv

load_dotenv()  # before the skill modules read their settings

from uagents import Agent, Context, Model, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, chat_protocol_spec  # noqa: E402

from relay import relay_protocol  # noqa: E402
from curriculum.concept_map import summarize  # noqa: E402
from curriculum.skill import build_map, map_key, on_ack, on_chat  # noqa: E402

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())


class ParseSyllabusRequest(Model):
    user: str  # ASI:One sender address of the student
    syllabus: str
    course_name: Optional[str] = None
    exam_date: Optional[str] = None  # YYYY-MM-DD


class ConceptMapResponse(Model):
    ok: bool
    concept_map: str = ""  # JSON string matching concept_map.schema.json
    summary: str = ""
    error: str = ""


# Other Sprout agents ask for a student's saved map with these. uAgents matches messages
# by schema, so any agent that sends them must define identical classes.
class GetConceptMap(Model):
    user: str  # ASI:One address of the student


class ConceptMapReply(Model):
    found: bool
    concept_map: str = ""  # JSON matching concept_map.schema.json


agent = Agent(
    name="sprout-curriculum",
    seed=os.getenv("CURRICULUM_SEED", "sprout curriculum agent dev seed"),
    port=int(os.getenv("CURRICULUM_PORT", "8001")),
    mailbox=True,
)


@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info(f"Curriculum agent address: {agent.address}")


@agent.on_message(model=ParseSyllabusRequest, replies=ConceptMapResponse)
async def on_parse(ctx: Context, sender: str, req: ParseSyllabusRequest):
    try:
        cmap = await build_map(req.syllabus, req.course_name, req.exam_date)
        await ctx.send(sender, ConceptMapResponse(
            ok=True, concept_map=json.dumps(cmap), summary=summarize(cmap)))
    except Exception as err:  # report plainly, never leave the caller hanging
        ctx.logger.error(f"parse failed for {req.user}: {err}")
        await ctx.send(sender, ConceptMapResponse(ok=False, error=str(err)))


@agent.on_message(model=GetConceptMap, replies=ConceptMapReply)
async def on_get_map(ctx: Context, sender: str, req: GetConceptMap):
    cmap = ctx.storage.get(map_key(req.user, "map"))
    ctx.logger.info(f"map request from {sender[:16]} for {req.user[:16]}: {'found' if cmap else 'none'}")
    await ctx.send(sender, ConceptMapReply(found=bool(cmap), concept_map=json.dumps(cmap) if cmap else ""))


chat = Protocol(spec=chat_protocol_spec)
chat.on_message(ChatMessage)(on_chat)
chat.on_message(ChatAcknowledgement)(on_ack)

agent.include(chat, publish_manifest=True)
agent.include(relay_protocol(on_chat))  # turns relayed by another orchestrator

if __name__ == "__main__":
    agent.run()
