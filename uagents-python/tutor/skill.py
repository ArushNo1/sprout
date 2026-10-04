"""The tutor's chat logic: diagnostic quizzes, lessons, flashcards, reviews and the journey map.

`on_chat(ctx, student, ChatMessage)` handles one message or card tap. tutor/agent.py runs it as a
standalone agent; the Sprout orchestrator runs it in-process so a tap costs one hosted-agent hop.

Everything a student knows lives in Sprout's SpacetimeDB database, so a new chat opens where the
last one ended. The database decides what to study next (compute_next_step: BKT mastery,
prerequisites, SM-2 reviews, Thompson sampling over formats) and updates it after every answer
(record_attempt). This module writes the questions and lessons with the ASI:One model and shows
them as cards.
"""

import asyncio
import os
import random
import re
from datetime import datetime, timezone

from uagents import Context
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    StartSessionContent,
    TextContent,
)

from sprout_db import DbError, enabled
from .cards import (course_picker_card, feedback_card, flashcard_back, flashcard_front, flashcard_summary,
                   forget_card, garden_link, home_card, journey_card, lesson_card, mastered_card, parse_selection,
                   question_card, summary_card, text_message)
from .content import make_lesson, make_question
from .learning import (FORMATS, active_courses, concept, course, days_until, end_session, forget_course, format_insight,
                       format_stats, journey, next_step, record, snapshot, start_session, upcoming_review)

CURRICULUM_HANDLE = os.getenv("CURRICULUM_HANDLE", "@blank-agent-181")
QUESTIONS = {"diagnostic": 5, "review": 3, "check": 2}
FORGET = re.compile(r"\b(forget|delete|remove|erase)\b.*\b(course|class|progress|data|history)\b", re.I)


def run(fn, *args):
    return asyncio.to_thread(fn, *args)


def load(ctx: Context, sender: str) -> dict:
    return ctx.storage.get(f"tutor:{sender}") or {}


def save(ctx: Context, sender: str, state: dict):
    ctx.storage.set(f"tutor:{sender}", state)


async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    if not enabled():
        await ctx.send(sender, text_message("The tutor isn't connected to Sprout's database yet (SPACETIMEDB_TOKEN)."))
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    sel = {} if any(isinstance(c, StartSessionContent) for c in msg.content) else parse_selection(text)
    action = sel.get("action") or ("forget_ask" if FORGET.search(text) else "start")
    try:
        await handle(ctx, sender, action, sel)
    except DbError as err:
        ctx.logger.error(f"database: {err}")
        await ctx.send(sender, text_message("I couldn't reach Sprout's database just now. Try again in a moment."))
    except Exception as err:  # the model or a network call failed; say so plainly
        ctx.logger.error(f"tutor error: {err}")
        await ctx.send(sender, text_message("Something went wrong writing that. Say \"hi\" to pick up where you were."))


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
        await teach(ctx, sender, state, concept_id=sel.get("concept_id"))
    elif action == "journey":
        path = await run(journey, sender, state["course_id"], state.get("concept_id"))
        await ctx.send(sender, journey_card(state.get("course_name") or (await run(course, state["course_id"]))["name"], path)
                       if path["current"] else text_message("This course has no concepts yet."))
    elif action == "reteach" and state.get("concept_id"):
        await teach(ctx, sender, state, again=True)
    elif action in ("flash", "flash_misses") and state.get("deck"):
        await start_flashcards(ctx, sender, state, misses_only=action == "flash_misses")
    elif action == "flip" and state.get("deck"):
        await flip_flashcard(ctx, sender, state, sel.get("i"))
    elif action == "mark" and state.get("deck"):
        await mark_flashcard(ctx, sender, state, sel.get("i"), sel.get("knew"))
    elif action == "check":
        state.update(mode="check", number=0, total=QUESTIONS["check"])
        await ask(ctx, sender, state)
    elif action == "next":
        await ask(ctx, sender, state)
    elif action == "answer":
        await answer(ctx, sender, state, sel.get("choice"))
    elif action == "done":
        await finish(ctx, sender, state)
    elif action == "forget_ask":
        name = state.get("course_name") or (await run(course, state["course_id"]))["name"]
        await ctx.send(sender, forget_card(name, state["course_id"]))
    elif action == "forget_confirm" and sel.get("course_id") == state["course_id"]:
        await run(forget_course, sender, state["course_id"])
        save(ctx, sender, {})
        await ctx.send(sender, text_message(
            f"Forgot {state.get('course_name') or 'that course'} and everything Sprout knew about it. "
            "Paste a syllabus any time to start another."))
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
    if welcome and (snap["recap"] or snap["due"]):
        opener = f"Welcome back to {c['name']}." + (f" Your exam is in {days} days." if days else "")
        if snap["due"]:
            opener += f" {snap['due']} concept{'s are' if snap['due'] != 1 else ' is'} due for review, so let's start there."
    state["course_name"] = c["name"]
    save(ctx, sender, state)
    await ctx.send(sender, home_card(c["name"], snap, days, insight, opener, garden_link(sender, state["course_id"])))


async def teach(ctx: Context, sender: str, state: dict, again: bool = False, concept_id=None):
    """The next concept the database picks, in the format it picks.

    again=True re-teaches the same concept in another format; concept_id (a tap on the journey map)
    teaches that concept instead of the database's pick, still in the format the bandit chooses.
    """
    con = None
    if concept_id is not None:
        try:
            con = await run(concept, int(concept_id))
        except (ValueError, IndexError):
            con = None
        if con and con["course_id"] != state["course_id"]:
            con = None
    if again:
        con = await run(concept, state["concept_id"])
        fmt = random.choice([f for f in FORMATS if f != state.get("fmt")])
    elif con:
        fmt = (await run(next_step, sender, state["course_id"], "teach"))["format"]
    else:
        step = await run(next_step, sender, state["course_id"], "teach")
        if step["mode"] == "complete":
            snap = await run(snapshot, sender, state["course_id"])
            await ctx.send(sender, mastered_card(state.get("course_name", "this course"), len(snap["concepts"])))
            return
        con, fmt = await run(concept, step["concept_id"]), step["format"]
    lesson = await run(make_lesson, state["course_name"], con, fmt)
    state.update(concept_id=con["id"], concept_name=con["name"], fmt=fmt, deck=lesson["deck"], card=0)
    save(ctx, sender, state)
    await ctx.send(sender, lesson_card(con["name"], fmt, lesson))


def card_index(i) -> int:
    try:
        return int(i)
    except (TypeError, ValueError):
        return -1


async def start_flashcards(ctx: Context, sender: str, state: dict, misses_only: bool = False):
    """Goes through the lesson's deck one card at a time (or just the ones missed last round)."""
    if misses_only and state.get("missed"):
        state["deck"] = [state["deck"][i] for i in state["missed"] if i < len(state["deck"])]
    state.update(card=0, known=0, missed=[], flash_before=None, flash_after=None)
    save(ctx, sender, state)
    await ctx.send(sender, flashcard_front(state["concept_name"], state["deck"][0], 0, len(state["deck"])))


async def flip_flashcard(ctx: Context, sender: str, state: dict, i):
    i, deck = card_index(i), state["deck"]
    if not 0 <= i < len(deck):
        i = min(state.get("card", 0), len(deck) - 1)
    await ctx.send(sender, flashcard_back(state["concept_name"], deck[i], i, len(deck)))


async def mark_flashcard(ctx: Context, sender: str, state: dict, i, knew):
    """Knew it / didn't know counts as practice evidence for the concept; skipping just moves on."""
    i, deck = card_index(i), state["deck"]
    if i != state.get("card", 0):  # a tap on an old card: show where they actually are
        if state.get("card", 0) < len(deck):
            j = state.get("card", 0)
            await ctx.send(sender, flashcard_front(state["concept_name"], deck[j], j, len(deck)))
        return
    if knew in ("yes", "no"):
        correct = knew == "yes"
        before, after = await run(record, sender, state["concept_id"], correct, "practice", None,
                                  state["session_id"], deck[i]["front"])
        track(state, before, after)
        state["cards_known"] = state.get("cards_known", 0) + int(correct)
        state["cards_seen"] = state.get("cards_seen", 0) + 1
        if state.get("flash_before") is None:
            state["flash_before"] = before
        state["flash_after"] = after
        state["known"] = state.get("known", 0) + int(correct)
        note = f"{'Knew it' if correct else 'Not yet'} · mastery {before:.0%} → {after:.0%}"
        state["studied"] = list(dict.fromkeys(state.get("studied", []) + [state["concept_name"]]))
        state["last_concept_id"] = state["concept_id"]
    else:
        note = "Skipped"
    if knew != "yes":
        state["missed"] = state.get("missed", []) + [i]
    state["card"] = i + 1
    save(ctx, sender, state)
    if state["card"] < len(deck):
        await ctx.send(sender, flashcard_front(state["concept_name"], deck[i + 1], i + 1, len(deck), note))
    else:
        await ctx.send(sender, flashcard_summary(state["concept_name"], state.get("known", 0), len(deck),
                                                 len(state.get("missed", [])), state.get("flash_before"),
                                                 state.get("flash_after")))


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


def track(state: dict, before: float, after: float):
    """Remembers each concept's mastery at its first answer this session and after its latest one."""
    moved = state.setdefault("moved", {})
    key = str(state["concept_id"])
    moved[key] = {"name": state["concept_name"], "from": moved.get(key, {}).get("from", before), "to": after}


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
    track(state, before, after)
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
               if answered else f"Studied {', '.join(studied[:4])}." if studied
               else "Opened the course but didn't answer any questions.")
    await run(end_session, sender, state["session_id"], summary, state.get("last_concept_id"))
    moved = sorted(state.get("moved", {}).values(), key=lambda m: m["to"] - m["from"], reverse=True)
    review = await run(upcoming_review, sender, state["course_id"])
    save(ctx, sender, {"course_id": state["course_id"]})  # the next chat starts a fresh session
    await ctx.send(sender, summary_card(state.get("course_name", "this course"), summary, answered, right,
                                        state.get("cards_known", 0), state.get("cards_seen", 0), moved, review))
