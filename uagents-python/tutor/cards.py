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


def home_card(course_name: str, snap: dict, exam_days, insight=None, opener: str = "") -> ChatMessage:
    src, ratio = snapshot_image(course_name, snap, exam_days)
    root = _section(
        {"type": "image", "src": src, "alt": f"{course_name} progress", "aspect_ratio": ratio},
        {"type": "text", "style": "muted", "value": f"Last time: {snap['recap']}"} if snap["recap"] else None,
        {"type": "text", "style": "muted", "value": insight} if insight else None,
        _row(_button("Learn next", "teach", True),
             _button("Diagnostic quiz", "diagnostic", True) if snap["untested"] else None),
        _row(_button(f"Review ({snap['due']} due)", "review") if snap["due"] else None,
             _button("Done for today", "done")),
    )
    return _card(opener or f"Here's where you are in {course_name}.", root)


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


def lesson_card(concept_name: str, fmt: str, lesson: str) -> ChatMessage:
    root = _section(
        {"type": "heading", "value": concept_name, "level": 2},
        {"type": "badge", "label": FORMAT_LABELS.get(fmt, "Lesson"), "variant": "info"},
        _row(_button("Check my understanding", "check", True), _button("Back to overview", "home")),
    )
    return _card(lesson, root)


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
