"""The arcade agent's chat logic: it builds multiplayer study games and reports how they went.

`on_chat(ctx, student, ChatMessage)` handles one message or card tap. arcade/agent.py runs it as a
standalone agent; the Sprout orchestrator runs it in-process.

A request ("make a game for my study group", a Live game or Arcade button) picks the concepts the
student needs most, has the ASI:One model write and then double-check questions on them, and opens
a room in SpacetimeDB. Friends join from a link; every answer a linked Sprout learner gives goes
through record_attempt, so playing moves the same mastery model the tutor uses. Results turns a
finished room into the podium card with what moved and what the group found hardest.
"""

import asyncio
import re
from datetime import datetime, timezone

from uagents import Context
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, StartSessionContent, TextContent

from cardkit import _button, _card, _row, _section, parse_selection, text_message
from learning import current_course, snapshot
from sprout_db import DbError, enabled
from .cards import arcade_card, game_card, results_card
from .game import (ARCADE, GAME_QUESTIONS, SECONDS_PER_QUESTION, create_game, game_questions, interleave, pick_concepts,
                   results, split)

CURRICULUM_HANDLE = "@blank-agent-181"
ARCADE_WORDS = re.compile(r"\b(arcade|runner|meteor|blaster|nexus|video ?games?|solo game)\b", re.I)


def run(fn, *args):
    return asyncio.to_thread(fn, *args)


async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


def menu() -> ChatMessage:
    root = _section(
        {"type": "heading", "value": "Sprout Arcade", "level": 2},
        {"type": "text", "style": "body",
         "value": "I turn what you're weakest on into a game: a live room for a study group, or a solo arcade run. "
                  "Everything you answer feeds your Sprout mastery."},
        _row(_button("Live game with friends", "game", True), _button("Arcade game", "arcade")),
    )
    return _card("Want a quick game on the topics you need most?", root)


async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    if not enabled():
        await ctx.send(sender, text_message("The arcade isn't connected to Sprout's database yet (SPACETIMEDB_TOKEN)."))
        return
    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    started = any(isinstance(c, StartSessionContent) for c in msg.content)
    sel = {} if started else parse_selection(text)
    action = sel.get("action") or ("menu" if started or not text else "arcade" if ARCADE_WORDS.search(text) else "game")
    if action == "arcade" and not sel.get("template"):
        # "play meteor blaster" / "quiz runner": honor a game named in the message.
        named = "meteor" if re.search(r"\b(meteor|blaster)\b", text, re.I) else "runner" if re.search(r"\brunner\b", text, re.I) else ""
        sel = {**sel, "template": named}
    try:
        await handle(ctx, sender, action, sel)
    except DbError as err:
        ctx.logger.error(f"database: {err}")
        await ctx.send(sender, text_message("I couldn't reach Sprout's database just now. Try again in a moment."))
    except Exception as err:  # the model or a network call failed; say so plainly
        ctx.logger.error(f"arcade error: {err}")
        await ctx.send(sender, text_message("I couldn't build that game just now. Ask again in a moment."))


async def handle(ctx: Context, sender: str, action: str, sel: dict):
    if action == "menu":
        await ctx.send(sender, menu())
        return
    c = await run(current_course, sender, sel.get("course_id"))
    if c is None:
        await ctx.send(sender, text_message(
            f"You don't have a course yet, so there's nothing to play on. Paste your syllabus to Sprout Curriculum "
            f"({CURRICULUM_HANDLE}) first."))
    elif action == "game_results":
        code = str(sel.get("code") or "")
        await show_results(ctx, sender, c, code) if code else await ctx.send(sender, menu())
    elif action == "arcade":
        await start_game(ctx, sender, c, arcade=sel.get("template") if sel.get("template") in ARCADE else "")
    else:
        await start_game(ctx, sender, c)


async def start_game(ctx: Context, sender: str, c: dict, arcade=None):
    """Writes a quick quiz on the concepts that need work and opens it as a live game, or as an
    arcade game when `arcade` is a template name ("" picks the one not played last)."""
    snap = await run(snapshot, sender, c["id"])
    picks = pick_concepts(snap["concepts"])
    if not picks:
        await ctx.send(sender, text_message("This course has no concepts yet, so there's nothing to play."))
        return
    # One model call per concept, all at once: about as long as writing a single lesson.
    batches = await asyncio.gather(*(run(game_questions, c["name"], p, n)
                                     for p, n in zip(picks, split(GAME_QUESTIONS, len(picks)))),
                                   return_exceptions=True)
    for b in batches:
        if isinstance(b, Exception):
            ctx.logger.warning(f"game questions: {b}")
    questions = interleave([b for b in batches if isinstance(b, list)])
    if len(questions) < 3:
        raise ValueError(f"only {len(questions)} usable game questions")
    topics = [p["name"] for p in picks if any(q["concept_id"] == p["id"] for q in questions)]
    title = f"{c['name']} review"
    if arcade is None:
        game = await run(create_game, sender, c["id"], title, questions)
        await ctx.send(sender, game_card(c["name"], game, len(questions), SECONDS_PER_QUESTION, topics))
    else:
        last = ctx.storage.get(f"arcade:{sender}") or {}
        template = arcade or next(t for t in ARCADE if t != last.get("template"))
        game = await run(create_game, sender, c["id"], title, questions, "arcade", template)
        game["arcade"] = ARCADE[template]
        other = next((t, n) for t, n in ARCADE.items() if t != template)
        ctx.storage.set(f"arcade:{sender}", {"template": template})
        await ctx.send(sender, arcade_card(c["name"], game, len(questions), topics, other))
    ctx.logger.info(f"game {game['code']} ({game['mode']}): {len(questions)} questions on {len(topics)} concepts")


async def show_results(ctx: Context, sender: str, c: dict, code: str):
    res = await run(results, sender, code)
    if res is None:
        await ctx.send(sender, text_message("That game has been cleared. Ask for a new one any time."))
        return
    await ctx.send(sender, results_card(c["name"], res))
