"""ASI:One cards for the tutor: progress, questions, lessons, flashcards and the session summary.

Card images come from the sprout-cards Vercel project; the shared pieces (buttons, tap parsing,
links) are in cardkit.py. Games, results and the journey map are the arcade and garden agents' cards.
"""

from urllib.parse import quote, urlencode

from uagents_core.contrib.protocols.chat import ChatMessage

from cardkit import CARDS_URL, _button, _card, _row, _section

MAX_ROWS = 8
FORMAT_LABELS = {"worked_example": "Worked example", "flashcards": "Flashcards",
                 "diagram": "Diagram", "analogy": "Analogy"}
KIND_LABELS = {"diagnostic": "Diagnostic", "check": "Check", "review": "Review"}


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


def home_card(course_name: str, snap: dict, exam_days, insight=None, opener: str = "", garden: str = "",
              many_courses: bool = False, course_id=None) -> ChatMessage:
    """The progress card. Game, journey and garden taps go to the arcade and garden agents, so they carry the course."""
    cid = {"course_id": course_id} if course_id is not None else {}
    src, ratio = snapshot_image(course_name, snap, exam_days)
    root = _section(
        {"type": "image", "src": src, "alt": f"{course_name} progress", "aspect_ratio": ratio},
        {"type": "text", "style": "muted", "value": f"Last time: {snap['recap']}"} if snap["recap"] else None,
        {"type": "text", "style": "muted", "value": insight} if insight else None,
        _row(_button("Learn next", "teach", True),
             _button("Diagnostic quiz", "diagnostic", True) if snap["untested"] else None),
        _row(_button("See my journey", "journey", **cid),
             _button(f"Review ({snap['due']} due)", "review") if snap["due"] else None),
        _row(_button("Live game with friends", "game", **cid), _button("Arcade game", "arcade", **cid)),
        _row(_button("Done for today", "done"), _button("All my gardens", "gardens") if many_courses else None),
    )
    text = opener or f"Here's where you are in {course_name}."
    return _card(f"{text} [Open your garden]({garden})" if garden else text, root)


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
