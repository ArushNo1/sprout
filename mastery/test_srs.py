"""
test_srs.py — pytest tests for srs.py

Run: pytest test_srs.py -v
"""

from datetime import date, timedelta
import pytest
from srs import DEFAULT_STATE, MIN_EF, build_reviews_from_history, due_concepts, next_review_date, sm2_update


class TestSm2Update:
    def test_perfect_recall_first_rep_gives_interval_1(self):
        """First successful recall → interval = 1 day."""
        state = sm2_update(dict(DEFAULT_STATE), grade=5)
        assert state["interval"] == 1
        assert state["reps"] == 1

    def test_second_rep_gives_interval_6(self):
        """Second successful recall → interval = 6 days."""
        state = sm2_update({"interval": 1, "ef": 2.5, "reps": 1}, grade=5)
        assert state["interval"] == 6
        assert state["reps"] == 2

    def test_third_rep_multiplies_by_ef(self):
        """Third recall → interval = previous interval * EF."""
        state = sm2_update({"interval": 6, "ef": 2.5, "reps": 2}, grade=5)
        assert state["interval"] == round(6 * 2.5)
        assert state["reps"] == 3

    def test_forgotten_resets_interval_and_reps(self):
        """Grade < 3 → forgotten, reset to interval=1, reps=0."""
        state = sm2_update({"interval": 20, "ef": 2.5, "reps": 5}, grade=2)
        assert state["interval"] == 1
        assert state["reps"] == 0

    def test_ef_increases_on_easy_grade(self):
        """Grade 5 → EF increases (concept feels easy)."""
        before_ef = 2.5
        state = sm2_update({"interval": 1, "ef": before_ef, "reps": 1}, grade=5)
        assert state["ef"] > before_ef

    def test_ef_decreases_on_hard_grade(self):
        """Grade 3 → EF decreases (concept is hard but recalled)."""
        before_ef = 2.5
        state = sm2_update({"interval": 1, "ef": before_ef, "reps": 1}, grade=3)
        assert state["ef"] < before_ef

    def test_ef_never_goes_below_min(self):
        """EF must never drop below MIN_EF (1.3) no matter how many hard recalls."""
        state = {"interval": 1, "ef": MIN_EF + 0.01, "reps": 5}
        for _ in range(20):
            state = sm2_update(state, grade=3)
        assert state["ef"] >= MIN_EF

    def test_invalid_grade_raises(self):
        """Grade outside 0-5 should raise ValueError."""
        with pytest.raises(ValueError):
            sm2_update(dict(DEFAULT_STATE), grade=6)
        with pytest.raises(ValueError):
            sm2_update(dict(DEFAULT_STATE), grade=-1)

    def test_grade_3_is_recalled(self):
        """Grade 3 is the minimum for 'recalled' — reps should increment."""
        state = sm2_update(dict(DEFAULT_STATE), grade=3)
        assert state["reps"] == 1

    def test_grade_2_is_forgotten(self):
        """Grade 2 is 'forgotten' — reps should reset."""
        state = sm2_update({"interval": 10, "ef": 2.5, "reps": 3}, grade=2)
        assert state["reps"] == 0


class TestNextReviewDate:
    def test_adds_interval_days(self):
        """next_review_date = last_review + interval days."""
        state = {"interval": 6, "ef": 2.5, "reps": 2}
        last = date(2025, 7, 1)
        assert next_review_date(state, last) == date(2025, 7, 7)

    def test_interval_1_means_tomorrow(self):
        state = {"interval": 1, "ef": 2.5, "reps": 0}
        last = date(2025, 7, 1)
        assert next_review_date(state, last) == date(2025, 7, 2)


class TestDueConcepts:
    def _reviews(self, today, offsets):
        """Build a reviews dict where each concept is due `offset` days from today."""
        reviews = {}
        for concept, offset in offsets.items():
            last = today - timedelta(days=1)  # reviewed yesterday
            reviews[concept] = {
                "state": {"interval": 1 + offset, "ef": 2.5, "reps": 1},
                "last_review": last,
            }
        return reviews

    def test_overdue_concepts_appear(self):
        today = date(2025, 7, 10)
        reviews = {
            "A": {"state": {"interval": 1, "ef": 2.5, "reps": 1}, "last_review": date(2025, 7, 8)},
        }
        due = due_concepts(reviews, today)
        assert any(d["concept"] == "A" for d in due)

    def test_future_concepts_excluded(self):
        today = date(2025, 7, 10)
        reviews = {
            "B": {"state": {"interval": 10, "ef": 2.5, "reps": 1}, "last_review": today},
        }
        due = due_concepts(reviews, today)
        assert due == []

    def test_sorted_most_overdue_first(self):
        today = date(2025, 7, 10)
        reviews = {
            "A": {"state": {"interval": 1, "ef": 2.5, "reps": 1}, "last_review": date(2025, 7, 5)},  # 4 days overdue
            "B": {"state": {"interval": 1, "ef": 2.5, "reps": 1}, "last_review": date(2025, 7, 8)},  # 1 day overdue
        }
        due = due_concepts(reviews, today)
        assert due[0]["concept"] == "A"
        assert due[1]["concept"] == "B"


class TestBuildReviewsFromHistory:
    def test_replays_in_date_order(self):
        """Out-of-order history should still be replayed chronologically."""
        history = [
            {"concept": "X", "date": "2025-07-05", "grade": 4, "correct": True},
            {"concept": "X", "date": "2025-07-01", "grade": 5, "correct": True},
        ]
        reviews = build_reviews_from_history(history)
        # After two successful reps, reps should be 2.
        assert reviews["X"]["state"]["reps"] == 2

    def test_forgotten_then_relearned(self):
        """A forget followed by successful recall should leave reps=1."""
        history = [
            {"concept": "Y", "date": "2025-07-01", "grade": 0, "correct": False},
            {"concept": "Y", "date": "2025-07-02", "grade": 5, "correct": True},
        ]
        reviews = build_reviews_from_history(history)
        assert reviews["Y"]["state"]["reps"] == 1

    def test_last_review_date_is_most_recent(self):
        """last_review should be the date of the final entry for that concept."""
        history = [
            {"concept": "Z", "date": "2025-07-01", "grade": 4, "correct": True},
            {"concept": "Z", "date": "2025-07-08", "grade": 4, "correct": True},
        ]
        reviews = build_reviews_from_history(history)
        assert reviews["Z"]["last_review"] == date(2025, 7, 8)
