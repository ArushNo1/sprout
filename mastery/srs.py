"""
srs.py — Spaced Repetition Scheduler for Sprout using the SM-2 algorithm.

SM-2 works like this:
  - Each concept has an interval (days until next review) and an easiness factor (EF).
  - After each quiz, you give a grade 0-5 (5 = perfect, 0 = total blank).
  - If grade >= 3: the concept was recalled — interval grows, EF adjusts.
  - If grade < 3:  the concept was forgotten — reset to day 1, relearn it.
  - Next review date = last review date + interval days.

Grade guide (tell students this):
  5 — perfect, instant recall
  4 — correct with slight hesitation
  3 — correct but needed a hint
  2 — wrong but the answer felt familiar
  1 — wrong, barely recognised it
  0 — complete blank

Usage:
    from srs import sm2_update, next_review_date, due_concepts

    state = sm2_update({"interval": 1, "ef": 2.5, "reps": 0}, grade=4)
    # → {"interval": 6, "ef": 2.5, "reps": 1}
"""

from datetime import date, timedelta

# SM-2 starting defaults for a brand-new concept.
DEFAULT_STATE = {
    "interval": 1,   # days until first review
    "ef":       2.5, # easiness factor (higher = easier, grows slower interval)
    "reps":     0,   # number of successful consecutive recalls
}

# Minimum easiness factor — prevents intervals shrinking to nothing.
MIN_EF = 1.3


def sm2_update(state: dict, grade: int) -> dict:
    """
    Apply one SM-2 step and return the updated state.

    Args:
        state: Dict with keys interval (int), ef (float), reps (int).
               Use DEFAULT_STATE for a brand-new concept.
        grade: Integer 0-5. Grade >= 3 = recalled, < 3 = forgotten.

    Returns:
        New state dict with updated interval, ef, and reps.
    """
    if not (0 <= grade <= 5):
        raise ValueError(f"grade must be 0-5, got {grade}")

    interval = state.get("interval", DEFAULT_STATE["interval"])
    ef       = state.get("ef",       DEFAULT_STATE["ef"])
    reps     = state.get("reps",     DEFAULT_STATE["reps"])

    if grade >= 3:
        # Recalled — grow the interval.
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = round(interval * ef)

        # Adjust easiness factor based on how easy/hard the recall was.
        # Formula from the original SM-2 paper.
        ef = ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
        ef = max(MIN_EF, ef)
        reps += 1
    else:
        # Forgotten — reset and relearn from scratch.
        interval = 1
        reps     = 0
        # EF is unchanged on a failure (penalising EF makes recovery too slow).

    return {"interval": interval, "ef": round(ef, 4), "reps": reps}


def next_review_date(state: dict, last_review: date) -> date:
    """
    Return the date the student should next review this concept.

    Args:
        state:       SM-2 state dict (interval, ef, reps).
        last_review: The date of the most recent quiz attempt.

    Returns:
        The next review date (last_review + interval days).
    """
    return last_review + timedelta(days=state["interval"])


def due_concepts(
    reviews: dict[str, dict],   # concept -> {"state": sm2_state, "last_review": date}
    today: date | None = None,
) -> list[dict]:
    """
    Return all concepts that are due (or overdue) for review today.

    Args:
        reviews: Dict mapping concept name to its SM-2 state and last review date.
        today:   The reference date. Defaults to today.

    Returns:
        List of dicts sorted by how overdue they are (most overdue first):
          { "concept": str, "due": date, "days_overdue": int }
    """
    today = today or date.today()
    due = []
    for concept, info in reviews.items():
        review_date = next_review_date(info["state"], info["last_review"])
        days_overdue = (today - review_date).days
        if days_overdue >= 0:
            due.append({
                "concept":      concept,
                "due":          review_date,
                "days_overdue": days_overdue,
            })
    due.sort(key=lambda x: x["days_overdue"], reverse=True)
    return due


def build_reviews_from_history(history: list[dict]) -> dict[str, dict]:
    """
    Replay a list of quiz history entries through SM-2 to build the current
    state for each concept.

    Each history entry must have:
      concept (str), date (str "YYYY-MM-DD"), grade (int 0-5)

    Entries are processed in chronological order per concept.

    Returns:
        Dict mapping concept -> {"state": sm2_state, "last_review": date}
    """
    # Sort all events by date so we replay in order.
    sorted_history = sorted(history, key=lambda e: e["date"])

    reviews: dict[str, dict] = {}
    for entry in sorted_history:
        concept     = entry["concept"]
        grade       = entry["grade"]
        review_date = date.fromisoformat(entry["date"])

        current_state = reviews.get(concept, {}).get("state", dict(DEFAULT_STATE))
        new_state     = sm2_update(current_state, grade)
        reviews[concept] = {"state": new_state, "last_review": review_date}

    return reviews


# ---------------------------------------------------------------------------
# Demo — run with: python srs.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json, pathlib

    demo = json.loads((pathlib.Path(__file__).parent / "demo_data.json").read_text())
    history = demo["quiz_history"]

    reviews = build_reviews_from_history(history)

    # Use the latest date in the history as "today" so the demo is reproducible.
    today = date.fromisoformat(max(e["date"] for e in history))

    print(f"── Review schedule (as of {today}) ──")
    for concept, info in sorted(reviews.items()):
        review_date = next_review_date(info["state"], info["last_review"])
        days = (review_date - today).days
        if days <= 0:
            timing = f"DUE (overdue by {-days}d)"
        else:
            timing = f"in {days} day{'s' if days != 1 else ''}"
        print(f"  {concept:<28}  next review {review_date}  ({timing})")

    print("\n── Due now ──")
    due = due_concepts(reviews, today)
    if due:
        for d in due:
            print(f"  {d['concept']:<28}  overdue by {d['days_overdue']}d")
    else:
        print("  Nothing due today.")
