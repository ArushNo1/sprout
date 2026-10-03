"""Turns paid order lines into what the student receives.

Digital items are written by the ASI:One model. Practice sets are original
questions in the style of each test; they never claim to be official
College Board or ACT material.
"""

import os
from datetime import date, timedelta

import requests

from catalog import BY_ID

ASI_URL = "https://api.asi1.ai/v1/chat/completions"
MODEL = os.getenv("ASI_ONE_MODEL", "asi1-mini")

WRITER = (
    "You write study material for a student tutoring app. Be accurate, concise and well formatted in "
    "Markdown. Practice questions must be original, written in the style of the named test; never "
    "say they are official or copied from College Board, ACT or any publisher."
)

QUESTION_FORMAT = (
    "Format each question as **N.** on its own line, then choices A) to D) on separate lines. "
    "After all questions add a heading '### Answer key' with one line per question: "
    "'N. Letter: one-sentence explanation'. Write exactly one answer key, after the last question."
)


def call_llm(prompt: str) -> str:
    resp = requests.post(
        ASI_URL,
        headers={"Authorization": f"Bearer {os.environ['ASI_ONE_API_KEY']}"},
        json={"model": MODEL, "temperature": 0.4,
              "messages": [{"role": "system", "content": WRITER}, {"role": "user", "content": prompt}]},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def map_digest(cmap: dict, limit: int = 30) -> str:
    """The parts of a concept map the writer needs, deepest prerequisite chains marked."""
    by_id = {c["id"]: c for c in cmap["concepts"]}
    lines = [f"Course: {cmap['course']['name']}"]
    for cid in cmap["order"][:limit]:
        c = by_id[cid]
        lines.append(f"- {c['name']} (depth {c.get('depth', 0)}): {c.get('summary', '')}")
    return "\n".join(lines)


def _exam_date(line: dict, cmap):
    raw = line["options"].get("exam_date") or ((cmap or {}).get("course") or {}).get("exam_date")
    try:
        return date.fromisoformat(raw)
    except (TypeError, ValueError):
        return None


def prompt_for(line: dict, cmap, today=None) -> str:
    today = today or date.today()
    pid, opts = line["product_id"], line["options"]
    course = opts.get("course") or opts.get("topic") or ((cmap or {}).get("course") or {}).get("name")
    source = map_digest(cmap) if cmap else f"Course or topic: {course or 'general study skills'}"

    if pid == "sat_practice":
        return f"Write 15 original SAT {opts['section']} practice questions at real test difficulty. {QUESTION_FORMAT}"
    if pid == "act_practice":
        return f"Write 15 original ACT {opts['section']} practice questions at real test difficulty. {QUESTION_FORMAT}"
    if pid == "ap_practice":
        return (f"Write 12 original AP {opts['subject']} multiple-choice questions at real exam difficulty, "
                f"covering different units of the course. {QUESTION_FORMAT}")
    if pid == "flashcards":
        return (f"Write 30 flashcards for this material, numbered, each as 'Front: ...' then 'Back: ...' "
                f"on the next line. Favor the ideas that later topics depend on.\n\n{source}")
    exam = _exam_date(line, cmap)
    until = exam or today + timedelta(days=7)
    days = max(1, (until - today).days)
    if pid == "study_plan":
        return (f"Today is {today.isoformat()}. Write a day-by-day study plan for the next {days} days, ending on "
                f"{until.isoformat()}. Teach prerequisites before the topics that need them, leave the last two "
                f"days for review and a timed practice test, and keep each day to 3 short bullet points.\n\n{source}")
    if pid == "exam_pack":
        return (f"Today is {today.isoformat()} and the exam is on {until.isoformat()}. Write an exam pack with:\n"
                f"1. '## Mock exam': 12 questions (8 multiple choice, 4 short answer), weighted toward topics with "
                f"higher depth since they build on earlier ones. {QUESTION_FORMAT} Short-answer keys get 2-3 sentences.\n"
                f"2. '## Drill plan': the 3 topics most likely to be weak, each with one focused practice task.\n"
                f"3. '## Review schedule': one line per day from today to the exam.\n\n{source}")
    raise ValueError(f"No writer for {pid}")


def needs_map(line: dict) -> bool:
    pid, opts = line["product_id"], line["options"]
    return pid in ("exam_pack", "study_plan", "flashcards") and not (opts.get("course") or opts.get("topic"))


def shipping_note(lines: list, shipping) -> str:
    items = ", ".join(f"{BY_ID[l['product_id']]['name']} x{l['qty']}" for l in lines)
    to = f" to {shipping['name']}, {shipping['address']}" if shipping else ""
    return f"Shipping {items}{to}. This is a test-mode order, so nothing will actually ship."
