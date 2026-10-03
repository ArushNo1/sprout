"""
mastery_store.py — Supabase persistence layer for BKT mastery scores.

Tables expected in Supabase (Postgres):

  mastery (
    user_address  text,
    concept_id    text,
    course_id     text,
    p_mastered    float,
    last_seen     timestamptz,
    PRIMARY KEY (user_address, concept_id)
  )

  attempts (
    id            bigserial PRIMARY KEY,
    user_address  text,
    concept_id    text,
    format_used   text,
    correct       boolean,
    created_at    timestamptz DEFAULT now()
  )

Reads SUPABASE_URL and SUPABASE_KEY from the .env file in the project root.
Install deps: pip install supabase python-dotenv
"""

import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv

from bkt import DEFAULT_PARAMS, mastery_label, update_mastery

# Load .env from the project root (two levels up from this file).
load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supabase client — created once at import time.
# ---------------------------------------------------------------------------

def _make_client():
    """Build and return a Supabase client, or None if env vars are missing."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL or SUPABASE_KEY not set — mastery_store will not work.")
        return None
    try:
        from supabase import create_client
        return create_client(url, key)
    except Exception as exc:
        logger.error("Failed to create Supabase client: %s", exc)
        return None


_client = _make_client()


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def record_answer(
    user_address: str,
    concept_id: str,
    correct: bool,
    format_used: str,
) -> tuple[float, str]:
    """
    Process one quiz answer for a user/concept pair.

    Steps:
      1. Load the current p_mastered from the `mastery` table
         (falls back to the BKT prior if no row exists yet).
      2. Run the BKT update.
      3. Upsert the new p_mastered and last_seen into `mastery`.
      4. Append a row to `attempts`.

    Args:
        user_address: Unique identifier for the student (ASI:One wallet address).
        concept_id:   Identifier for the concept being quizzed.
        correct:      True if the student answered correctly.
        format_used:  Quiz format, e.g. "mcq", "flashcard", "free_recall".

    Returns:
        (new_p_mastered, label) — safe defaults (prior, "not started") on error.
    """
    safe_default = (DEFAULT_PARAMS["prior"], mastery_label(DEFAULT_PARAMS["prior"]))

    if _client is None:
        logger.error("record_answer: no Supabase client available.")
        return safe_default

    try:
        # --- 1. Fetch current mastery ---
        row = (
            _client.table("mastery")
            .select("p_mastered")
            .eq("user_address", user_address)
            .eq("concept_id", concept_id)
            .maybe_single()
            .execute()
        )
        current_p = row.data["p_mastered"] if row.data else DEFAULT_PARAMS["prior"]

        # --- 2. BKT update ---
        new_p = update_mastery(current_p, correct)
        label = mastery_label(new_p)

        # --- 3. Upsert mastery row ---
        _client.table("mastery").upsert({
            "user_address": user_address,
            "concept_id":   concept_id,
            "p_mastered":   new_p,
            "last_seen":    datetime.now(timezone.utc).isoformat(),
        }).execute()

        # --- 4. Append attempt ---
        _client.table("attempts").insert({
            "user_address": user_address,
            "concept_id":   concept_id,
            "format_used":  format_used,
            "correct":      correct,
        }).execute()

        return new_p, label

    except Exception as exc:
        logger.error("record_answer error for %s/%s: %s", user_address, concept_id, exc)
        return safe_default


def get_snapshot(user_address: str, course_id: str) -> list[dict]:
    """
    Return mastery info for every concept in a course, for the snapshot card.

    Each returned dict has:
      concept_id  — the concept identifier
      p_mastered  — current mastery probability (float)
      label       — "solid" / "shaky" / "not started"

    Falls back to an empty list on error so the agent doesn't crash.
    """
    if _client is None:
        logger.error("get_snapshot: no Supabase client available.")
        return []

    try:
        # Fetch all mastery rows for this user in this course.
        rows = (
            _client.table("mastery")
            .select("concept_id, p_mastered")
            .eq("user_address", user_address)
            .eq("course_id", course_id)
            .execute()
        )

        return [
            {
                "concept_id": r["concept_id"],
                "p_mastered": r["p_mastered"],
                "label":      mastery_label(r["p_mastered"]),
            }
            for r in (rows.data or [])
        ]

    except Exception as exc:
        logger.error("get_snapshot error for %s/%s: %s", user_address, course_id, exc)
        return []
