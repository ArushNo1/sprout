"""
fit_params.py — fit per-concept BKT parameters for a course from its attempt log.

    python -m mastery.fit_params --course 12 --dry-run      # print, write nothing
    python -m mastery.fit_params --course 12                 # write back
    python -m mastery.fit_params --course 12 --min-attempts 50

Run from the repo root. Steps:
  1. Read the course, its concepts and its `attempt` rows from SpacetimeDB.
  2. Pick the concepts with enough evidence: at least --min-attempts answers
     (default MIN_ATTEMPTS = 30) including at least one right and one wrong.
     BKT has four free parameters and EM on fewer binary answers than that
     mostly returns noise (slip or guess pinned at a bound). With only right
     or only wrong answers the parameters aren't identifiable at all.
  3. Fit each of those concepts with bkt.fit_params_by_concept (pyBKT),
     clamping prior/learn to [0.001, 0.999] and slip/guess below 0.5.
  4. Write them with the agent-only `set_concept_params` reducer. Concepts
     without enough evidence, or that pyBKT can't fit, are left unchanged.

A fitted pInit only applies to mastery rows created later (new concepts or
courses); existing p_mastered values are not touched. pLearn/pSlip/pGuess
take effect on the next `record_attempt`.

Needs SPACETIMEDB_TOKEN for a registered agent (see mastery_store.py) and the
optional packages in mastery/requirements-fit.txt (pyBKT, pandas).
"""

import argparse
import sys

try:
    from . import mastery_store
    from .bkt import fit_params_by_concept
except ImportError:  # python fit_params.py from inside mastery/
    import mastery_store
    from bkt import fit_params_by_concept

MIN_ATTEMPTS = 30

# concept column -> fitted-param key
PARAM_COLUMNS = {"p_init": "prior", "p_learn": "learn", "p_slip": "slip", "p_guess": "guess"}


def load_course(course_id: int, db) -> tuple[dict, list[dict], list[dict]]:
    """(course row, concept rows, attempt rows) for one course."""
    course = db.sql(f"SELECT id, user_address, name FROM course WHERE id = {int(course_id)}")
    if not course:
        raise LookupError(f"Course {course_id} not found")
    concepts = db.sql(
        f"SELECT id, name, p_init, p_learn, p_slip, p_guess FROM concept WHERE course_id = {int(course_id)}")
    attempts = db.sql(
        f"SELECT id, user_address, concept_id, correct, created_at FROM attempt WHERE course_id = {int(course_id)}")
    return course[0], concepts, attempts


def eligible_concepts(attempts: list[dict], min_attempts: int) -> dict:
    """{concept_id: (n, n_correct)} for concepts with enough mixed evidence to fit."""
    counts: dict = {}
    for a in attempts:
        n, right = counts.get(a["concept_id"], (0, 0))
        counts[a["concept_id"]] = (n + 1, right + (1 if a["correct"] else 0))
    return {cid: (n, right) for cid, (n, right) in counts.items()
            if n >= min_attempts and 0 < right < n}


def fit_course(course_id: int, db=None, min_attempts: int = MIN_ATTEMPTS,
               dry_run: bool = False, fitter=fit_params_by_concept, out=print) -> dict:
    """
    Fit and (unless dry_run) write BKT params for one course.

    Returns {"fitted": {concept_id: params}, "skipped": {concept_id: reason},
             "errors": {concept_id: message}}.
    `fitter` is injectable so tests can run without pyBKT.
    """
    db = db or mastery_store.default_db()
    course, concepts, attempts = load_course(course_id, db)
    names = {c["id"]: c["name"] for c in concepts}
    out(f"Course {course['id']} '{course['name']}': {len(concepts)} concepts, {len(attempts)} attempts")

    ok = eligible_concepts(attempts, min_attempts)
    skipped = {}
    for c in concepts:
        if c["id"] not in ok:
            n = sum(1 for a in attempts if a["concept_id"] == c["id"])
            skipped[c["id"]] = (f"{n} attempts (< {min_attempts})" if n < min_attempts
                                else "answers all right or all wrong")

    fitted = {}
    if ok:
        # Replay in time order. Auto-increment ids can have gaps and aren't a
        # reliable order on their own, so they only break ties.
        rows = [{"user": a["user_address"], "concept": a["concept_id"], "correct": bool(a["correct"]),
                 "order": (mastery_store.micros(a.get("created_at")) or 0, a["id"])}
                for a in attempts if a["concept_id"] in ok]
        fitted = fitter(rows)
        for cid in ok:
            if cid not in fitted:
                skipped[cid] = "pyBKT could not fit it"

    errors = {}
    by_id = {c["id"]: c for c in concepts}
    for cid, params in fitted.items():
        old = by_id[cid]
        change = ", ".join(f"{col} {old[col]:.3f} -> {params[key]:.3f}" for col, key in PARAM_COLUMNS.items())
        out(f"  {names.get(cid, cid)} ({ok[cid][0]} attempts): {change}")
        if dry_run:
            continue
        try:
            db.call("set_concept_params", course["user_address"], int(cid),
                    {"some": params["prior"]}, {"some": params["learn"]},
                    {"some": params["slip"]}, {"some": params["guess"]})
        except Exception as exc:
            errors[cid] = str(exc)
            out(f"    write failed: {exc}")

    for cid, reason in skipped.items():
        out(f"  {names.get(cid, cid)}: unchanged ({reason})")
    verb = "Would update" if dry_run else "Updated"
    out(f"{verb} {len(fitted) - len(errors)} of {len(concepts)} concepts.")
    return {"fitted": fitted, "skipped": skipped, "errors": errors}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m mastery.fit_params",
        description="Fit per-concept BKT parameters from a course's attempt log and write them to SpacetimeDB.")
    parser.add_argument("--course", type=int, required=True, help="course id")
    parser.add_argument("--min-attempts", type=int, default=MIN_ATTEMPTS,
                        help=f"answers a concept needs before it is fitted (default {MIN_ATTEMPTS})")
    parser.add_argument("--dry-run", action="store_true", help="print the fitted values, write nothing")
    args = parser.parse_args(argv)

    try:
        result = fit_course(args.course, min_attempts=args.min_attempts, dry_run=args.dry_run)
    except ImportError as exc:
        print(f"Fitting needs pyBKT and pandas (pip install -r mastery/requirements-fit.txt): {exc}", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
