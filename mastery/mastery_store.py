"""
mastery_store.py — mastery reads and writes against Sprout's SpacetimeDB database.

The database is the single source of truth. Writes go through reducers and
reads through SQL, using the shared client in uagents-python/sprout_db.py
(the same one the orchestrator, curriculum and tutor agents use):

  record_answer  calls the `record_attempt` reducer, which runs the BKT update,
                 reschedules the SM-2 review, updates the format bandit and
                 logs the attempt, then reads the new p_mastered back.
  get_snapshot   reads the `concept` and `mastery` rows for one course.

Tables used (spacetimedb/spacetimedb/src/schema.ts; SQL columns are snake_case):

  concept  (id, course_id, name, p_init, p_learn, p_slip, p_guess, ...)
  mastery  (key = "<user_address>:<concept_id>", user_address, course_id,
            concept_id, p_mastered, attempts, correct, last_seen, next_review, ...)
  attempt  (id, user_address, course_id, concept_id, kind, format, correct,
            p_before, p_after, created_at, ...)

Environment (read by sprout_db.py; a .env in uagents-python/ or the current
directory is loaded if python-dotenv is installed):

  SPACETIMEDB_HOST   default https://maincloud.spacetimedb.com
  SPACETIMEDB_DB     sprout-live
  SPACETIMEDB_TOKEN  a token for a registered Sprout agent (writes need it)

Every public function takes an optional `db`: any object with
`sql(query) -> list[dict]` and `call(reducer, *args)`. It defaults to the
sprout_db module, and tests pass a fake so nothing touches the network.
"""

import logging
import sys
from pathlib import Path

try:
    from .bkt import DEFAULT_PARAMS, mastery_label
except ImportError:  # run from inside mastery/ (python mastery_store.py, flat test imports)
    from bkt import DEFAULT_PARAMS, mastery_label

logger = logging.getLogger(__name__)

UAGENTS_DIR = Path(__file__).resolve().parent.parent / "uagents-python"

# Mirrors FORMATS and ATTEMPT_KINDS in spacetimedb/spacetimedb/src.
FORMATS = ("worked_example", "flashcards", "diagram", "analogy")
ATTEMPT_KINDS = ("diagnostic", "check", "practice", "review")

_db = None


def default_db():
    """The shared sprout_db client, imported on first use."""
    global _db
    if _db is None:
        try:
            from dotenv import load_dotenv
            load_dotenv(UAGENTS_DIR / ".env")
            load_dotenv()
        except ImportError:
            pass
        if str(UAGENTS_DIR) not in sys.path:
            sys.path.insert(0, str(UAGENTS_DIR))
        import sprout_db
        if not sprout_db.enabled():
            logger.error("SPACETIMEDB_TOKEN is not set; database calls will fail.")
        _db = sprout_db
    return _db


# ---------------------------------------------------------------------------
# Encoding helpers (same rules as sprout_db.py, kept here so callers with a
# fake db don't need requests installed)
# ---------------------------------------------------------------------------

def sql_str(text) -> str:
    """A SQL string literal."""
    return "'" + str(text).replace("'", "''") + "'"


def opt(value):
    """A reducer Option argument: {"some": v} or {"none": []}."""
    return {"none": []} if value is None or value == "" else {"some": value}


def micros(ts):
    """SQL returns timestamps as [micros]; returns int micros or None."""
    if ts is None:
        return None
    return ts[0] if isinstance(ts, list) else int(ts)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def record_answer(
    user_address: str,
    concept_id,
    correct: bool,
    format_used: str | None = None,
    *,
    kind: str = "practice",
    session_id: int | None = None,
    question: str | None = None,
    db=None,
) -> tuple[float, str]:
    """
    Record one quiz answer and return the learner's new mastery for the concept.

    Calls the `record_attempt` reducer, which does the BKT update with the
    concept's own parameters, the SM-2 reschedule, the format bandit update
    and the attempt log in one transaction. This function never writes the
    mastery table itself. It then reads p_mastered back from `mastery`.

    Args:
        user_address: The learner's ASI:One sender address.
        concept_id:   The concept's u64 id (int, or a numeric string).
        correct:      True if the student answered correctly.
        format_used:  Teaching format in effect: worked_example, flashcards,
                      diagram or analogy. Anything else (e.g. "mcq") is a
                      question style rather than a teaching format, so it is
                      sent as none and the bandit is left alone.
        kind:         diagnostic | check | practice | review.
        session_id:   Optional session id from `start_session`.
        question:     Optional question text (truncated to 500 chars).
        db:           Optional client (see module docstring).

    Returns:
        (new_p_mastered, label). On any error it logs and returns the safe
        default (prior, "not started") so the agent doesn't crash.
    """
    safe_default = (DEFAULT_PARAMS["prior"], mastery_label(DEFAULT_PARAMS["prior"]))
    try:
        db = db or default_db()
        cid = int(concept_id)
        fmt = format_used if format_used in FORMATS else None
        db.call(
            "record_attempt",
            user_address,
            cid,
            bool(correct),
            kind,
            opt(fmt),
            opt(None if session_id is None else int(session_id)),
            opt(question[:500] if question else None),
        )
        rows = db.sql(f"SELECT p_mastered FROM mastery WHERE key = {sql_str(f'{user_address}:{cid}')}")
        if not rows:
            raise LookupError("no mastery row after record_attempt")
        new_p = float(rows[0]["p_mastered"])
        return new_p, mastery_label(new_p)
    except Exception as exc:
        logger.error("record_answer error for %s/%s: %s", user_address, concept_id, exc)
        return safe_default


def get_snapshot(user_address: str, course_id, db=None) -> list[dict]:
    """
    Return mastery info for every concept in a course, for the snapshot card.

    Each returned dict (ordered by concept id) has:
      concept_id   — the concept's id (int)
      name         — the concept name
      p_mastered   — current mastery probability; the concept's p_init if the
                     learner has no mastery row yet (draft course)
      label        — "solid" / "shaky" / "not started" (bkt.mastery_label)
      attempts     — number of recorded answers
      next_review  — next review time in microseconds since epoch, or None

    Pass {r["name"]: r["p_mastered"] for r in snapshot} to bkt.subject_mastery
    for the "3 of 31 solid" line.

    Returns [] if the course doesn't exist or belongs to another learner, and
    logs and returns [] on error so the agent doesn't crash.
    """
    try:
        db = db or default_db()
        cid = int(course_id)
        course = db.sql(f"SELECT user_address FROM course WHERE id = {cid}")
        if not course or course[0]["user_address"] != user_address:
            return []
        concepts = db.sql(f"SELECT id, name, p_init FROM concept WHERE course_id = {cid}")
        rows = {r["concept_id"]: r for r in db.sql(
            f"SELECT concept_id, p_mastered, attempts, next_review FROM mastery "
            f"WHERE user_address = {sql_str(user_address)} AND course_id = {cid}")}
        snapshot = []
        for c in sorted(concepts, key=lambda c: c["id"]):
            m = rows.get(c["id"])
            p = float(m["p_mastered"]) if m else float(c["p_init"])
            snapshot.append({
                "concept_id":  c["id"],
                "name":        c["name"],
                "p_mastered":  p,
                "label":       mastery_label(p),
                "attempts":    m["attempts"] if m else 0,
                "next_review": micros(m.get("next_review")) if m else None,
            })
        return snapshot
    except Exception as exc:
        logger.error("get_snapshot error for %s/%s: %s", user_address, course_id, exc)
        return []
