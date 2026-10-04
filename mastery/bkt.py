"""
bkt.py — Bayesian Knowledge Tracing (BKT) for Sprout.

BKT models the probability that a student has mastered a concept.
After every quiz answer we update that probability using four parameters:
  prior (P(L0)) — chance the student already knew it before any questions
  learn (P(T))  — chance they learn it from attempting a question
  slip  (P(S))  — chance they answer wrong even though they know it
  guess (P(G))  — chance they answer right without knowing it

The live update runs inside the SpacetimeDB `record_attempt` reducer
(spacetimedb/spacetimedb/src/algorithms.ts, same formula and defaults); this
module mirrors it for local use, tests and offline fitting.

Display helpers for the tutor agent:
  mastery_label(p)            -> "solid" / "shaky" / "not started" for a card
  subject_mastery({name: p})  -> (solid, total, pct), e.g. "3 of 31 solid"
Both are pure functions with no imports, so the tutor can call them (or inline
them into a hosted bundle) without pulling in pandas or pyBKT. Feed them the
`p_mastered` values from mastery_store.get_snapshot().

Fitting (fit_params, fit_params_by_concept) needs the optional pyBKT and
pandas packages. They are imported inside those functions only, so the rest
of this module never depends on them.
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

    Used by the tutor agent for the solid/shaky tag on concept cards. The 0.7
    cut-off matches PREREQ_SOLID in the SpacetimeDB module, so a concept shown
    as "solid" is also one that unlocks its dependents. Pure, no imports.
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


# Slip and guess must stay below 0.5: above that a wrong answer would count as
# evidence of mastery. Same limit as clampBktParam in algorithms.ts.
SLIP_GUESS_MAX = 0.499

# pyBKT's names for the four parameters (it also fits "forgets", which plain
# BKT and the SpacetimeDB reducer don't use).
_PYBKT_NAMES = {"prior": "prior", "learns": "learn", "slips": "slip", "guesses": "guess"}


def sanitize_params(params: dict) -> dict:
    """Clamp prior/learn into [0.001, 0.999] and slip/guess into [0.001, 0.499]."""
    return {
        "prior": _clamp(params["prior"]),
        "learn": _clamp(params["learn"]),
        "slip":  min(SLIP_GUESS_MAX, _clamp(params["slip"])),
        "guess": min(SLIP_GUESS_MAX, _clamp(params["guess"])),
    }


def _attempt_order(a: dict, i: int):
    """Sort key: explicit `order` (e.g. the attempt id), else `timestamp`, else list position."""
    if a.get("order") is not None:
        return (0, a["order"], i)
    if a.get("timestamp") is not None:
        return (1, a["timestamp"], i)
    return (2, i, i)


def fit_params_by_concept(
    attempts: list[dict],
    seed: int = 42,
    num_fits: int = 5,
) -> dict:
    """
    Fit BKT parameters separately for every concept that appears in `attempts`.

    Requires the optional pyBKT and pandas packages (imported here, lazily).

    Each attempt dict needs keys user, concept, correct, and optionally
    `order` (any sortable value, e.g. (created_at, id)) or `timestamp` so the
    answers are replayed in the order they happened.

    Each concept is fitted on its own, so one concept with degenerate data
    doesn't sink the rest; concepts pyBKT can't fit are left out of the result.

    Returns:
        {concept: {"prior", "learn", "slip", "guess"}}, clamped by sanitize_params.

    Raises:
        ImportError if pyBKT or pandas is not installed.
    """
    import pandas as pd
    from pyBKT.models import Model

    keyed = sorted(((_attempt_order(a, i), a) for i, a in enumerate(attempts)), key=lambda x: x[0])
    by_concept: dict = {}
    for _, a in keyed:
        by_concept.setdefault(a["concept"], []).append(a)

    fitted = {}
    for concept, rows in by_concept.items():
        df = pd.DataFrame({
            "order_id":   range(1, len(rows) + 1),
            "user_id":    [str(a["user"]) for a in rows],
            "skill_name": [str(concept)] * len(rows),
            "correct":    [int(bool(a["correct"])) for a in rows],
        })
        try:
            # parallel=False: each fit is small, and pyBKT's process pool
            # needs a __main__ guard under macOS spawn.
            model = Model(seed=seed, num_fits=num_fits, parallel=False)
            model.fit(data=df)
            # params() is a DataFrame indexed by (skill, param, class) with a
            # "value" column. Average over classes (there is only "default"
            # unless multilearn/multiguess is turned on).
            values: dict = {}
            for (_skill, name, _cls), v in model.params()["value"].items():
                if name in _PYBKT_NAMES:
                    values.setdefault(_PYBKT_NAMES[name], []).append(float(v))
            raw = {k: sum(v) / len(v) for k, v in values.items()}
            if set(raw) != {"prior", "learn", "slip", "guess"}:
                raise ValueError(f"pyBKT returned {sorted(raw)}")
            fitted[concept] = sanitize_params(raw)
        except Exception as exc:
            print(f"[fit_params] Could not fit concept {concept!r} ({exc}); skipping.")
    return fitted


def fit_params(attempts: list[dict]) -> dict:
    """
    Fit BKT parameters from logged attempt data and return one parameter set.

    Kept for existing callers: with several concepts in `attempts` it returns
    the first concept's parameters. Use fit_params_by_concept for a dict of
    per-concept parameters (that is what `python -m mastery.fit_params` uses).

    Requires: pip install pyBKT pandas
    Each attempt dict must have keys: user, concept, correct (timestamp optional).
    Slip and guess are clamped below 0.5 to keep the model sensible.

    Returns a dict with keys prior/learn/slip/guess, falling back to
    DEFAULT_PARAMS if pyBKT is not installed or fitting fails.
    """
    try:
        fitted = fit_params_by_concept(attempts)
        if not fitted:
            raise ValueError("no concept could be fitted")
        return next(iter(fitted.values()))
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

    The tutor agent uses this for the "3 of 31 solid" line on the snapshot
    card. Include untested concepts (their p_mastered is the concept's prior)
    so the total is the whole course:

        snap = mastery_store.get_snapshot(address, course_id)
        solid, total, _ = subject_mastery({r["name"]: r["p_mastered"] for r in snap})
        f"{solid} of {total} solid"

    Pure, no imports.
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
