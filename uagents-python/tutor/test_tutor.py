import json
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tutor.cards import (feedback_card, flashcard_back, flashcard_front, flashcard_summary, home_card, lesson_card,
                         parse_selection, question_card, snapshot_image, snapshot_rows)
from tutor.content import clean_question, parse_lesson, plain_math, qa_pairs
from tutor.learning import days_until, format_insight

SNAP = {"concepts": [{"name": "Big-O", "p": 0.35, "attempts": 2}, {"name": "Arrays", "p": 0.92, "attempts": 4},
                     {"name": "Heaps", "p": 0.1, "attempts": 3}, {"name": "Graphs", "p": None, "attempts": 0}],
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


class MathTest(unittest.TestCase):
    def test_latex_becomes_plain_text(self):
        self.assertEqual(plain_math(r"total is $O(n \times n) = O(n^2)$, and $\log_2 n \le n$"),
                         "total is O(n × n) = O(n^2), and log_2 n ≤ n")
        self.assertEqual(plain_math("unbalanced $n$$ here"), "unbalanced n here")

    def test_leaves_diagrams_and_prices_alone(self):
        self.assertEqual(plain_math("  /  \\\n a    b"), "  /  \\\n a    b")
        self.assertEqual(plain_math("costs $5"), "costs $5")


LESSON = """## The big idea
Big-O says how running time grows.

## How it works
Count the steps as n grows, then keep the fastest-growing term.

## Worked example
1. Two nested loops over n run $n \\times n$ times.

## Common mistakes
- Adding nested loops instead of multiplying.

## Key takeaways
- Nested loops multiply.
- Sequential steps add.
- Keep the dominant term.

## Quick check
**Q:** What is the cost of two nested loops over n?
**A:** O(n^2).
2. Q: What do sequential steps do?
A: They add.
"""


class FlashcardCardTest(unittest.TestCase):
    def test_buttons_carry_the_card_index(self):
        front = json.loads(flashcard_front("Big-O", {"front": "f", "back": "b"}, 2, 5).content[1].metadata["card_payload"])
        flip = front["root"]["children"][-1]["children"][0]["action"]["selection"]
        self.assertEqual(flip, {"action": "flip", "i": 2})
        back = json.loads(flashcard_back("Big-O", {"front": "f", "back": "b"}, 2, 5).content[1].metadata["card_payload"])
        marks = [b["action"]["selection"] for b in back["root"]["children"][-1]["children"]]
        self.assertEqual(marks, [{"action": "mark", "i": 2, "knew": "yes"}, {"action": "mark", "i": 2, "knew": "no"}])

    def test_lesson_offers_practice_when_there_is_a_deck(self):
        payload = json.loads(lesson_card("Big-O", "worked_example", parse_lesson(LESSON, "worked_example")).content[1].metadata["card_payload"])
        self.assertIn("Practice 2 flashcards", json.dumps(payload))


class LessonTest(unittest.TestCase):
    def test_splits_chat_text_from_card_parts(self):
        lesson = parse_lesson(LESSON, "worked_example")
        self.assertIn("### Worked example\n1. Two nested loops over n run n × n times.", lesson["markdown"])
        self.assertIn("### Common mistakes", lesson["markdown"])
        self.assertNotIn("Key takeaways", lesson["markdown"])  # those go on the card
        self.assertEqual(lesson["takeaways"], ["Nested loops multiply.", "Sequential steps add.", "Keep the dominant term."])
        self.assertEqual(lesson["deck"][1], {"front": "What do sequential steps do?", "back": "They add."})

    def test_flashcards_move_to_the_card(self):
        md = LESSON.replace("## Worked example\n1. Two nested loops over n run $n \\times n$ times.",
                            "## Flashcards\nQ: a?\nA: 1\nQ: b?\nA: 2\nQ: c?\nA: 3")
        lesson = parse_lesson(md, "flashcards")
        self.assertNotIn("Flashcards", lesson["markdown"])
        self.assertEqual([c["front"] for c in lesson["deck"]], ["a?", "b?", "c?"])  # quick check isn't appended

    def test_rejects_a_lesson_without_its_core(self):
        with self.assertRaises(ValueError):
            parse_lesson(LESSON, "diagram")

    def test_qa_pairs_ignore_unpaired_lines(self):
        self.assertEqual(qa_pairs("Q: one?\nnoise\nQ: two?\nA: 2"), [{"front": "two?", "back": "2"}])


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
        self.assertEqual([c["name"] for c in snapshot_rows(SNAP["concepts"])], ["Heaps", "Big-O", "Arrays", "Graphs"])
        url, ratio = snapshot_image("Data Structures", SNAP, 7)
        self.assertIn("exam%20in%207%20days%20%C2%B7%203%20of%204%20concepts%20tested%20%C2%B7%202%20due%20for%20review", url)
        self.assertIn("r=Heaps~0.10~10%25", url)
        self.assertIn("r=Graphs~0~%E2%80%93", url)  # untested: empty bar, no made-up percentage
        self.assertEqual(ratio, "1080:460")

    def test_home_card_links_the_garden(self):
        msg = home_card("DS", SNAP, 3, garden="https://garden.example/?u=agent1qx&course=7")
        self.assertIn("[Open your garden](https://garden.example/?u=agent1qx&course=7)", msg.content[0].text)

    def test_cards_are_valid(self):
        q = {"question": "Which is O(1)?", "choices": ["a", "b", "c", "d"], "correct_index": 2, "explanation": "e"}
        for msg in (home_card("DS", SNAP, 3, "Insight."), question_card("Big-O", "diagnostic", q, 1, 5),
                    feedback_card(q, 1, 0.35, 0.2, "Big-O", "Next question", "next"),
                    lesson_card("Big-O", "worked_example", parse_lesson(LESSON, "worked_example")),
                    flashcard_front("Big-O", {"front": "f", "back": "b"}, 0, 3, "Knew it · mastery 20% → 40%"),
                    flashcard_back("Big-O", {"front": "f", "back": "b"}, 0, 3),
                    flashcard_summary("Big-O", 2, 3, 1, 0.2, 0.6)):
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
