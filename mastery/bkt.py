"""
bkt.py — Bayesian Knowledge Tracing (BKT) for Sprout.

BKT models the probability that a student has mastered a concept.
After every quiz answer we update that probability using four parameters:
  prior (P(L0)) — chance the student already knew it before any questions
  learn (P(T))  — chance they learn it from attempting a question
  slip  (P(S))  — chance they answer wrong even though they know it
  guess (P(G))  — chance they answer right without knowing it
"""

# Default parameters used when no per-concept params are provided.
DEFAULT_PARAMS = {
    "prior": 0.20,   # P(L0)
    "learn": 0.15,   # P(T)
    "slip":  0.10,   # P(S)
    "guess": 0.25,   # P(G)
}

# Keep mastery away from the hard 0/1 edges so the model never gets stuck.
_MIN = 0.001
_MAX = 0.999


def _clamp(p: float) -> float:
    """Clamp a probability to [_MIN, _MAX]."""
    return max(_MIN, min(_MAX, p))


def update_mastery(p_mastered: float, correct: bool, params: dict | None = None) -> float:
    """
    Apply one BKT update step and return the new mastery probability.

    Args:
        p_mastered: Current P(mastered) for this concept, in [0, 1].
        correct:    True if the student answered correctly, False otherwise.
        params:     Dict with keys prior/learn/slip/guess. Uses DEFAULT_PARAMS if None.

    Returns:
        Updated P(mastered), clamped to [0.001, 0.999].
    """
    p = params or DEFAULT_PARAMS
    L = p_mastered
    S = p["slip"]
    G = p["guess"]
    T = p["learn"]

    # --- Step 1: update on the observed answer (Bayes rule) ---
    if correct:
        # P(correct | knows) = 1 - S,  P(correct | doesn't know) = G
        numerator   = L * (1 - S)
        denominator = numerator + (1 - L) * G
    else:
        # P(wrong | knows) = S,  P(wrong | doesn't know) = 1 - G
        numerator   = L * S
        denominator = numerator + (1 - L) * (1 - G)

    # Guard against a zero denominator (shouldn't happen with valid params).
    L_obs = numerator / denominator if denominator > 0 else L

    # --- Step 2: apply the learning opportunity ---
    L_next = L_obs + (1 - L_obs) * T

    return _clamp(L_next)


def mastery_label(p: float) -> str:
    """
    Convert a mastery probability into a human-readable label.

    "solid"       — p >= 0.7   (student likely knows it)
    "shaky"       — 0.3 <= p < 0.7  (uncertain)
    "not started" — p < 0.3   (very low confidence)
    """
    if p >= 0.7:
        return "solid"
    if p >= 0.3:
        return "shaky"
    return "not started"


def run_diagnostic(answers: list[bool], params: dict | None = None) -> float:
    """
    Estimate starting mastery from a sequence of diagnostic answers.

    Starts at the prior probability and applies each answer in order.
    Used on day one to set a meaningful starting point instead of the default prior.

    Args:
        answers: List of booleans (True = correct, False = wrong).
        params:  BKT parameters. Uses DEFAULT_PARAMS if None.

    Returns:
        Final P(mastered) after processing all answers.
    """
    p = params or DEFAULT_PARAMS
    mastery = p["prior"]
    for correct in answers:
        mastery = update_mastery(mastery, correct, p)
    return mastery


def fit_params(attempts: list[dict]) -> dict:
    """
    [POST-HACKATHON] Fit per-concept BKT parameters from logged attempt data.

    Requires: pip install pyBKT
    Each attempt dict must have keys: user, concept, correct, timestamp.
    Slip and guess are clamped below 0.5 to keep the model sensible.

    Returns a dict with keys prior/learn/slip/guess, falling back to
    DEFAULT_PARAMS if pyBKT is not installed or fitting fails.
    """
    try:
        from pyBKT.models import Model  # imported here so the rest of bkt.py works without it
        import pandas as pd

        df = pd.DataFrame(attempts)
        df = df.rename(columns={"user": "user_id", "concept": "skill_name", "correct": "correct"})

        model = Model()
        model.fit(data=df)
        params = model.params().to_dict()

        # pyBKT returns per-skill rows; grab the first (or only) skill's values.
        skill = list(params["prior"].keys())[0]
        return {
            "prior": _clamp(params["prior"][skill]),
            "learn": _clamp(params["learns"][skill]),
            "slip":  min(0.499, _clamp(params["slips"][skill])),
            "guess": min(0.499, _clamp(params["guesses"][skill])),
        }
    except Exception as exc:
        print(f"[fit_params] Could not fit params ({exc}), using defaults.")
        return dict(DEFAULT_PARAMS)


def subject_mastery(concept_masteries: dict[str, float]) -> tuple[int, int, float]:
    """
    Calculate overall subject mastery as the fraction of solid concepts.

    Args:
        concept_masteries: Dict mapping concept name -> p_mastered float.

    Returns:
        (solid_count, total_count, percentage) e.g. (7, 10, 70.0)
    """
    total = len(concept_masteries)
    solid = sum(1 for p in concept_masteries.values() if mastery_label(p) == "solid")
    percentage = round(100 * solid / total, 1) if total > 0 else 0.0
    return solid, total, percentage


# ---------------------------------------------------------------------------
# Demo — run with: python bkt.py
# Answers are loaded from demo_data.json so you can edit them without
# touching this file.
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json, pathlib
    demo = json.loads((pathlib.Path(__file__).parent / "demo_data.json").read_text())

    # --- Per-concept quiz simulation ---
    print("── Per-concept quiz results ──")
    final_masteries = {}
    for concept in demo["concepts"]:
        name = concept["name"]
        mastery = DEFAULT_PARAMS["prior"]
        for correct in concept["answers"]:
            mastery = update_mastery(mastery, correct)
        label = mastery_label(mastery)
        final_masteries[name] = mastery
        print(f"  {name}: p={mastery:.3f}  ({label})")

    # --- Subject-level summary ---
    solid, total, pct = subject_mastery(final_masteries)
    print(f"\n── Subject mastery: {solid} of {total} concepts solid = {pct}% ──")
