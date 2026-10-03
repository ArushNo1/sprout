"""The tutor's reads and writes against Sprout's SpacetimeDB database.

The database does the learning science (BKT, SM-2 reviews, the format bandit,
next-concept choice); this module only calls it. All functions block, so the
agent runs them with asyncio.to_thread.
"""

import time
from datetime import date, datetime, timezone

from sprout_db import NONE, call, opt, some, sql, sql_str

FORMATS = ["worked_example", "flashcards", "diagram", "analogy"]
PREREQ_SOLID = 0.7   # same cut-offs as spacetimedb/src/algorithms.ts
MASTERED = 0.95


def micros(ts) -> int:
    """SQL returns timestamps as [micros] (or None)."""
    if ts is None:
        return 0
    return ts[0] if isinstance(ts, list) else int(ts)


def days_until(ts, now=None):
    """Calendar days from today to the exam date (stored as UTC midnight)."""
    if ts is None:
        return None
    exam = datetime.fromtimestamp(micros(ts) / 1_000_000, timezone.utc).date()
    today = datetime.fromtimestamp(now, timezone.utc).date() if now else date.today()
    return max(0, (exam - today).days)


def active_courses(address: str) -> list:
    rows = sql(f"SELECT id, name, exam_date, created_at FROM course "
               f"WHERE user_address = {sql_str(address)} AND status = 'active'")
    return sorted(rows, key=lambda r: micros(r["created_at"]), reverse=True)


def course(course_id: int) -> dict:
    return sql(f"SELECT id, name, exam_date FROM course WHERE id = {int(course_id)}")[0]


def snapshot(address: str, course_id: int, now=None) -> dict:
    """Concepts with mastery, what's due, and the last session's recap."""
    now_us = int((now or time.time()) * 1_000_000)
    concepts = sql(f"SELECT id, name, summary FROM concept WHERE course_id = {int(course_id)}")
    rows = {r["concept_id"]: r for r in sql(
        f"SELECT concept_id, p_mastered, attempts, next_review FROM mastery "
        f"WHERE user_address = {sql_str(address)} AND course_id = {int(course_id)}")}
    items = []
    for c in concepts:
        m = rows.get(c["id"], {})
        items.append({
            "id": c["id"], "name": c["name"], "summary": c["summary"],
            "p": m.get("p_mastered", 0.2), "attempts": m.get("attempts", 0),
            "due": bool(m.get("next_review")) and micros(m.get("next_review")) <= now_us,
        })
    ended = [s for s in sql(f"SELECT started_at, ended_at, summary FROM session WHERE user_address = {sql_str(address)}")
             if s.get("ended_at") and s.get("summary")]
    recap = max(ended, key=lambda s: micros(s["started_at"]))["summary"] if ended else ""
    return {"concepts": items, "due": sum(i["due"] for i in items),
            "untested": sum(i["attempts"] == 0 for i in items), "recap": recap}


def start_session(address: str, course_id: int) -> int:
    call("upsert_learner", address, NONE)
    call("start_session", address, some(int(course_id)))
    open_sessions = [s for s in sql(f"SELECT id, started_at, ended_at FROM session WHERE user_address = {sql_str(address)}")
                     if not s.get("ended_at")]
    return max(open_sessions, key=lambda s: micros(s["started_at"]))["id"]


def end_session(address: str, session_id: int, summary: str, last_concept_id=None):
    call("end_session", address, int(session_id), summary, opt(last_concept_id))


def next_step(address: str, course_id: int, mode: str) -> dict:
    """Asks the database for the next concept. mode: teach | review | diagnostic."""
    call("compute_next_step", address, int(course_id), mode)
    row = sql(f"SELECT concept_id, format, mode, reason FROM next_step "
              f"WHERE key = {sql_str(f'{address}:{int(course_id)}')}")[0]
    return {"concept_id": row["concept_id"], "format": row["format"], "mode": row["mode"], "reason": row["reason"]}


def concept(concept_id: int) -> dict:
    return sql(f"SELECT id, name, summary FROM concept WHERE id = {int(concept_id)}")[0]


def record(address: str, concept_id: int, correct: bool, kind: str, fmt, session_id, question: str) -> tuple:
    """Saves one answer and returns (mastery before, mastery after)."""
    key = sql_str(f"{address}:{int(concept_id)}")
    before = (sql(f"SELECT p_mastered FROM mastery WHERE key = {key}") or [{"p_mastered": 0.2}])[0]["p_mastered"]
    call("record_attempt", address, int(concept_id), bool(correct), kind,
         opt(fmt if fmt in FORMATS else None), opt(session_id), opt(question[:500]))
    after = sql(f"SELECT p_mastered FROM mastery WHERE key = {key}")[0]["p_mastered"]
    return before, after


def format_stats(address: str) -> list:
    return sql(f"SELECT format, alpha, beta, uses FROM format_weight WHERE user_address = {sql_str(address)}")


def format_insight(stats: list, min_uses: int = 3):
    """One plain line comparing the best and worst formats once there's evidence, else None."""
    used = [s for s in stats if s["uses"] >= min_uses]
    if len(used) < 2:
        return None
    rate = lambda s: s["alpha"] / (s["alpha"] + s["beta"])
    best, worst = max(used, key=rate), min(used, key=rate)
    if rate(best) - rate(worst) < 0.1:
        return None
    label = {"worked_example": "worked examples", "flashcards": "flashcards",
             "diagram": "diagrams", "analogy": "analogies"}.get
    return (f"{label(best['format'], best['format']).capitalize()} have worked better for you than {label(worst['format'], worst['format'])}: "
            f"{rate(best):.0%} vs {rate(worst):.0%} of check questions right, so I'll lean on them.")
