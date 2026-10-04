"""The garden agent's chat logic: it shows a student where they stand across everything they study.

`on_chat(ctx, student, ChatMessage)` handles one message or card tap. garden/agent.py runs it as a
standalone agent; the Sprout orchestrator runs it in-process.

It owns the read side of the knowledge graph: the learning journey map (where you are, what you
can take on next), the all-courses garden overview with links to the web gardens, and free-form
questions about progress ("which course is my weakest?", "what's due this week?"), answered by the
ASI:One model through read-only tools that can only ever see the asking student's own data. It
never writes mastery; teaching, games and syllabi are other agents' jobs.
"""

import asyncio
import re
from datetime import datetime, timezone

from uagents import Context
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, StartSessionContent, TextContent

from cardkit import parse_selection, text_message
from learning import current_course, journey, micros
from sprout_db import DbError, enabled, sql, sql_str
from .cards import gardens_card, journey_card
from .insights import answer_question, gardens

CURRICULUM_HANDLE = "@blank-agent-181"
JOURNEY_WORDS = re.compile(r"\b(journey|path|roadmap|what('?s| is) next|learning map)\b", re.I)
GARDENS = re.compile(r"\b(gardens|all my (courses|classes)|my (courses|classes)|every course|switch course)\b", re.I)


def run(fn, *args):
    return asyncio.to_thread(fn, *args)


async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    if not enabled():
        await ctx.send(sender, text_message("The garden isn't connected to Sprout's database yet (SPACETIMEDB_TOKEN)."))
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    started = any(isinstance(c, StartSessionContent) for c in msg.content)
    sel = {} if started else parse_selection(text)
    action = sel.get("action") or ("gardens" if started or not text or GARDENS.search(text)
                                   else "journey" if JOURNEY_WORDS.search(text) else "insight")
    try:
        await handle(ctx, sender, action, {**sel, "question": text})
    except DbError as err:
        ctx.logger.error(f"database: {err}")
        await ctx.send(sender, text_message("I couldn't reach Sprout's database just now. Try again in a moment."))
    except Exception as err:  # the model or a network call failed; say so plainly
        ctx.logger.error(f"garden error: {err}")
        await ctx.send(sender, text_message("I couldn't work that out just now. Ask again in a moment."))


def last_concept(address: str, course_id: int):
    """The concept the student studied last in this course, so the journey map centers on it."""
    rows = [r for r in sql(f"SELECT course_id, last_concept_id, started_at FROM session "
                           f"WHERE user_address = {sql_str(address)}") if r["course_id"] == course_id and r["last_concept_id"]]
    return max(rows, key=lambda r: micros(r["started_at"]))["last_concept_id"] if rows else None


async def handle(ctx: Context, sender: str, action: str, sel: dict):
    if action == "insight":
        await ctx.send(sender, text_message(await run(answer_question, sender, sel.get("question") or "")))
    elif action == "journey":
        c = await run(current_course, sender, sel.get("course_id"))
        path = await run(journey, sender, c["id"], await run(last_concept, sender, c["id"])) if c else None
        await ctx.send(sender, journey_card(c["name"], path) if path and path["current"] else text_message(
            f"You don't have a course with concepts yet. Paste your syllabus to Sprout Curriculum ({CURRICULUM_HANDLE})."))
    else:
        mine = await run(gardens, sender)
        await ctx.send(sender, gardens_card(sender, mine) if mine else text_message(
            f"You don't have a course yet. Paste your syllabus to Sprout Curriculum ({CURRICULUM_HANDLE}) to grow your first garden."))
