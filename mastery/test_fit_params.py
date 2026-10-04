"""
test_fit_params.py — the fitting CLI and bkt.fit_params_by_concept, with no network.

pyBKT is replaced by a fake fitter (or fake modules) so these run without the
optional packages. The last test uses the real pyBKT when it is installed.

Run: python -m pytest mastery
"""

import random
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `mastery` imports from anywhere

from mastery import bkt, fit_params
from mastery.fake_db import FakeDb

ADDR = "agent1qstudent"


def concept(cid, name):
    return {"id": cid, "course_id": 1, "name": name, "p_init": 0.2,
            "p_learn": 0.15, "p_slip": 0.1, "p_guess": 0.25}


def attempts_for(cid, pattern, start_id):
    # Ids run opposite to time, so the tests catch ordering by id instead of created_at.
    return [{"id": start_id + len(pattern) - i, "user_address": ADDR, "course_id": 1, "concept_id": cid,
             "correct": c, "created_at": [1_700_000_000_000_000 + i * 1_000_000]}
            for i, c in enumerate(pattern)]


@pytest.fixture
def db():
    rows = (attempts_for(10, [False, True] * 20, 1)           # 40 mixed -> fitted
            + attempts_for(11, [True] * 35, 100)              # all right -> skipped
            + attempts_for(12, [False, True] * 5, 200))       # 10 -> too few
    random.Random(0).shuffle(rows)                             # log order shouldn't matter
    return FakeDb(course=[{"id": 1, "user_address": ADDR, "name": "CS 201"}],
                  concept=[concept(10, "Arrays"), concept(11, "Heaps"), concept(12, "Graphs")],
                  attempt=rows)


FITTED = {"prior": 0.31, "learn": 0.22, "slip": 0.12, "guess": 0.18}


def fake_fitter(seen):
    def fitter(rows):
        seen.extend(rows)
        return {cid: dict(FITTED) for cid in {r["concept"] for r in rows}}
    return fitter


class TestFitCourse:
    def test_fits_only_concepts_with_enough_mixed_evidence(self, db):
        seen = []
        result = fit_params.fit_course(1, db=db, fitter=fake_fitter(seen), out=lambda *_: None)
        assert set(result["fitted"]) == {10}
        assert {r["concept"] for r in seen} == {10} and len(seen) == 40
        assert "all right or all wrong" in result["skipped"][11]
        assert "10 attempts" in result["skipped"][12]

    def test_orders_by_created_at_not_id(self, db):
        seen = []
        fit_params.fit_course(1, db=db, fitter=fake_fitter(seen), out=lambda *_: None)
        in_time = [r["correct"] for r in sorted(seen, key=lambda r: r["order"])]
        assert in_time == [False, True] * 20
        assert all(r["user"] == ADDR for r in seen)

    def test_writes_with_set_concept_params(self, db):
        fit_params.fit_course(1, db=db, fitter=fake_fitter([]), out=lambda *_: None)
        assert db.calls == [("set_concept_params", (ADDR, 10, {"some": 0.31}, {"some": 0.22},
                                                    {"some": 0.12}, {"some": 0.18}))]
        arrays = next(c for c in db.tables["concept"] if c["id"] == 10)
        assert (arrays["p_init"], arrays["p_learn"], arrays["p_slip"], arrays["p_guess"]) == (0.31, 0.22, 0.12, 0.18)
        heaps = next(c for c in db.tables["concept"] if c["id"] == 11)
        assert heaps["p_init"] == 0.2  # unchanged

    def test_dry_run_writes_nothing(self, db):
        lines = []
        result = fit_params.fit_course(1, db=db, dry_run=True, fitter=fake_fitter([]), out=lines.append)
        assert db.calls == [] and set(result["fitted"]) == {10}
        assert any("p_init 0.200 -> 0.310" in line for line in lines)
        assert lines[-1].startswith("Would update 1 of 3")

    def test_min_attempts_is_configurable(self, db):
        result = fit_params.fit_course(1, db=db, min_attempts=10, dry_run=True,
                                       fitter=fake_fitter([]), out=lambda *_: None)
        assert set(result["fitted"]) == {10, 12}

    def test_concept_the_fitter_drops_is_left_unchanged(self, db):
        result = fit_params.fit_course(1, db=db, fitter=lambda rows: {}, out=lambda *_: None)
        assert result["fitted"] == {} and db.calls == []
        assert result["skipped"][10] == "pyBKT could not fit it"

    def test_write_failure_is_reported(self, db):
        db.fail_calls.add("set_concept_params")
        result = fit_params.fit_course(1, db=db, fitter=fake_fitter([]), out=lambda *_: None)
        assert 10 in result["errors"]

    def test_unknown_course(self, db):
        with pytest.raises(LookupError):
            fit_params.fit_course(99, db=db, fitter=fake_fitter([]), out=lambda *_: None)

    def test_no_eligible_concepts_never_needs_pybkt(self, db):
        def boom(rows):
            raise AssertionError("fitter should not run")
        result = fit_params.fit_course(1, db=db, min_attempts=1000, fitter=boom, out=lambda *_: None)
        assert result["fitted"] == {}


class TestMain:
    def test_requires_course(self):
        with pytest.raises(SystemExit):
            fit_params.main([])

    def test_missing_pybkt_exits_cleanly(self, db, monkeypatch, capsys):
        monkeypatch.setattr(fit_params.mastery_store, "default_db", lambda: db)
        monkeypatch.setitem(sys.modules, "pyBKT", None)  # makes `import pyBKT...` raise ImportError
        monkeypatch.setitem(sys.modules, "pyBKT.models", None)
        assert fit_params.main(["--course", "1", "--dry-run"]) == 2
        assert "pyBKT" in capsys.readouterr().err


# ---------------------------------------------------------------------------
# bkt.fit_params_by_concept with fake pyBKT / pandas modules
# ---------------------------------------------------------------------------

def _install_fake_pybkt(monkeypatch, values_by_skill, fail_skills=()):
    frames = []

    class Model:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def fit(self, data):
            frames.append(data)
            self.skill = data["skill_name"][0]
            if self.skill in fail_skills:
                raise ValueError("degenerate")

        def params(self):
            v = values_by_skill[self.skill]
            # Real pyBKT: a DataFrame indexed by (skill, param, class) with a "value" column.
            return {"value": {(self.skill, k, "default"): x for k, x in v.items()}}

    pd = types.ModuleType("pandas")
    pd.DataFrame = lambda d: {k: list(v) for k, v in d.items()}
    models = types.ModuleType("pyBKT.models")
    models.Model = Model
    monkeypatch.setitem(sys.modules, "pandas", pd)
    monkeypatch.setitem(sys.modules, "pyBKT", types.ModuleType("pyBKT"))
    monkeypatch.setitem(sys.modules, "pyBKT.models", models)
    return frames


class TestFitParamsByConcept:
    ATTEMPTS = [
        {"user": "u", "concept": 7, "correct": True, "order": 3},
        {"user": "u", "concept": 9, "correct": False, "order": 2},
        {"user": "u", "concept": 7, "correct": False, "order": 1},
    ]

    def test_returns_params_per_concept_and_clamps(self, monkeypatch):
        frames = _install_fake_pybkt(monkeypatch, {
            "7": {"prior": 0.4, "learns": 0.2, "slips": 0.7, "guesses": 0.1, "forgets": 0.0},
            "9": {"prior": 0.0, "learns": 1.0, "slips": 0.05, "guesses": 0.6, "forgets": 0.0},
        })
        out = bkt.fit_params_by_concept(self.ATTEMPTS)
        assert out == {
            7: {"prior": 0.4, "learn": 0.2, "slip": 0.499, "guess": 0.1},
            9: {"prior": 0.001, "learn": 0.999, "slip": 0.05, "guess": 0.499},
        }
        # Replayed in `order`, one frame per concept.
        assert frames[0]["correct"] == [0, 1] and frames[0]["skill_name"] == ["7", "7"]

    def test_one_bad_concept_does_not_sink_the_rest(self, monkeypatch):
        _install_fake_pybkt(monkeypatch, {"7": {"prior": 0.3, "learns": 0.1, "slips": 0.1, "guesses": 0.2}},
                            fail_skills={"9"})
        assert set(bkt.fit_params_by_concept(self.ATTEMPTS)) == {7}

    def test_old_fit_params_returns_first_concept(self, monkeypatch):
        _install_fake_pybkt(monkeypatch, {
            "7": {"prior": 0.3, "learns": 0.1, "slips": 0.1, "guesses": 0.2},
            "9": {"prior": 0.5, "learns": 0.5, "slips": 0.2, "guesses": 0.2},
        })
        assert bkt.fit_params(self.ATTEMPTS) == {"prior": 0.3, "learn": 0.1, "slip": 0.1, "guess": 0.2}

    def test_old_fit_params_falls_back_to_defaults(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "pyBKT", None)
        monkeypatch.setitem(sys.modules, "pyBKT.models", None)
        assert bkt.fit_params(self.ATTEMPTS) == bkt.DEFAULT_PARAMS


def test_real_pybkt_fit():
    """Only runs where the optional pyBKT is installed."""
    pytest.importorskip("pandas")
    try:
        from pyBKT.models import Model  # noqa: F401  (may fail on import with newer scikit-learn)
    except Exception as exc:
        pytest.skip(f"pyBKT unavailable: {exc}")
    rng = random.Random(1)
    rows, order = [], 0
    for cid in (7, 9):
        for u in range(6):
            known = False
            for _ in range(15):
                known = known or rng.random() < 0.2
                correct = rng.random() > 0.1 if known else rng.random() < 0.25
                order += 1
                rows.append({"user": f"u{u}", "concept": cid, "correct": correct, "order": order})
    fitted = bkt.fit_params_by_concept(rows)
    assert set(fitted) == {7, 9}
    for p in fitted.values():
        assert set(p) == {"prior", "learn", "slip", "guess"}
        assert 0.001 <= p["prior"] <= 0.999 and 0.001 <= p["learn"] <= 0.999
        assert p["slip"] < 0.5 and p["guess"] < 0.5
