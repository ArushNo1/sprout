"""The tutor's reads and writes against Sprout's SpacetimeDB database.

The database does the learning science (BKT, SM-2 reviews, the format bandit,
next-concept choice); this module only calls it. All functions block, so the
agent runs them with asyncio.to_thread.
"""

import time
from datetime import date, datetime, timezone

from sprout_db import NONE, call, opt, some, sql, sql_str

FORMATS = ["worked_example", "flashcards", "diagram", "analogy"]
PREREQ_SOLID = 0.7   # same cut-offs as spacetimedb/spacetimedb/src/algorithms.ts
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


def current_course(address: str, course_id=None):
    """The course a request is about: the one named (if it's the student's), else the one they last
    studied, else their newest. None when they have no active course. Agents that don't hold the
    tutor's session state (arcade, garden) use this to know which course to work on."""
    mine = active_courses(address)
    named = [c for c in mine if course_id is not None and str(c["id"]) == str(course_id)]
    if named:
        return named[0]
    recent = sql(f"SELECT course_id, started_at FROM session WHERE user_address = {sql_str(address)}")
    for r in sorted((r for r in recent if r["course_id"]), key=lambda r: micros(r["started_at"]), reverse=True):
        hit = [c for c in mine if c["id"] == r["course_id"]]
        if hit:
            return hit[0]
    return mine[0] if mine else None


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
            "p": m.get("p_mastered"), "attempts": m.get("attempts", 0),  # None until the student is tested
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


def upcoming_review(address: str, course_id: int, now=None):
    """(date, concept name) of the student's next scheduled review in this course, or None."""
    now_us = int((now or time.time()) * 1_000_000)
    rows = sql(f"SELECT concept_id, next_review FROM mastery "
               f"WHERE user_address = {sql_str(address)} AND course_id = {int(course_id)}")
    upcoming = [(micros(r["next_review"]), r["concept_id"]) for r in rows if r.get("next_review")]
    upcoming = [u for u in upcoming if u[0] > now_us]
    if not upcoming:
        return None
    when, cid = min(upcoming)
    return datetime.fromtimestamp(when / 1_000_000, timezone.utc).date(), concept(cid)["name"]


def forget_course(address: str, course_id: int):
    """Deletes the course and everything tied to it (mastery, attempts, sessions)."""
    call("forget_course", address, int(course_id))


def end_session(address: str, session_id: int, summary: str, last_concept_id=None):
    call("end_session", address, int(session_id), summary, opt(last_concept_id))


def next_step(address: str, course_id: int, mode: str) -> dict:
    """Asks the database for the next concept. mode: teach | review | diagnostic."""
    call("compute_next_step", address, int(course_id), mode)
    row = sql(f"SELECT concept_id, format, mode, reason FROM next_step "
              f"WHERE key = {sql_str(f'{address}:{int(course_id)}')}")[0]
    return {"concept_id": row["concept_id"], "format": row["format"], "mode": row["mode"], "reason": row["reason"]}


def concept(concept_id: int) -> dict:
    return sql(f"SELECT id, course_id, name, summary FROM concept WHERE id = {int(concept_id)}")[0]


def journey(address: str, course_id: int, current_id=None) -> dict:
    """The neighborhood of the student's path around the concept they're on: its prerequisites,
    the concept itself, what it unlocks, and a teaser for what comes after.

    Only the database decides state: a prerequisite is done when its mastery is at least
    PREREQ_SOLID, the same cut-off compute_next_step uses.
    """
    names = {c["id"]: c["name"] for c in sql(f"SELECT id, name FROM concept WHERE course_id = {int(course_id)}")}
    edges = sql(f"SELECT concept_id, requires_id FROM prerequisite WHERE course_id = {int(course_id)}")
    p = {m["concept_id"]: m["p_mastered"] for m in sql(
        f"SELECT concept_id, p_mastered, attempts FROM mastery "
        f"WHERE user_address = {sql_str(address)} AND course_id = {int(course_id)}") if m["attempts"] > 0}
    requires, unlocks = {}, {}
    for e in edges:
        if e["concept_id"] in names and e["requires_id"] in names:
            requires.setdefault(e["concept_id"], set()).add(e["requires_id"])
            unlocks.setdefault(e["requires_id"], set()).add(e["concept_id"])
    solid = lambda c: p.get(c, 0) >= PREREQ_SOLID
    open_ = [c for c in sorted(names) if p.get(c, 0) < MASTERED and all(solid(r) for r in requires.get(c, ()))]
    current = current_id if current_id in names else (open_[0] if open_ else min(names, default=None))
    if current is None:
        return {"nodes": [], "edges": [], "current": None, "choices": []}

    before = sorted(requires.get(current, ()))[:3]
    after = sorted(unlocks.get(current, ())) or [c for c in open_ if c != current]
    after = after[:3]
    shown = set(before) | {current} | set(after)
    later = sorted({c for a in after for c in unlocks.get(a, ())} - shown)

    nodes, index = [], {}
    def add(cid, row, state, label=None):
        index[cid] = len(nodes)
        nodes.append({"id": cid, "row": row, "state": state, "label": label or names[cid]})
    for c in before:
        add(c, 0, "done" if solid(c) else "next")
    add(current, 1, "current")
    for c in after:
        add(c, 2, "next")
    links = [(index[c], index[current]) for c in before] + [(index[current], index[c]) for c in after]
    if later:
        add("later", 3, "later", names[later[0]] if len(later) == 1 else f"{len(later)} more topics")
        links += [(index[a], index["later"]) for a in after if unlocks.get(a, set()) & set(later)]
    # Anything not yet solid that's on screen can be studied next: the unlocked concepts first,
    # then prerequisites that still need work.
    choices = [(c, names[c]) for c in after] + [(c, names[c]) for c in before if not solid(c)]
    return {"nodes": nodes, "edges": links, "current": (current, names[current]), "choices": choices}


def record(address: str, concept_id: int, correct: bool, kind: str, fmt, session_id, question: str) -> tuple:
    """Saves one answer and returns (mastery before, mastery after)."""
    key = sql_str(f"{address}:{int(concept_id)}")
    row = sql(f"SELECT p_mastered FROM mastery WHERE key = {key}")
    # A first answer starts from the concept's prior, which the database seeds the mastery row with.
    before = row[0]["p_mastered"] if row else sql(f"SELECT p_init FROM concept WHERE id = {int(concept_id)}")[0]["p_init"]
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
