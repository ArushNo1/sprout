"""
test_mastery_store.py — mastery_store against an in-memory fake database (no network).

Run: python -m pytest mastery
"""

import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `mastery` imports from anywhere

from mastery import mastery_store
from mastery.bkt import DEFAULT_PARAMS, subject_mastery, update_mastery
from mastery.fake_db import FakeDb

ADDR = "agent1qstudent"


def concept(cid, name, course_id=1, p_init=0.2):
    return {"id": cid, "course_id": course_id, "name": name, "p_init": p_init,
            "p_learn": 0.15, "p_slip": 0.1, "p_guess": 0.25}


@pytest.fixture
def db():
    return FakeDb(
        course=[{"id": 1, "user_address": ADDR, "name": "CS 201"},
                {"id": 2, "user_address": "someone-else", "name": "Other"}],
        concept=[concept(10, "Arrays"), concept(11, "Heaps"), concept(12, "Graphs", p_init=0.3),
                 concept(20, "Elsewhere", course_id=2)],
        mastery=[
            {"key": f"{ADDR}:10", "user_address": ADDR, "course_id": 1, "concept_id": 10,
             "p_mastered": 0.92, "attempts": 4, "next_review": [1_700_000_000_000_000]},
            {"key": f"{ADDR}:11", "user_address": ADDR, "course_id": 1, "concept_id": 11,
             "p_mastered": 0.45, "attempts": 2, "next_review": None},
        ],
    )


class TestRecordAnswer:
    def test_calls_record_attempt_and_reads_back(self, db):
        p, label = mastery_store.record_answer(ADDR, 11, True, "worked_example",
                                               kind="check", session_id=7, question="What is a heap?", db=db)
        assert db.calls == [("record_attempt", (ADDR, 11, True, "check", {"some": "worked_example"},
                                                {"some": 7}, {"some": "What is a heap?"}))]
        assert p == pytest.approx(update_mastery(0.45, True))
        assert label == "solid"  # 0.45 -> ~0.78 after a correct answer

    def test_never_writes_mastery_directly(self, db):
        mastery_store.record_answer(ADDR, 10, False, db=db)
        assert [name for name, _ in db.calls] == ["record_attempt"]

    def test_unknown_format_is_sent_as_none(self, db):
        mastery_store.record_answer(ADDR, 10, True, "mcq", db=db)
        _, args = db.calls[0]
        assert args[3] == "practice"          # default kind
        assert args[4] == {"none": []}        # "mcq" is not a teaching format
        assert args[5] == {"none": []} and args[6] == {"none": []}

    def test_string_concept_id_is_converted(self, db):
        mastery_store.record_answer(ADDR, "10", True, db=db)
        assert db.calls[0][1][1] == 10

    def test_first_answer_creates_row_from_prior(self, db):
        p, _ = mastery_store.record_answer(ADDR, 12, True, db=db)
        assert p == pytest.approx(update_mastery(0.3, True))

    def test_reducer_error_returns_safe_default(self, db):
        db.fail_calls.add("record_attempt")
        assert mastery_store.record_answer(ADDR, 10, True, db=db) == (DEFAULT_PARAMS["prior"], "not started")

    def test_quotes_in_address_are_escaped(self):
        fake = FakeDb(concept=[concept(10, "A")])
        p, _ = mastery_store.record_answer("o'brien", 10, True, db=fake)
        assert "'o''brien:10'" in fake.queries[-1]
        assert p == pytest.approx(update_mastery(0.2, True))


class TestGetSnapshot:
    def test_lists_every_concept_in_the_course(self, db):
        snap = mastery_store.get_snapshot(ADDR, 1, db=db)
        assert [r["concept_id"] for r in snap] == [10, 11, 12]
        arrays, heaps, graphs = snap
        assert arrays == {"concept_id": 10, "name": "Arrays", "p_mastered": 0.92, "label": "solid",
                          "attempts": 4, "next_review": 1_700_000_000_000_000}
        assert heaps["label"] == "shaky" and heaps["next_review"] is None
        # No mastery row yet: falls back to the concept prior.
        assert graphs["p_mastered"] == 0.3 and graphs["attempts"] == 0

    def test_feeds_subject_mastery(self, db):
        snap = mastery_store.get_snapshot(ADDR, 1, db=db)
        assert subject_mastery({r["name"]: r["p_mastered"] for r in snap})[:2] == (1, 3)

    def test_other_learners_course_is_empty(self, db):
        assert mastery_store.get_snapshot(ADDR, 2, db=db) == []

    def test_missing_course_is_empty(self, db):
        assert mastery_store.get_snapshot(ADDR, 99, db=db) == []

    def test_db_error_returns_empty(self):
        class Broken:
            def sql(self, q):
                raise RuntimeError("down")
        assert mastery_store.get_snapshot(ADDR, 1, db=Broken()) == []


def test_importing_the_package_pulls_in_no_heavy_or_network_deps():
    """bkt/mastery_store/fit_params must import without pandas, pyBKT, requests or sprout_db."""
    root = Path(__file__).resolve().parent.parent
    code = ("import sys, mastery.bkt, mastery.mastery_store, mastery.fit_params, mastery.scheduler, mastery.srs; "
            "bad = [m for m in ('pandas', 'pyBKT', 'requests', 'sprout_db') if m in sys.modules]; "
            "assert not bad, bad")
    subprocess.run([sys.executable, "-c", code], cwd=root, check=True)
