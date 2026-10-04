"""The curriculum agent's chat logic: syllabus in, concept map out, saved to the shared database.

`on_chat(ctx, student, ChatMessage)` handles one message or card tap: an upload card (course, exam
date, syllabus) and a map card with "Looks right" / "Edit". Pasting a syllabus as plain text also
works, and "json" returns the last map. curriculum/agent.py runs it as a standalone agent; the
Sprout orchestrator runs it in-process.

Courses are saved to Sprout's SpacetimeDB database (see ../sprout_db.py): a built map becomes a
draft course with its concepts and prerequisite links, and "Looks right" confirms it, which creates
the student's mastery rows. Without SPACETIMEDB_TOKEN maps stay in the agent's own storage.
"""

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from uagents import Context
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, StartSessionContent, TextContent

from sprout_db import NONE, DbError, call, enabled, opt, sql, sql_str, timestamp
from .cards import SAMPLE_COURSE, SAMPLE_SYLLABUS, map_card, parse_selection, text_message, upload_card
from .concept_map import extract_json, mentions_exam_date, normalize
from .prompt import SYSTEM_PROMPT, user_prompt

ASI_URL = "https://api.asi1.ai/v1/chat/completions"
MODEL = os.getenv("ASI_ONE_MODEL", "asi1-mini")
MIN_SYLLABUS_CHARS = 80


def map_key(sender: str, what: str) -> str:
    return f"{what}:{sender}"


def post_with_retry(url: str, **kwargs) -> requests.Response:
    """One retry after a short pause when the model API times out or is overloaded (429/5xx)."""
    for attempt in (1, 2):
        try:
            r = requests.post(url, **kwargs)
            if r.status_code != 429 and r.status_code < 500:
                return r
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 2:
                raise
        if attempt == 1:
            time.sleep(1.5)
    return r


def call_llm(syllabus: str, course_name: Optional[str]) -> str:
    resp = post_with_retry(
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


def save_course(address: str, cmap: dict, syllabus: str, course_id=None):
    """Writes the map to the shared database as a draft course. Returns its id.

    Reuses `course_id` while it's still a draft (an edit replaces the earlier
    extraction); otherwise creates a new draft course.
    """
    name = cmap["course"]["name"]
    exam = cmap["course"].get("exam_date")
    exam_arg = opt(timestamp(exam)) if exam else NONE
    call("upsert_learner", address, NONE)
    draft = course_id and sql(
        f"SELECT id FROM course WHERE id = {int(course_id)} AND user_address = {sql_str(address)} AND status = 'draft'")
    if draft:
        call("update_course", address, int(course_id), opt(name), NONE, exam_arg)
    else:
        call("create_course", address, name, NONE, exam_arg, syllabus)
        drafts = sql(f"SELECT id, created_at FROM course WHERE user_address = {sql_str(address)} AND status = 'draft'")
        course_id = max(drafts, key=lambda r: r["created_at"])["id"]
    names = {c["id"]: c["name"] for c in cmap["concepts"]}
    concepts = [{"name": c["name"], "summary": c["summary"], "embedding": [], "p_init": NONE} for c in cmap["concepts"]]
    # The database stores "concept requires prerequisite"; our edges point prerequisite -> concept.
    edges = [{"concept": names[e["to"]], "requires": names[e["from"]], "confidence": e["confidence"]}
             for e in cmap["edges"]]
    call("ingest_concept_graph", address, int(course_id), concepts, edges)
    return int(course_id)


async def reply_with_map(ctx: Context, sender: str, syllabus: str, course_name=None, exam_date=None):
    try:
        cmap = await build_map(syllabus, course_name, exam_date)
    except Exception as err:
        ctx.logger.error(f"chat parse failed: {err}")
        await ctx.send(sender, text_message(
            "I couldn't turn that into a concept map. Try pasting just the topic list or weekly schedule."))
        await ctx.send(sender, upload_card(course_name or "", exam_date or "", syllabus))
        return
    ctx.storage.set(map_key(sender, "map"), cmap)
    previous = ctx.storage.get(map_key(sender, "draft")) or {}
    course_id = None
    if enabled():
        try:
            course_id = await asyncio.to_thread(save_course, sender, cmap, syllabus, previous.get("course_id"))
        except (DbError, KeyError, ValueError) as err:
            ctx.logger.error(f"saving course to SpacetimeDB failed: {err}")
    ctx.storage.set(map_key(sender, "draft"), {
        "course_name": course_name or cmap["course"]["name"],
        "exam_date": exam_date or cmap["course"].get("exam_date") or "",
        "syllabus": syllabus,
        "course_id": course_id,
    })
    await ctx.send(sender, map_card(cmap))


async def greet(ctx: Context, sender: str):
    """First contact in a session. Whether this address is new comes from
    SpacetimeDB's `learner` table, never from the LLM or local storage."""
    if not enabled():
        await ctx.send(sender, upload_card())
        return
    try:
        known = await asyncio.to_thread(sql, f"SELECT address FROM learner WHERE address = {sql_str(sender)}")
        if not known:
            await asyncio.to_thread(call, "upsert_learner", sender, NONE)
    except Exception as err:
        ctx.logger.warning(f"SpacetimeDB lookup failed, skipping onboarding: {err}")
        await ctx.send(sender, upload_card())
        return
    if not known:
        await ctx.send(sender, text_message(
            "Welcome to Sprout! I turn a syllabus into a map of what to learn and in what order, "
            "so you always know what's next. Tell me about a class you're taking, or any subject "
            "you're trying to get better at -- paste a syllabus, a topic list, or just describe it."))
    await ctx.send(sender, upload_card())


async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    if any(isinstance(c, StartSessionContent) for c in msg.content):
        await greet(ctx, sender)
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
        draft = ctx.storage.get(map_key(sender, "draft")) or {}
        await ctx.send(sender, upload_card(draft.get("course_name", ""), draft.get("exam_date", ""), draft.get("syllabus", "")))
    elif action == "confirm_map":
        cmap = ctx.storage.get(map_key(sender, "map"))
        if not cmap:
            await ctx.send(sender, upload_card())
            return
        ctx.storage.set(map_key(sender, "confirmed"), True)
        course_id = (ctx.storage.get(map_key(sender, "draft")) or {}).get("course_id")
        if course_id and enabled():
            try:
                await asyncio.to_thread(call, "confirm_course", sender, int(course_id))
            except DbError as err:
                ctx.logger.error(f"confirming course {course_id} failed: {err}")
        await ctx.send(sender, text_message(
            f"Saved {cmap['course']['name']}: {len(cmap['concepts'])} concepts across {len(cmap['units'])} units. "
            "Next up is a short quiz to see where you're starting from."))
    elif text.lower() == "json" and ctx.storage.get(map_key(sender, "map")):
        await ctx.send(sender, text_message(f"```json\n{json.dumps(ctx.storage.get(map_key(sender, 'map')), indent=2)}\n```"))
    elif len(text) >= MIN_SYLLABUS_CHARS:
        await reply_with_map(ctx, sender, text)
    else:
        await ctx.send(sender, upload_card())


def forget(ctx: Context, sender: str):
    """Drops the student's stored map and draft (the course itself is deleted in the database)."""
    for what in ("map", "draft", "confirmed"):
        ctx.storage.set(map_key(sender, what), None)


async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass
