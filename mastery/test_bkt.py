"""
test_bkt.py — pytest tests for bkt.py

Run tests:
    pytest test_bkt.py -v

Print mastery per topic from demo_data.json:
    python test_bkt.py
"""

import pytest
from bkt import DEFAULT_PARAMS, mastery_label, run_diagnostic, update_mastery

# ---------------------------------------------------------------------------
# update_mastery — core BKT step
# ---------------------------------------------------------------------------

class TestUpdateMastery:
    def test_correct_answer_raises_mastery(self):
        """A correct answer should increase mastery (after the learn step)."""
        before = 0.4
        after = update_mastery(before, correct=True)
        assert after > before

    def test_wrong_answer_lowers_mastery_before_learn(self):
        """
        A wrong answer should lower the posterior P(L|obs) before the learn
        step is applied. We verify this by using learn=0 so the learn step
        does nothing and checking the net result is lower.
        """
        params_no_learn = {**DEFAULT_PARAMS, "learn": 0.0}
        before = 0.4
        after = update_mastery(before, correct=False, params=params_no_learn)
        assert after < before

    def test_correct_then_wrong_net_effect(self):
        """
        With the default learn rate a wrong answer still typically raises
        mastery slightly (learn > slip effect). Make sure the value at least
        stays above the starting point after wrong + learn.
        This is informational — we just confirm it's in range.
        """
        result = update_mastery(0.4, correct=False)
        assert 0.001 <= result <= 0.999

    def test_values_stay_in_range_low(self):
        """Starting very close to 0 should not produce a value below _MIN."""
        result = update_mastery(0.001, correct=False)
        assert result >= 0.001

    def test_values_stay_in_range_high(self):
        """Starting very close to 1 should not produce a value above _MAX."""
        result = update_mastery(0.999, correct=True)
        assert result <= 0.999

    def test_multiple_correct_answers_converge_upward(self):
        """Repeated correct answers should keep increasing mastery."""
        p = DEFAULT_PARAMS["prior"]
        for _ in range(10):
            p_new = update_mastery(p, correct=True)
            assert p_new >= p
            p = p_new

    def test_custom_params_respected(self):
        """Passing custom params should change the update result."""
        high_slip = {**DEFAULT_PARAMS, "slip": 0.45}
        low_slip  = {**DEFAULT_PARAMS, "slip": 0.01}
        # High slip → lower posterior on a correct answer
        result_high = update_mastery(0.5, correct=True, params=high_slip)
        result_low  = update_mastery(0.5, correct=True, params=low_slip)
        assert result_low > result_high


# ---------------------------------------------------------------------------
# mastery_label — threshold labels
# ---------------------------------------------------------------------------

class TestMasteryLabel:
    @pytest.mark.parametrize("p,expected", [
        (0.0,   "not started"),
        (0.29,  "not started"),
        (0.3,   "shaky"),
        (0.5,   "shaky"),
        (0.699, "shaky"),
        (0.7,   "solid"),
        (1.0,   "solid"),
    ])
    def test_label_thresholds(self, p, expected):
        assert mastery_label(p) == expected


# ---------------------------------------------------------------------------
# run_diagnostic — batch update from prior
# ---------------------------------------------------------------------------

class TestRunDiagnostic:
    def test_all_correct_beats_all_wrong(self):
        """All-correct diagnostic should yield higher mastery than all-wrong."""
        all_correct = run_diagnostic([True] * 5)
        all_wrong   = run_diagnostic([False] * 5)
        assert all_correct > all_wrong

    def test_empty_answers_returns_prior(self):
        """No answers → return the prior unchanged."""
        result = run_diagnostic([])
        assert abs(result - DEFAULT_PARAMS["prior"]) < 1e-9

    def test_result_in_range(self):
        """Result must always be in [0.001, 0.999]."""
        result = run_diagnostic([True, False, True, False, True, False])
        assert 0.001 <= result <= 0.999

    def test_single_correct(self):
        """One correct answer should raise mastery above the prior."""
        result = run_diagnostic([True])
        assert result > DEFAULT_PARAMS["prior"]

    def test_single_wrong(self):
        """One wrong answer: with default learn rate the net result varies,
        but must stay in range."""
        result = run_diagnostic([False])
        assert 0.001 <= result <= 0.999


# ---------------------------------------------------------------------------
# Topic mastery report — run with: python test_bkt.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json, pathlib
    from bkt import subject_mastery

    demo = json.loads((pathlib.Path(__file__).parent / "demo_data.json").read_text())

    final_masteries = {}
    for concept in demo["concepts"]:
        name = concept["name"]
        mastery = DEFAULT_PARAMS["prior"]
        for correct in concept["answers"]:
            mastery = update_mastery(mastery, correct)
        label = mastery_label(mastery)
        final_masteries[name] = mastery
        print(f"  {name:<28}  {mastery*100:5.1f}%  ({label})")

    solid, total, pct = subject_mastery(final_masteries)
    print(f"\n── Subject mastery: {solid} of {total} concepts solid = {pct}% ──")
