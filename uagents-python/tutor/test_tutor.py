import json
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cards import feedback_card, home_card, parse_selection, question_card, snapshot_image, snapshot_rows
from content import clean_question
from learning import days_until, format_insight

SNAP = {"concepts": [{"name": "Big-O", "p": 0.35}, {"name": "Arrays", "p": 0.92}, {"name": "Heaps", "p": 0.1}],
        "due": 2, "untested": 1, "recap": "Reviewed Big-O."}


class QuestionTest(unittest.TestCase):
    def test_shuffle_keeps_the_right_answer(self):
        raw = {"question": "2+2?", "choices": ["A) 3", "B) 4", "C) 5", "D) 22"], "correct_index": 1, "explanation": "Sum."}
        for seed in range(20):
            q = clean_question(raw, random.Random(seed))
            self.assertEqual(q["choices"][q["correct_index"]], "4")
            self.assertNotIn("B) 4", q["choices"])

    def test_rejects_bad_questions(self):
        for raw in ({"question": "", "choices": ["a", "b", "c"], "correct_index": 0},
                    {"question": "q", "choices": ["a", "b"], "correct_index": 0},
                    {"question": "q", "choices": ["a", "b", "c"], "correct_index": 3},
                    {"question": "q", "choices": ["a", "a", "c"], "correct_index": 0}):
            with self.assertRaises(ValueError):
                clean_question(raw)


class InsightTest(unittest.TestCase):
    def test_needs_evidence_and_a_gap(self):
        self.assertIsNone(format_insight([{"format": "worked_example", "alpha": 8, "beta": 2, "uses": 9}]))
        line = format_insight([{"format": "worked_example", "alpha": 8, "beta": 2, "uses": 9},
                               {"format": "flashcards", "alpha": 3, "beta": 6, "uses": 8},
                               {"format": "analogy", "alpha": 1, "beta": 1, "uses": 0}])
        self.assertEqual(line, "Worked examples have worked better for you than flashcards: 80% vs 33% of check "
                               "questions right, so I'll lean on them.")
        self.assertIsNone(format_insight([{"format": "diagram", "alpha": 5, "beta": 5, "uses": 9},
                                          {"format": "analogy", "alpha": 5, "beta": 5, "uses": 9}]))


class CardTest(unittest.TestCase):
    def test_snapshot_weakest_first(self):
        self.assertEqual([c["name"] for c in snapshot_rows(SNAP["concepts"])], ["Heaps", "Big-O", "Arrays"])
        url, ratio = snapshot_image("Data Structures", SNAP, 7)
        self.assertIn("exam%20in%207%20days%20%C2%B7%202%20due%20for%20review", url)
        self.assertIn("r=Heaps~0.10~10%25", url)
        self.assertEqual(ratio, "1080:402")

    def test_cards_are_valid(self):
        q = {"question": "Which is O(1)?", "choices": ["a", "b", "c", "d"], "correct_index": 2, "explanation": "e"}
        for msg in (home_card("DS", SNAP, 3, "Insight."), question_card("Big-O", "diagnostic", q, 1, 5),
                    feedback_card(q, 1, 0.35, 0.2, "Big-O", "Next question", "next")):
            payload = json.loads(msg.content[1].metadata["card_payload"])
            self.assertIn("root", payload)
            self.assertNotIn(None, payload["root"]["children"])
        buttons = json.loads(question_card("Big-O", "diagnostic", q, 1, 5).content[1].metadata["card_payload"])["root"]["children"][3]["children"]
        self.assertEqual([b["action"]["selection"] for b in buttons], [{"action": "answer", "choice": i} for i in range(4)])

    def test_parse_selection(self):
        self.assertEqual(parse_selection('@agent1q {"selection": {"action": "answer", "choice": 2}, "approved": true}'),
                         {"action": "answer", "choice": 2})
        self.assertEqual(parse_selection("hello"), {})

    def test_days_until(self):
        self.assertEqual(days_until([int((1000 + 86400 * 3) * 1e6)], now=1000), 3)
        self.assertIsNone(days_until(None))


if __name__ == "__main__":
    unittest.main()
