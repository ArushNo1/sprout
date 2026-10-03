"""Sprout tutor agent: diagnostic quizzes, lessons in the format that works for each student, and reviews.

Everything a student knows lives in Sprout's SpacetimeDB database, so a new chat
opens where the last one ended. The database decides what to study next
(compute_next_step: BKT mastery, prerequisites, SM-2 reviews, Thompson sampling
over formats) and updates it after every answer (record_attempt). This agent
writes the questions and lessons with the ASI:One model and shows them as cards.

Env (from .env): ASI_ONE_API_KEY, TUTOR_SEED (fixes the address), ASI_ONE_MODEL,
SPROUT_CARDS_URL, SPACETIMEDB_HOST / SPACETIMEDB_DB / SPACETIMEDB_TOKEN.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # shared sprout_db.py

from sprout_db import DbError, enabled
from relay import relay_protocol
from cards import course_picker_card, feedback_card, home_card, lesson_card, parse_selection, question_card, text_message
from content import make_lesson, make_question
from learning import (active_courses, concept, course, days_until, end_session, format_insight, format_stats,
                      next_step, record, snapshot, start_session)

load_dotenv()

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

CURRICULUM_HANDLE = os.getenv("CURRICULUM_HANDLE", "@blank-agent-181")
QUESTIONS = {"diagnostic": 5, "review": 3, "check": 2}

agent = Agent(
    name="sprout-tutor",
    seed=os.getenv("TUTOR_SEED", "sprout tutor agent dev seed"),
    port=int(os.getenv("TUTOR_PORT", "8003")),
    mailbox=True,
)

chat = Protocol(spec=chat_protocol_spec)


def run(fn, *args):
    return asyncio.to_thread(fn, *args)


def load(ctx: Context, sender: str) -> dict:
    return ctx.storage.get(f"tutor:{sender}") or {}


def save(ctx: Context, sender: str, state: dict):
    ctx.storage.set(f"tutor:{sender}", state)


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    if not enabled():
        await ctx.send(sender, text_message("The tutor isn't connected to Sprout's database yet (SPACETIMEDB_TOKEN)."))
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    sel = {} if any(isinstance(c, StartSessionContent) for c in msg.content) else parse_selection(text)
    try:
        await handle(ctx, sender, sel.get("action") or "start", sel)
    except DbError as err:
        ctx.logger.error(f"database: {err}")
        await ctx.send(sender, text_message("I couldn't reach Sprout's database just now. Try again in a moment."))
    except Exception as err:  # the model or a network call failed; say so plainly
        ctx.logger.error(f"tutor error: {err}")
        await ctx.send(sender, text_message("Something went wrong writing that. Say \"hi\" to pick up where you were."))


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


async def handle(ctx: Context, sender: str, action: str, sel: dict):
    state = load(ctx, sender)
    if action == "open" and sel.get("course_id"):
        await open_course(ctx, sender, int(sel["course_id"]))
    elif action == "start" or not state.get("course_id"):
        await start(ctx, sender, state)
    elif action == "home":
        await show_home(ctx, sender, state)
    elif action in ("diagnostic", "review"):
        state.update(mode=action, number=0, total=QUESTIONS[action])
        await ask(ctx, sender, state)
    elif action == "teach":
        await teach(ctx, sender, state)
    elif action == "check":
        state.update(mode="check", number=0, total=QUESTIONS["check"])
        await ask(ctx, sender, state)
    elif action == "next":
        await ask(ctx, sender, state)
    elif action == "answer":
        await answer(ctx, sender, state, sel.get("choice"))
    elif action == "done":
        await finish(ctx, sender, state)
    else:
        await show_home(ctx, sender, state)


async def start(ctx: Context, sender: str, state: dict):
    courses = await run(active_courses, sender)
    if not courses:
        await ctx.send(sender, text_message(
            f"You don't have a course yet. Paste your syllabus to Sprout Curriculum ({CURRICULUM_HANDLE}), "
            "tap \"Looks right\", then come back here."))
    elif len(courses) == 1:
        await open_course(ctx, sender, courses[0]["id"])
    else:
        await ctx.send(sender, course_picker_card(courses))


async def open_course(ctx: Context, sender: str, course_id: int):
    state = load(ctx, sender)
    if state.get("course_id") != course_id or not state.get("session_id"):
        state = {"course_id": course_id, "session_id": await run(start_session, sender, course_id),
                 "studied": [], "answered": 0, "right": 0, "asked": []}
        save(ctx, sender, state)
    await show_home(ctx, sender, state, welcome=True)


async def show_home(ctx: Context, sender: str, state: dict, welcome: bool = False):
    c = await run(course, state["course_id"])
    snap = await run(snapshot, sender, state["course_id"])
    days = days_until(c.get("exam_date"))
    insight = format_insight(await run(format_stats, sender))
    opener = ""
    if welcome and snap["recap"]:
        opener = f"Welcome back to {c['name']}." + (f" Your exam is in {days} days." if days else "")
    state["course_name"] = c["name"]
    save(ctx, sender, state)
    await ctx.send(sender, home_card(c["name"], snap, days, insight, opener))


async def teach(ctx: Context, sender: str, state: dict):
    step = await run(next_step, sender, state["course_id"], "teach")
    if step["mode"] == "complete":
        await ctx.send(sender, text_message("You've mastered every concept in this course. Try a review instead."))
        return
    con = await run(concept, step["concept_id"])
    lesson = await run(make_lesson, state["course_name"], con, step["format"])
    state.update(concept_id=con["id"], concept_name=con["name"], fmt=step["format"])
    save(ctx, sender, state)
    await ctx.send(sender, lesson_card(con["name"], step["format"], lesson))


async def ask(ctx: Context, sender: str, state: dict):
    mode = state.get("mode", "diagnostic")
    if mode == "check":
        con = await run(concept, state["concept_id"])
    else:
        step = await run(next_step, sender, state["course_id"], mode)
        if step["mode"] == "complete":
            done = "Nothing is due for review right now." if mode == "review" else "You've been quizzed on every concept."
            await ctx.send(sender, text_message(f"{done} Say \"hi\" to see your progress."))
            return
        con = await run(concept, step["concept_id"])
    q = await run(make_question, state["course_name"], con, mode, state.get("asked", []))
    state.update(concept_id=con["id"], concept_name=con["name"], question=q,
                 number=state.get("number", 0) + 1, asked=(state.get("asked", []) + [q["question"]])[-10:])
    save(ctx, sender, state)
    await ctx.send(sender, question_card(con["name"], mode, q, state["number"], state["total"]))


async def answer(ctx: Context, sender: str, state: dict, choice):
    q = state.get("question")
    try:
        choice = int(choice)
    except (TypeError, ValueError):
        choice = -1
    if not q or not 0 <= choice < len(q["choices"]):
        await show_home(ctx, sender, state)
        return
    mode = state.get("mode", "diagnostic")
    correct = choice == q["correct_index"]
    fmt = state.get("fmt") if mode == "check" else None  # only taught material says anything about a format
    before, after = await run(record, sender, state["concept_id"], correct, mode, fmt, state["session_id"], q["question"])
    state.update(question=None, answered=state.get("answered", 0) + 1, right=state.get("right", 0) + int(correct),
                 studied=list(dict.fromkeys(state.get("studied", []) + [state["concept_name"]])),
                 last_concept_id=state["concept_id"])
    save(ctx, sender, state)
    if state["number"] < state["total"]:
        nxt = ("Next question", "next")
    elif mode == "check":
        nxt = ("Learn the next concept", "teach")
    else:
        nxt = ("See my progress", "home")
    await ctx.send(sender, feedback_card(q, choice, before, after, state["concept_name"], *nxt))


async def finish(ctx: Context, sender: str, state: dict):
    studied, answered, right = state.get("studied", []), state.get("answered", 0), state.get("right", 0)
    summary = (f"Studied {', '.join(studied[:4])}; got {right} of {answered} questions right."
               if answered else "Opened the course but didn't answer any questions.")
    await run(end_session, sender, state["session_id"], summary, state.get("last_concept_id"))
    save(ctx, sender, {"course_id": state["course_id"]})  # the next chat starts a fresh session
    await ctx.send(sender, text_message(f"Nice work. {summary} Next time we'll pick up right here."))


agent.include(chat, publish_manifest=True)
agent.include(relay_protocol(on_chat))  # turns relayed by the orchestrator

if __name__ == "__main__":
    agent.run()
