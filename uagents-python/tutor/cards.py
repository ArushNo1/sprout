"""ASI:One cards for the tutor. Card images come from the sprout-cards Vercel project.

A tapped button comes back as text JSON {"selection": {<inputs>, "action": ...}, "approved": true}.
Text-only replies end the chat session, or ASI:One doesn't show them.
"""

import json
import os
from datetime import datetime, timezone
from urllib.parse import quote, urlencode
from uuid import uuid4

from uagents_core.contrib.protocols.chat import ChatMessage, EndSessionContent, MetadataContent, TextContent

CARDS_URL = os.getenv("SPROUT_CARDS_URL", "https://sprout-cards-six.vercel.app")
# The Next.js site in web/: garden at /<learner>/garden, games at /play, /host, /arcade.
WEB_URL = os.getenv("SPROUT_WEB_URL") or os.getenv("SPROUT_GARDEN_URL", "https://sprout-garden-seven.vercel.app")
CARD_WIDTH = "560"
MAX_ROWS = 8
FORMAT_LABELS = {"worked_example": "Worked example", "flashcards": "Flashcards",
                 "diagram": "Diagram", "analogy": "Analogy"}
KIND_LABELS = {"diagnostic": "Diagnostic", "check": "Check", "review": "Review"}


def text_message(text: str) -> ChatMessage:
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(),
                       content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")])


def _card(text: str, root: dict) -> ChatMessage:
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=[
        TextContent(type="text", text=text),
        MetadataContent(type="metadata", metadata={
            "card_protocol_version": "1",
            "requires_card_interaction": "true",
            "card_kind": "custom",
            "card_payload": json.dumps({"root": root}),
            "preferred_drawer_width_px": CARD_WIDTH,
        }),
    ])


def parse_selection(text: str) -> dict:
    """Card replies are JSON text, sometimes after an @mention. Returns {} for plain chat."""
    text = (text or "").strip()
    if text.startswith("@"):
        text = text.split(None, 1)[1] if " " in text else ""
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    selection = data.get("selection", data)
    return selection if isinstance(selection, dict) and selection.get("action") else {}


def _button(label: str, action: str, primary: bool = False, **extra) -> dict:
    return {"type": "button", "label": label, "primary": primary, "action": {"selection": {"action": action, **extra}}}


def _row(*buttons) -> dict:
    return {"type": "group", "direction": "row", "gap": 8, "children": [b for b in buttons if b]}


def _section(*children) -> dict:
    return {"type": "section", "children": [c for c in children if c]}


def tested(c: dict) -> bool:
    return c["p"] is not None and c["attempts"] > 0


def snapshot_rows(concepts: list) -> list:
    """Tested concepts first, weakest first, so the card shows what needs work; then untested ones."""
    return sorted(concepts, key=lambda c: (not tested(c), c["p"] if tested(c) else 0, c["name"]))[:MAX_ROWS]


def snapshot_row(c: dict) -> str:
    """label~bar~tail. Untested concepts get an empty bar and a dash, not BKT's prior."""
    if not tested(c):
        return f"{c['name']}~0~–"
    return f"{c['name']}~{c['p']:.2f}~{round(c['p'] * 100)}%"


def snapshot_image(course_name: str, snap: dict, exam_days) -> tuple:
    rows = snapshot_rows(snap["concepts"])
    bits = []
    if exam_days is not None:
        bits.append("exam today" if exam_days == 0 else f"exam in {exam_days} day{'s' if exam_days != 1 else ''}")
    n = len(snap["concepts"])
    done = sum(tested(c) for c in snap["concepts"])
    bits.append(f"{done} of {n} concepts tested" if done else f"{n} concepts, none tested yet")
    if snap["due"]:
        bits.append(f"{snap['due']} due for review")
    params = [("title", course_name), ("subtitle", " · ".join(bits))]
    params += [("r", snapshot_row(c)) for c in rows]
    height = 40 + 80 + 44 + 34 + len(rows) * 58 + 30  # cardSize() in cards/lib/render.js
    return f"{CARDS_URL}/api/card?{urlencode(params, quote_via=quote)}", f"1080:{height}"


def garden_link(address: str, course_id: int) -> str:
    """The live knowledge garden (web/) for this student and course."""
    return f"{WEB_URL.rstrip('/')}/{quote(address, safe='')}/garden?{urlencode({'course': course_id})}"


def home_card(course_name: str, snap: dict, exam_days, insight=None, opener: str = "", garden: str = "") -> ChatMessage:
    src, ratio = snapshot_image(course_name, snap, exam_days)
    root = _section(
        {"type": "image", "src": src, "alt": f"{course_name} progress", "aspect_ratio": ratio},
        {"type": "text", "style": "muted", "value": f"Last time: {snap['recap']}"} if snap["recap"] else None,
        {"type": "text", "style": "muted", "value": insight} if insight else None,
        _row(_button("Learn next", "teach", True),
             _button("Diagnostic quiz", "diagnostic", True) if snap["untested"] else None),
        _row(_button("See my journey", "journey"),
             _button(f"Review ({snap['due']} due)", "review") if snap["due"] else None),
        _row(_button("Live game with friends", "game"), _button("Arcade game", "arcade")),
        _row(_button("Done for today", "done")),
    )
    text = opener or f"Here's where you are in {course_name}."
    return _card(f"{text} [Open your garden]({garden})" if garden else text, root)


def journey_image(course_name: str, path: dict) -> tuple:
    """The /api/journey picture for journey(): rows of boxes and the arrows between them."""
    params = [("title", course_name), ("subtitle", "your learning journey")]
    params += [("n", f"{n['row']}~{n['state']}~{n['label']}") for n in path["nodes"]]
    params += [("e", f"{a}-{b}") for a, b in path["edges"]]
    rows = len({n["row"] for n in path["nodes"]})
    height = 40 + 80 + 44 + 44 + rows * 80 + (rows - 1) * 110 + 44  # journeyLayout() in cards/lib/render.js
    return f"{CARDS_URL}/api/journey?{urlencode(params, quote_via=quote)}", f"1080:{height}"


def journey_card(course_name: str, path: dict) -> ChatMessage:
    """The map around where the student is, with a button for each topic they can take on next."""
    src, ratio = journey_image(course_name, path)
    cid, name = path["current"]
    picks = [_button(clip_label(n), "teach", False, concept_id=c) for c, n in path["choices"][:4]]
    root = _section(
        {"type": "image", "src": src, "alt": f"{course_name} learning journey", "aspect_ratio": ratio},
        _row(_button(f"Keep going: {clip_label(name)}", "teach", True, concept_id=cid)),
        *[_row(*picks[i:i + 2]) for i in range(0, len(picks), 2)],
        _row(_button("Back to overview", "home")),
    )
    return _card(f"Here's your path through {course_name}. Pick what to learn next.", root)


def clip_label(text: str, n: int = 30) -> str:
    return text if len(text) <= n else text[:n - 1].rstrip() + "…"


def summary_card(course_name: str, summary: str, answered: int, right: int, known: int, cards: int,
                 moved: list, next_review) -> ChatMessage:
    """End of a session: score, what moved, and when to come back."""
    badges = []
    if answered:
        badges.append({"type": "badge", "label": f"{right} of {answered} questions right",
                       "variant": "success" if right * 2 >= answered else "warning"})
    if cards:
        badges.append({"type": "badge", "label": f"Knew {known} of {cards} flashcards", "variant": "info"})
    when = None
    if next_review:
        day, name = next_review
        when = f"Next review: {day.strftime('%A, %b')} {day.day} ({name})"
    root = _section(
        {"type": "heading", "value": "Session complete", "level": 2},
        {"type": "group", "direction": "row", "gap": 8, "children": badges} if badges else None,
        {"type": "heading", "value": "What moved", "level": 3} if moved else None,
        {"type": "group", "direction": "column", "gap": 6, "children": [
            {"type": "text", "style": "body", "value": f"{m['name']}: {m['from']:.0%} → {m['to']:.0%}"} for m in moved[:6]]}
        if moved else None,
        {"type": "text", "style": "muted", "value": when} if when else None,
        _row(_button("Keep studying", "home")),
    )
    return _card(f"Nice work in {course_name}. {summary} Next time we'll pick up right here.", root)


def mastered_card(course_name: str, concepts: int) -> ChatMessage:
    root = _section(
        {"type": "heading", "value": f"You've mastered {course_name}", "level": 2},
        {"type": "badge", "label": f"{concepts} of {concepts} concepts", "variant": "success"},
        {"type": "text", "style": "muted", "value": "Every concept is above 95%. Reviews keep it that way until your exam."},
        _row(_button("Review anyway", "review", True), _button("Add another course", "new_course")),
    )
    return _card(f"You've mastered every concept in {course_name}.", root)


def forget_card(course_name: str, course_id: int) -> ChatMessage:
    root = _section(
        {"type": "heading", "value": f"Forget {course_name}?", "level": 2},
        {"type": "text", "style": "body",
         "value": "This deletes the course, your mastery and your study history from Sprout. It can't be undone."},
        _row(_button("Forget it", "forget_confirm", True, course_id=course_id), _button("Keep it", "home")),
    )
    return _card(f"Forget {course_name}?", root)


def game_image(course_name: str, game: dict, questions: int, seconds: int, topics: list) -> tuple:
    """The /api/game invite: the join code as big tiles, where to join, and the topics."""
    params = [("course", course_name), ("code", game["code"]), ("join", game["join_display"]),
              ("q", questions), ("s", seconds)] + [("t", t) for t in topics[:4]]
    if game.get("arcade"):
        params.append(("arcade", game["arcade"]))
    return f"{CARDS_URL}/api/game?{urlencode(params, quote_via=quote)}", "1080:700"  # GAME_SIZE in cards/lib/render.js


def game_card(course_name: str, game: dict, questions: int, seconds: int, topics: list) -> ChatMessage:
    """A live game is ready: the invite image, plus links to host it and to play as yourself."""
    src, ratio = game_image(course_name, game, questions, seconds, topics)
    root = _section(
        {"type": "image", "src": src, "alt": f"Game code {game['code']}", "aspect_ratio": ratio},
        {"type": "text", "style": "muted",
         "value": "Open the host screen from the links above, then tap Results here when the game ends."},
        _row(_button("Results", "game_results", True, code=game["code"]), _button("Make another game", "game")),
        _row(_button("Back to my course", "home")),
    )
    text = (f"Your {course_name} game is ready. Code **{game['code']}**.\n\n"
            f"[Open the host screen]({game['host']}) on a laptop or TV and press Start when everyone's in. "
            f"[Play as you]({game['self']}) on your phone so your answers grow your garden.")
    return _card(text, root)


def arcade_card(course_name: str, game: dict, questions: int, topics: list, other: tuple) -> ChatMessage:
    """An arcade game is ready: the invite image, your link (answers count), and the link to share."""
    src, ratio = game_image(course_name, game, questions, 0, topics)
    other_key, other_name = other
    root = _section(
        {"type": "image", "src": src, "alt": f"{game['arcade']}, code {game['code']}", "aspect_ratio": ratio},
        {"type": "text", "style": "muted",
         "value": "Everyone plays at their own pace. Replay as often as you like: the board keeps your best run."},
        _row(_button("High scores", "game_results", True, code=game["code"]),
             _button(f"Try {other_name}", "arcade", template=other_key)),
        _row(_button("Live game with friends", "game"), _button("Back to my course", "home")),
    )
    text = (f"Your {course_name} arcade game is ready: **{game['arcade']}**, code **{game['code']}**.\n\n"
            f"[Play it]({game['self']}) (your answers grow your garden). "
            f"Friends play at [{game['join_display']}]({game['join']}) and land on the same high-score board.")
    return _card(text, root)


def podium_image(course_name: str, res: dict) -> tuple:
    """The /api/podium standings: the top three on a podium, then up to three more rows."""
    top = res["players"][:6]
    title = "High scores" if res.get("mode") == "arcade" else "Final results" if res["status"] == "finished" else "Standings so far"
    params = [("title", title),
              ("subtitle", f"{course_name} · {res['questions']} questions")]
    params += [("p", f"{p['rank']}~{p['score']}~{p['name']}") for p in top]
    me = next((i for i, p in enumerate(top) if res["me"] and p["id"] == res["me"]["id"]), None)
    if me is not None:
        params.append(("me", me))
    extra = max(0, len(top) - 3)
    height = 40 + 80 + 44 + 420 + (20 + extra * 58 if extra else 0) + 40  # podiumSize() in cards/lib/render.js
    return f"{CARDS_URL}/api/podium?{urlencode(params, quote_via=quote)}", f"1080:{height}"


def results_card(course_name: str, res: dict) -> ChatMessage:
    """After a game: the podium, how this student did, what moved, and the concept the group found hardest."""
    if not res["players"]:
        return _card("Nobody joined that game, so there are no results.",
                     _section(_row(_button("Make another game", "game", True), _button("Back to my course", "home"))))
    src, ratio = podium_image(course_name, res)
    me, hardest = res["me"], (res["concepts"][0] if res["concepts"] else None)
    badges = []
    if me:
        badges.append({"type": "badge", "label": f"You came {ordinal(me['rank'])} of {len(res['players'])}", "variant": "info"})
        badges.append({"type": "badge", "label": f"{me['correct_count']} of {res['questions']} right",
                       "variant": "success" if me["correct_count"] * 2 >= res["questions"] else "warning"})
    moved = [m for m in res["moved"] if m.get("to") is not None]
    root = _section(
        {"type": "image", "src": src, "alt": "Game standings", "aspect_ratio": ratio},
        {"type": "group", "direction": "row", "gap": 8, "children": badges} if badges else None,
        {"type": "heading", "value": "What moved", "level": 3} if moved else None,
        {"type": "group", "direction": "column", "gap": 6, "children": [
            {"type": "text", "style": "body", "value": f"{m['name']}: {m['from']:.0%} → {m['to']:.0%}"} for m in moved[:6]]}
        if moved else None,
        {"type": "text", "style": "muted",
         "value": f"Hardest for the group: {hardest['name']} ({hardest['share']:.0%} of answers right)"} if hardest else None,
        _row(_button(f"Review {clip_label(hardest['name'], 22)}", "teach", True, concept_id=hardest["id"]) if hardest else None,
             _button("Play again", "arcade", template=res["template"]) if res.get("mode") == "arcade" and res.get("template")
             else _button("Play again", "game")),
        _row(_button("Refresh", "game_results", code=res["code"]) if res["status"] != "finished" else None,
             _button("Back to my course", "home")),
    )
    if res.get("mode") == "arcade" and me:
        text = f"You're {ordinal(me['rank'])} on the board with {me['score']:,} points."
    elif res.get("mode") == "arcade":
        text = f"{res['players'][0]['name']} leads with {res['players'][0]['score']:,} points."
    elif res["status"] != "finished":
        text = "The game is still going. Here are the standings so far."
    elif me:
        text = f"Game over. You came {ordinal(me['rank'])} with {me['score']:,} points."
    else:
        text = f"Game over. {res['players'][0]['name']} won with {res['players'][0]['score']:,} points."
    return _card(text, root)


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def course_picker_card(courses: list) -> ChatMessage:
    root = _section(
        {"type": "heading", "value": "Which course?", "level": 2},
        {"type": "input", "name": "course_id", "kind": "select", "label": "Course", "required": True,
         "options": [{"value": str(c["id"]), "label": c["name"]} for c in courses]},
        _row(_button("Open", "open", True)),
    )
    return _card("Pick a course to study.", root)


def question_card(concept_name: str, kind: str, q: dict, number: int, total: int) -> ChatMessage:
    label = KIND_LABELS.get(kind, "Question") + (f" {number} of {total}" if total > 1 else "")
    root = _section(
        {"type": "heading", "value": concept_name, "level": 2},
        {"type": "badge", "label": label, "variant": "info"},
        {"type": "text", "style": "body", "value": q["question"]},
        {"type": "group", "direction": "column", "gap": 8,
         "children": [_button(choice, "answer", False, choice=i) for i, choice in enumerate(q["choices"])]},
    )
    return _card(q["question"], root)


def lesson_card(concept_name: str, fmt: str, lesson: dict) -> ChatMessage:
    """The lesson itself goes in the chat as Markdown; the card recaps it and holds the next steps."""
    takeaways, n = lesson.get("takeaways") or [], len(lesson.get("deck") or [])
    practice = _button(f"Practice {n} flashcards", "flash", True) if n else None
    root = _section(
        {"type": "heading", "value": concept_name, "level": 2},
        {"type": "group", "direction": "row", "gap": 8, "children": [
            {"type": "badge", "label": FORMAT_LABELS.get(fmt, "Lesson"), "variant": "info"},
            {"type": "badge", "label": f"~{lesson.get('minutes', 3)} min read", "variant": "success"}]},
        {"type": "heading", "value": "Key takeaways", "level": 3} if takeaways else None,
        {"type": "group", "direction": "column", "gap": 6,
         "children": [{"type": "text", "style": "body", "value": f"• {t}"} for t in takeaways]} if takeaways else None,
        _row(practice, _button("Check my understanding", "check", not practice)),
        _row(_button("Explain it another way", "reteach"), _button("Back to overview", "home")),
    )
    return _card(lesson["markdown"], root)


def flashcard_front(concept_name: str, card: dict, i: int, n: int, note: str = "") -> ChatMessage:
    """One card, question side up. Answer it in your head, then flip."""
    root = _section(
        {"type": "heading", "value": concept_name, "level": 2},
        {"type": "badge", "label": f"Flashcard {i + 1} of {n}", "variant": "info"},
        {"type": "text", "style": "muted", "value": note} if note else None,
        {"type": "text", "style": "emphasis", "value": card["front"]},
        _row(_button("Show answer", "flip", True, i=i), _button("Skip", "mark", i=i, knew="skip")),
    )
    return _card(f"Flashcard {i + 1} of {n}", root)


def flashcard_back(concept_name: str, card: dict, i: int, n: int) -> ChatMessage:
    """The same card flipped: was the answer you had in mind right?"""
    root = _section(
        {"type": "heading", "value": concept_name, "level": 2},
        {"type": "badge", "label": f"Flashcard {i + 1} of {n}", "variant": "info"},
        {"type": "text", "style": "muted", "value": card["front"]},
        {"type": "divider"},
        {"type": "text", "style": "body", "value": card["back"]},
        _row(_button("Knew it", "mark", True, i=i, knew="yes"), _button("Didn't know", "mark", i=i, knew="no")),
    )
    return _card("Did you know it?", root)


def flashcard_summary(concept_name: str, known: int, n: int, missed: int, before, after) -> ChatMessage:
    root = _section(
        {"type": "heading", "value": concept_name, "level": 2},
        {"type": "badge", "label": f"Knew {known} of {n}", "variant": "success" if known * 2 >= n else "warning"},
        {"type": "text", "style": "muted", "value": f"Mastery {before:.0%} → {after:.0%}"} if before is not None else None,
        _row(_button("Check my understanding", "check", True),
             _button(f"Go over the {missed} I missed", "flash_misses") if missed else None),
        _row(_button("Back to overview", "home")),
    )
    return _card(f"Done: you knew {known} of {n} flashcards.", root)


def feedback_card(q: dict, choice: int, before: float, after: float, concept_name: str,
                  next_label: str, next_action: str) -> ChatMessage:
    correct = choice == q["correct_index"]
    root = _section(
        {"type": "heading", "value": "Correct" if correct else "Not quite", "level": 2},
        {"type": "badge", "label": f"{concept_name}: {before:.0%} → {after:.0%}", "variant": "success" if after >= before else "warning"},
        {"type": "text", "style": "body", "value": f"Answer: {q['choices'][q['correct_index']]}"},
        {"type": "text", "style": "muted", "value": q["explanation"]} if q.get("explanation") else None,
        _row(_button(next_label, next_action, True), _button("Back to overview", "home")),
    )
    return _card("Correct!" if correct else f"Not quite. The answer is {q['choices'][q['correct_index']]}.", root)
