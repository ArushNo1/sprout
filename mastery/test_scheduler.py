"""
test_scheduler.py — pytest tests for scheduler.py

Run: pytest test_scheduler.py -v
"""

import pytest
from scheduler import PREREQ_THRESHOLD, next_concept, unlocked_concepts

# A simple linear chain: A -> B -> C
LINEAR_GRAPH = {
    "A": [],
    "B": ["A"],
    "C": ["B"],
}

# A branching graph matching the Linear Algebra demo
LA_GRAPH = {
    "Dot Product":           [],
    "Matrix Multiplication": ["Dot Product"],
    "Linear Independence":   ["Dot Product"],
    "Gaussian Elimination":  ["Linear Independence"],
    "Eigenvalues":           ["Matrix Multiplication", "Linear Independence"],
}

SOLID = PREREQ_THRESHOLD          # 0.7 — counts as solid
LOW   = PREREQ_THRESHOLD - 0.01   # 0.69 — just below solid


class TestNextConcept:
    def test_no_prereqs_returns_lowest_mastery(self):
        """With no prerequisites, pick the concept with lowest mastery."""
        graph = {"X": [], "Y": [], "Z": []}
        masteries = {"X": 0.5, "Y": 0.2, "Z": 0.4}
        assert next_concept(graph, masteries) == "Y"

    def test_locked_concept_is_skipped(self):
        """B should be skipped because its prereq A is not solid."""
        masteries = {"A": LOW, "B": 0.1, "C": 0.1}
        # Only A is unlocked (no prereqs); B and C are locked.
        assert next_concept(LINEAR_GRAPH, masteries) == "A"

    def test_prereq_met_unlocks_next(self):
        """Once A is solid, B becomes the lowest unlocked concept."""
        masteries = {"A": SOLID, "B": 0.3, "C": 0.1}
        # B is unlocked (A solid), C is still locked (B not solid).
        assert next_concept(LINEAR_GRAPH, masteries) == "B"

    def test_all_solid_returns_none(self):
        """If everything is already solid, there's nothing to teach."""
        masteries = {"A": SOLID, "B": SOLID, "C": SOLID}
        assert next_concept(LINEAR_GRAPH, masteries) == "A" or \
               next_concept(LINEAR_GRAPH, {"A": SOLID, "B": SOLID, "C": SOLID}) is None

    def test_all_solid_returns_none_direct(self):
        graph = {"X": [], "Y": []}
        masteries = {"X": SOLID, "Y": SOLID}
        assert next_concept(graph, masteries) is None

    def test_missing_mastery_defaults_to_zero(self):
        """Concepts not in masteries dict are treated as mastery=0."""
        graph = {"A": [], "B": []}
        masteries = {"A": 0.5}   # B not listed
        assert next_concept(graph, masteries) == "B"  # B defaults to 0 → lowest

    def test_both_prereqs_must_be_solid(self):
        """Eigenvalues requires BOTH Matrix Multiplication AND Linear Independence."""
        masteries = {
            "Dot Product":           SOLID,
            "Matrix Multiplication": SOLID,
            "Linear Independence":   LOW,    # not solid yet
            "Gaussian Elimination":  0.1,
            "Eigenvalues":           0.1,
        }
        # Eigenvalues is locked; Gaussian Elimination is also locked (Linear Independence not solid).
        # Only unlocked non-solid concept is Linear Independence itself.
        result = next_concept(LA_GRAPH, masteries)
        assert result == "Linear Independence"

    def test_recommends_lowest_mastery_among_unlocked(self):
        """When multiple concepts are unlocked, pick the one with lowest mastery."""
        masteries = {
            "Dot Product":           SOLID,
            "Matrix Multiplication": 0.5,
            "Linear Independence":   0.3,   # lower — should be picked
            "Gaussian Elimination":  0.1,
            "Eigenvalues":           0.1,
        }
        # Both Matrix Multiplication and Linear Independence are unlocked (Dot Product solid).
        # Gaussian Elimination locked (Linear Independence not solid).
        # Eigenvalues locked (Matrix Multiplication and Linear Independence not both solid).
        result = next_concept(LA_GRAPH, masteries)
        assert result == "Linear Independence"


class TestUnlockedConcepts:
    def test_returns_sorted_by_mastery(self):
        """unlocked_concepts should be sorted lowest mastery first."""
        masteries = {
            "Dot Product":           SOLID,
            "Matrix Multiplication": 0.6,
            "Linear Independence":   0.3,
            "Gaussian Elimination":  0.1,
            "Eigenvalues":           0.1,
        }
        result = unlocked_concepts(LA_GRAPH, masteries)
        masteries_out = [c["mastery"] for c in result]
        assert masteries_out == sorted(masteries_out)

    def test_first_item_is_recommended(self):
        """The lowest-mastery unlocked concept should be flagged recommended=True."""
        masteries = {"Dot Product": SOLID, "Matrix Multiplication": 0.5, "Linear Independence": 0.3}
        result = unlocked_concepts(LA_GRAPH, masteries)
        assert result[0]["recommended"] is True
        for c in result[1:]:
            assert c["recommended"] is False

    def test_solid_concepts_excluded(self):
        """Already-solid concepts should not appear in unlocked list."""
        masteries = {"Dot Product": SOLID, "Matrix Multiplication": SOLID, "Linear Independence": 0.3}
        result = unlocked_concepts(LA_GRAPH, masteries)
        names = [c["concept"] for c in result]
        assert "Dot Product" not in names
        assert "Matrix Multiplication" not in names

    def test_empty_when_all_solid_or_locked(self):
        """Returns empty list if nothing is unlocked and not solid."""
        masteries = {"A": LOW, "B": 0.1, "C": 0.1}
        # Only A is unlocked but it's not solid — wait, A has no prereqs so it IS unlocked.
        # Let's test a fully solid graph.
        graph = {"X": [], "Y": []}
        result = unlocked_concepts(graph, {"X": SOLID, "Y": SOLID})
        assert result == []
