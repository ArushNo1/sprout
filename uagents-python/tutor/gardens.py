"""All of a student's gardens at once, and the read-only tools the ASI:One model uses to answer
questions about them ("which course is my weakest?", "what's due this week?").

The student's address is never a tool argument: `run_tool` always uses the address of the person
chatting, so the model can only ever read that student's own data, and nothing here writes.
"""

import json
import os
import re
import time

import requests

from sprout_db import sql, sql_str
from .cards import garden_link
from .content import ASI_URL, plain_math, post_with_retry
from .learning import MASTERED, PREREQ_SOLID, active_courses, days_until, micros

TOOL_MODEL = os.getenv("ASI_ONE_TOOL_MODEL", "asi1")
MAX_ROUNDS = 4


def gardens(address: str, now=None) -> list:
    """One summary per active course, soonest exam first (courses without an exam last)."""
    now_us = int((now or time.time()) * 1_000_000)
    courses = active_courses(address)
    mastery = sql(f"SELECT course_id, concept_id, p_mastered, attempts, next_review FROM mastery "
                  f"WHERE user_address = {sql_str(address)}")
    out = []
    for c in courses:
        concepts = sql(f"SELECT id, name FROM concept WHERE course_id = {int(c['id'])}")
        rows = {m["concept_id"]: m for m in mastery if m["course_id"] == c["id"]}
        items = []
        for k in concepts:
            m = rows.get(k["id"], {})
            tested = m.get("attempts", 0) > 0
            items.append({"name": k["name"], "p": m.get("p_mastered") if tested else None,
                          "due": tested and bool(m.get("next_review")) and micros(m["next_review"]) <= now_us})
        tested = [i for i in items if i["p"] is not None]
        out.append({
            "course_id": c["id"], "name": c["name"], "exam_in_days": days_until(c.get("exam_date"), now),
            "concepts": len(items), "tested": len(tested),
            "solid": sum(i["p"] >= PREREQ_SOLID for i in tested),
            "mastered": sum(i["p"] >= MASTERED for i in tested),
            "due": sum(i["due"] for i in items), "items": items,
        })
    return sorted(out, key=lambda g: (g["exam_in_days"] is None, g["exam_in_days"] or 0))


def pct(p) -> str:
    return "not tested" if p is None else f"{round(p * 100)}%"


def find_course(all_gardens: list, ref) -> dict | None:
    """A course by id or by (part of) its name."""
    if ref in (None, ""):
        return all_gardens[0] if len(all_gardens) == 1 else None
    for g in all_gardens:
        if str(ref) == str(g["course_id"]):
            return g
    hits = [g for g in all_gardens if str(ref).lower() in g["name"].lower()]
    return hits[0] if len(hits) == 1 else None


# ---- tools ----

TOOLS = [
    {"type": "function", "function": {
        "name": "list_courses",
        "description": "All of the student's courses with exam countdown and progress counts: concepts, tested, solid "
                       "(70%+), and due for review. Call this first for any question about their courses or gardens.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "course_progress",
        "description": "Concept-by-concept mastery for one course, weakest first (up to 12), with which are due for review.",
        "parameters": {"type": "object", "properties": {
            "course": {"type": "string", "description": "Course id or part of its name"}}, "required": ["course"]}}},
    {"type": "function", "function": {
        "name": "due_reviews",
        "description": "Concepts due for review right now. Omit course to list across every course.",
        "parameters": {"type": "object", "properties": {
            "course": {"type": "string", "description": "Optional course id or part of its name"}}, "required": []}}},
]


def run_tool(address: str, name: str, args: dict, all_gardens: list | None = None) -> dict:
    """Runs one tool for this student. Returns plain data, or {"error": ...} the model can relay."""
    gs = all_gardens if all_gardens is not None else gardens(address)
    link = lambda g: garden_link(address, g["course_id"])
    if name == "list_courses":
        return {"courses": [{k: g[k] for k in ("course_id", "name", "exam_in_days", "concepts", "tested", "solid", "due")}
                            | {"garden_url": link(g)} for g in gs]}
    if name in ("course_progress", "due_reviews"):
        ref = (args or {}).get("course")
        g = find_course(gs, ref)
        if name == "due_reviews" and ref in (None, ""):
            return {"due": [{"course": x["name"], "concept": i["name"], "mastery": pct(i["p"])}
                            for x in gs for i in x["items"] if i["due"]]}
        if not g:
            return {"error": f"No single course matches '{ref}'. Courses: {', '.join(x['name'] for x in gs) or 'none'}"}
        if name == "due_reviews":
            return {"course": g["name"], "due": [{"concept": i["name"], "mastery": pct(i["p"])} for i in g["items"] if i["due"]]}
        ranked = sorted(g["items"], key=lambda i: (i["p"] is None, i["p"] if i["p"] is not None else 1))
        # Weakest *tested* first; untested concepts go last, labelled, never given a made-up number.
        ranked = [i for i in ranked if i["p"] is not None] + [i for i in ranked if i["p"] is None]
        return {"course": g["name"], "garden_url": link(g), "tested": g["tested"], "of": g["concepts"],
                "concepts": [{"concept": i["name"], "mastery": pct(i["p"]), "due": i["due"]} for i in ranked[:12]]}
    return {"error": f"Unknown tool {name}"}


SYSTEM = ("You are Sprout, a study partner. Answer the student's question about their courses using ONLY the tools; "
          "never guess numbers. Be brief and specific (a few sentences or a short list). Name courses and concepts exactly "
          "as the tools give them. If you mention a course, link its garden as [Garden](garden_url). If a concept is "
          "'not tested', say so rather than giving a percentage. Write math as plain text, never LaTeX.")


def _chat(messages: list) -> dict:
    resp = post_with_retry(
        ASI_URL, headers={"Authorization": f"Bearer {os.environ['ASI_ONE_API_KEY']}"},
        json={"model": TOOL_MODEL, "temperature": 0.2, "messages": messages, "tools": TOOLS, "tool_choice": "auto"},
        timeout=90)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]


def answer_question(address: str, question: str) -> str:
    """Lets the ASI:One model call the read-only tools above until it can answer."""
    gs = gardens(address)
    if not gs:
        return "You don't have a course yet. Paste your syllabus and I'll build your first garden."
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]
    for _ in range(MAX_ROUNDS):
        reply = _chat(messages)
        calls = reply.get("tool_calls") or []
        if not calls:
            return plain_math((reply.get("content") or "").strip()) or "I couldn't work that out. Try asking another way."
        messages.append({"role": "assistant", "content": reply.get("content") or "", "tool_calls": calls})
        for call in calls:
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
            except ValueError:
                args = {}
            result = run_tool(address, call["function"]["name"], args if isinstance(args, dict) else {}, gs)
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result)})
    return "That took more steps than I expected. Try asking about one course at a time."
