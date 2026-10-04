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
GARDEN_WORDS = re.compile(r"\b(gardens?|all my (courses|classes)|every course|which (course|class)|weakest|"
                          r"strongest|most behind|how am i doing|how('?s| is) my|compare|across|biggest gap)\b", re.I)
GAME_WORDS = re.compile(r"\b(games?|kahoot|gimkit|blooket|quiz (my|with) friends|play with|arcade|nexus|runner|meteor|blaster|video ?games?)\b", re.I)
# Plain chatter that says nothing about a subject. (curriculum/skill.py has the same list for the standalone agent.)
SMALLTALK = re.compile(r"^\W*(hi+|hello|hey|yo|sup|start|menu|help|thanks?( you)?|ok(ay)?|cool|test|"
                       r"what can you do|who are you|how does this work)\W*$", re.I)
# "I want to learn X", "I'm taking X": a new subject, even mid-course. "Teach me X" or "prepare for X" aren't
# here because they usually mean the course the student already has.
NEW_SUBJECT = re.compile(r"\b(i (want|need|'?d like|wanna) to (learn|study|master)|help me (learn|study)|"
                         r"i'?m (studying|learning|taking))\s+(?!(this|that|it|more|next|the next|again|for)\b)\S", re.I)
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


def looks_like_topic_list(text: str) -> bool:
    """Three or more short items, one per line or comma-separated: "Row operations, REF & RREF, Determinants"."""
    items = [t.strip(" -*.)\t") for t in re.split(r"[\n,;•]", text) if t.strip(" -*.)\t")]
    return (len(items) >= 3 and all(len(t) <= 60 for t in items) and not card_action(text)
            and not (STUDY_WORDS.search(text) or GAME_WORDS.search(text) or FORGET_WORDS.search(text)))


def looks_like_syllabus(text: str) -> bool:
    return (len(text) >= 200 or (len(text) >= 80 and len(SYLLABUS_HINTS.findall(text)) >= 2)
            or looks_like_topic_list(text))


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
    if has_course and GARDEN_WORDS.search(text) and not looks_like_syllabus(text):
        return Route(TUTOR, text=text, why="gardens and cross-course questions")
    if looks_like_syllabus(text) or COURSE_WORDS.search(text):
        return Route(CURRICULUM, text=text if looks_like_syllabus(text) else "", start=not looks_like_syllabus(text),
                     why="course setup")
    if NEW_SUBJECT.search(text) and len(text) <= 300:
        return Route(CURRICULUM, text=text, why="new subject")
    if not has_course:
        # Anything that names a subject becomes a course; the curriculum agent fills in the rest.
        if text and not SMALLTALK.match(text) and len(text) <= 300:
            return Route(CURRICULUM, text=text, why="topic, no course yet")
        return Route(CURRICULUM, start=True, why="no course yet")
    if GAME_WORDS.search(text):
        return Route(TUTOR, text=text, why="live game")

    if new_chat or not text or STUDY_WORDS.search(text):
        return Route(TUTOR, start=True, why="studying")
    return Route(TUTOR, start=True, why="default to studying")
