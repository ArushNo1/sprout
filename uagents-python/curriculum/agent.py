"""Sprout curriculum agent: syllabus text in, concept map JSON out.

Two ways in:
- ParseSyllabusRequest from the orchestrator (returns ConceptMapResponse).
- Agent Chat Protocol from ASI:One: an upload card (course, exam date,
  syllabus) and a map card with "Looks right" / "Edit". Pasting a syllabus as
  plain text also works. Send "json" to get the last map as JSON.

Env (from .env): ASI_ONE_API_KEY (required), CURRICULUM_SEED (fixes the
address), ASI_ONE_MODEL (default "asi1-mini"; "asi1" is slower, similar maps),
SPROUT_CARDS_URL (card image server).
"""

import asyncio
import json
import os
from typing import Optional
from datetime import datetime, timezone
from uuid import uuid4

import requests
from dotenv import load_dotenv
from uagents import Agent, Context, Model, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

from cards import SAMPLE_COURSE, SAMPLE_SYLLABUS, map_card, parse_selection, text_message, upload_card
from concept_map import extract_json, mentions_exam_date, normalize, summarize
from prompt import SYSTEM_PROMPT, user_prompt

load_dotenv()

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

ASI_URL = "https://api.asi1.ai/v1/chat/completions"
MODEL = os.getenv("ASI_ONE_MODEL", "asi1-mini")
MIN_SYLLABUS_CHARS = 80


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


def call_llm(syllabus: str, course_name: Optional[str]) -> str:
    resp = requests.post(
        ASI_URL,
        headers={"Authorization": f"Bearer {os.environ['ASI_ONE_API_KEY']}"},
        json={
            "model": MODEL,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt(syllabus, course_name)},
            ],
        },
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


async def build_map(syllabus: str, course_name=None, exam_date=None) -> dict:
    """LLM extraction plus cleanup. One retry if the reply isn't valid JSON."""
    last_err = None
    for _ in range(2):
        try:
            reply = await asyncio.to_thread(call_llm, syllabus, course_name)
            raw = extract_json(reply)
            if not exam_date and not mentions_exam_date(syllabus):
                raw.get("course", {}).pop("exam_date", None)  # the model invents one otherwise
            if course_name or exam_date:
                raw.setdefault("course", {})
                if course_name:
                    raw["course"]["name"] = course_name
                if exam_date:
                    raw["course"]["exam_date"] = exam_date
            return normalize(raw)
        except (ValueError, KeyError, json.JSONDecodeError) as err:
            last_err = err
    raise ValueError(f"Couldn't build a concept map: {last_err}")


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
    except Exception as err:  # report plainly, never leave the orchestrator hanging
        ctx.logger.error(f"parse failed for {req.user}: {err}")
        await ctx.send(sender, ConceptMapResponse(ok=False, error=str(err)))


chat = Protocol(spec=chat_protocol_spec)


def _key(sender: str, what: str) -> str:
    return f"{what}:{sender}"


@agent.on_message(model=GetConceptMap, replies=ConceptMapReply)
async def on_get_map(ctx: Context, sender: str, req: GetConceptMap):
    cmap = ctx.storage.get(_key(req.user, "map"))
    ctx.logger.info(f"map request from {sender[:16]} for {req.user[:16]}: {'found' if cmap else 'none'}")
    await ctx.send(sender, ConceptMapReply(found=bool(cmap), concept_map=json.dumps(cmap) if cmap else ""))


async def reply_with_map(ctx: Context, sender: str, syllabus: str, course_name=None, exam_date=None):
    try:
        cmap = await build_map(syllabus, course_name, exam_date)
    except Exception as err:
        ctx.logger.error(f"chat parse failed: {err}")
        await ctx.send(sender, text_message(
            "I couldn't turn that into a concept map. Try pasting just the topic list or weekly schedule."))
        await ctx.send(sender, upload_card(course_name or "", exam_date or "", syllabus))
        return
    ctx.storage.set(_key(sender, "map"), cmap)
    ctx.storage.set(_key(sender, "draft"), {
        "course_name": course_name or cmap["course"]["name"],
        "exam_date": exam_date or cmap["course"].get("exam_date") or "",
        "syllabus": syllabus,
    })
    await ctx.send(sender, map_card(cmap))


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    if any(isinstance(c, StartSessionContent) for c in msg.content):
        await ctx.send(sender, upload_card())
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    selection = parse_selection(text)
    action = selection.get("action")

    if action == "build_map":
        syllabus = (selection.get("syllabus") or "").strip()
        if len(syllabus) < MIN_SYLLABUS_CHARS:
            await ctx.send(sender, text_message(
                "That syllabus is too short to map. Paste the units, weekly schedule, or lecture topics."))
            await ctx.send(sender, upload_card(selection.get("course_name", ""), selection.get("exam_date", ""), syllabus))
            return
        await reply_with_map(ctx, sender, syllabus, selection.get("course_name") or None, selection.get("exam_date") or None)
    elif action == "sample":
        await reply_with_map(ctx, sender, SAMPLE_SYLLABUS, SAMPLE_COURSE, selection.get("exam_date") or None)
    elif action == "edit_map":
        await ctx.send(sender, upload_card(**(ctx.storage.get(_key(sender, "draft")) or {})))
    elif action == "confirm_map":
        cmap = ctx.storage.get(_key(sender, "map"))
        if not cmap:
            await ctx.send(sender, upload_card())
            return
        ctx.storage.set(_key(sender, "confirmed"), True)
        await ctx.send(sender, text_message(
            f"Saved {cmap['course']['name']}: {len(cmap['concepts'])} concepts across {len(cmap['units'])} units. "
            "Next up is a short quiz to see where you're starting from."))
    elif text.lower() == "json" and ctx.storage.get(_key(sender, "map")):
        await ctx.send(sender, text_message(f"```json\n{json.dumps(ctx.storage.get(_key(sender, 'map')), indent=2)}\n```"))
    elif len(text) >= MIN_SYLLABUS_CHARS:
        await reply_with_map(ctx, sender, text)
    else:
        await ctx.send(sender, upload_card())


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
