"""Which specialist handles a student's message. Pure, so it can be tested without agents."""

import json
import re
from dataclasses import dataclass

CURRICULUM, TUTOR = "curriculum", "tutor"

COURSE_WORDS = re.compile(r"\b(syllabus|new course|add (a )?course|another course|different course|upload|"
                          r"my class(es)?|course map)\b", re.I)
STUDY_WORDS = re.compile(r"\b(keep going|continue|study|quiz|review|teach|learn|practice|progress|"
                         r"diagnostic|where (was|did) i|pick up|let'?s go|ready)\b", re.I)
FORGET_WORDS = re.compile(r"\b(forget|delete|remove|erase)\b.*\b(course|class|progress|data|history)\b", re.I)
SYLLABUS_HINTS = re.compile(r"\b(week|unit|chapter|lecture|module|midterm|final|exam)\b", re.I)


@dataclass
class Route:
    specialist: str
    text: str = ""
    start: bool = False
    then: str = ""   # a specialist to open right after this one replies
    why: str = ""


def card_action(text: str):
    """The action of a card tap (JSON selection), or None for typed text."""
    body = text.split(None, 1)[1] if text.startswith("@") and " " in text else text
    try:
        data = json.loads(body)
    except (TypeError, ValueError):
        return None
    sel = data.get("selection", data) if isinstance(data, dict) else None
    return sel.get("action") if isinstance(sel, dict) else None


def looks_like_syllabus(text: str) -> bool:
    return len(text) >= 200 or (len(text) >= 80 and len(SYLLABUS_HINTS.findall(text)) >= 2)


def choose_route(text: str, new_chat: bool, cards_from, has_course: bool) -> Route:
    action = card_action(text)
    if action == "new_course":
        return Route(CURRICULUM, start=True, why="card tap 'new_course'")
    if action:
        owner = cards_from or CURRICULUM
        # Confirming a course map hands the student to the tutor to start studying it.
        then = TUTOR if owner == CURRICULUM and action == "confirm_map" else ""
        return Route(owner, text=text, then=then, why=f"card tap '{action}'")
    if FORGET_WORDS.search(text) and not looks_like_syllabus(text):
        return Route(TUTOR, text=text, why="forget a course")
    if looks_like_syllabus(text) or COURSE_WORDS.search(text):
        return Route(CURRICULUM, text=text if looks_like_syllabus(text) else "", start=not looks_like_syllabus(text),
                     why="course setup")
    if not has_course:
        return Route(CURRICULUM, start=True, why="no course yet")
    if new_chat or not text or STUDY_WORDS.search(text):
        return Route(TUTOR, start=True, why="studying")
    return Route(TUTOR, start=True, why="default to studying")
