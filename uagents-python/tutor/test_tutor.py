import json
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cardkit import parse_selection
from content import clean_question, gives_itself_away, parse_lesson, plain_math, qa_pairs
from learning import days_until, format_insight
from tutor.cards import (explain_card, feedback_card, flashcard_back, flashcard_front, flashcard_summary, home_card, lesson_card,
                         question_card, snapshot_image, snapshot_rows)

SNAP = {"concepts": [{"name": "Big-O", "p": 0.35, "attempts": 2}, {"name": "Arrays", "p": 0.92, "attempts": 4},
                     {"name": "Heaps", "p": 0.1, "attempts": 3}, {"name": "Graphs", "p": None, "attempts": 0}],
        "due": 2, "untested": 1, "recap": "Reviewed Big-O."}


class QuestionQualityTest(unittest.TestCase):
    def test_notes_stay_with_their_choices_through_the_shuffle(self):
        raw = {"question": "Q", "choices": ["w", "x", "y", "z"], "correct_index": 2,
               "notes": ["Wrong: nw", "Wrong: nx", "Right: ny", "Wrong: nz"]}
        for seed in range(5):
            q = clean_question(raw, random.Random(seed))
            self.assertEqual(q["choices"][q["correct_index"]], "y")
            self.assertEqual(q["notes"], ["n" + c for c in q["choices"]])
        self.assertEqual(clean_question({**raw, "notes": ["only one"]})["notes"], ["", "", "", ""])

    def test_a_note_that_contradicts_the_key_is_dropped(self):
        raw = {"question": "Q", "choices": ["w", "x", "y", "z"], "correct_index": 2,
               "notes": ["Right: this is the safe formula", "Wrong: nx", "Right: ny", "no label at all"]}
        q = clean_question(raw, random.Random(0))
        notes = dict(zip(q["choices"], q["notes"]))
        self.assertEqual(notes, {"w": "", "x": "nx", "y": "ny", "z": ""})

    def test_an_answer_that_stands_out_is_rejected(self):
        base = {"question": "Q", "correct_index": 0, "notes": [""] * 4}
        self.assertTrue(gives_itself_away({**base, "choices": ["a much longer and far more detailed correct answer", "short one", "short two", "short 3"]}))
        self.assertFalse(gives_itself_away({**base, "choices": ["about the same", "about as long", "similar size", "this one too"]}))
        self.assertTrue(gives_itself_away({**base, "choices": ["x" * 80, "y" * 80, "z" * 80, "w" * 80]}))  # too long for a button


class KeyCheckTest(unittest.TestCase):
    Q = {"question": "Which midpoint avoids overflow?", "choices": ["a", "b", "c", "d"], "correct_index": 1, "notes": [""] * 4}

    def test_a_second_valid_answer_fails_the_check(self):
        import content
        from unittest import mock
        for reply, holds in (('{"correct": [1]}', True), ('{"correct": [1, 3]}', False), ('{"correct": [0]}', False),
                             ("not json", True)):  # a broken check keeps the question
            with mock.patch.object(content, "call_llm", return_value=reply):
                self.assertEqual(content.key_holds("DS", self.Q), holds, reply)

    def test_a_doubtful_question_is_rewritten(self):
        import content
        from unittest import mock
        write = json.dumps({"question": "Q?", "choices": ["aa", "bb", "cc", "dd"], "correct_index": 0})
        checks = []

        def model(prompt, **kwargs):
            if "Judge every choice" not in prompt:
                return write
            right = next(line.split(":")[0] for line in prompt.splitlines() if line.endswith(": aa"))  # choices are shuffled
            checks.append(right)
            return json.dumps({"correct": [int(right), (int(right) + 1) % 4] if len(checks) == 1 else [int(right)]})

        with mock.patch.object(content, "call_llm", side_effect=model) as llm:
            q = content.make_question("DS", {"name": "Midpoint", "summary": ""}, "check")
        self.assertEqual(llm.call_count, 4)  # written, rejected for a second valid answer, written again, accepted
        self.assertEqual(q["choices"][q["correct_index"]], "aa")


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
        kids = json.loads(question_card("Big-O", "diagnostic", q, 1, 5).content[1].metadata["card_payload"])["root"]["children"]
        self.assertEqual([b["action"]["selection"] for b in kids[2]["children"]], [{"action": "answer", "choice": i} for i in range(4)])
        self.assertEqual(kids[3]["children"][0]["action"]["selection"], {"action": "answer", "choice": "idk"})
        self.assertNotIn("Which is O(1)?", json.dumps(kids))  # the question is the chat text, not repeated in the card

    def test_long_answers_are_listed_in_full_with_letter_buttons(self):
        long = "Because the search interval is cut in half at every single step of the algorithm"
        q = {"question": "Why is `binary search` O(log n)?", "choices": [long, "b", "c", "d"], "correct_index": 0}
        kids = json.loads(question_card("Big-O", "check", q, 1, 2).content[1].metadata["card_payload"])["root"]["children"]
        self.assertEqual(kids[2]["children"][0]["value"], f"A. {long}")
        self.assertEqual([b["label"] for b in kids[3]["children"]], ["A", "B", "C", "D"])

    def test_feedback_names_the_mistake_behind_the_pick(self):
        q = {"question": "Q", "choices": ["O(n)", "O(`log n`)"], "correct_index": 1, "explanation": "Halving.",
             "notes": ["That's a scan of every element.", "Right."]}
        flat = json.dumps(json.loads(feedback_card(q, 0, 0.2, 0.18, "Binary search", "Next", "next").content[1].metadata["card_payload"]))
        self.assertIn("You chose: O(n). That's a scan of every element.", flat)
        self.assertIn("Answer: O(log n)", flat)  # backticks dropped: cards aren't Markdown
        self.assertIn("Binary search mastery: 20% \\u2192 18%", flat)
        unsure = feedback_card(q, None, 0.2, 0.18, "Binary search", "Next", "next")
        self.assertEqual(unsure.content[0].text, "No problem. Now you've seen it once.")
        self.assertNotIn("You chose", json.dumps(json.loads(unsure.content[1].metadata["card_payload"])))
        self.assertEqual(feedback_card(q, 0, 0.2, 0.18, "B", "Next", "next").content[0].text, "Not quite.")

    def test_progress_card_says_when_rows_are_hidden(self):
        many = {**SNAP, "concepts": [{"name": f"C{i}", "p": 0.5, "attempts": 1} for i in range(11)]}
        flat = json.dumps(json.loads(home_card("DS", many, 3).content[1].metadata["card_payload"]))
        self.assertIn("Showing 8 of 11 concepts", flat)
        self.assertNotIn("Showing", json.dumps(json.loads(home_card("DS", SNAP, 3).content[1].metadata["card_payload"])))

    def test_explain_card_offers_a_course_only_when_there_is_none(self):
        new = json.dumps(json.loads(explain_card("Text", "Binary Search", False).content[1].metadata["card_payload"]))
        self.assertIn('"action": "build_map"', new)
        self.assertIn('"course_name": "Binary Search"', new)
        have = json.dumps(json.loads(explain_card("Text", "Heaps", True, {"id": 4, "name": "Heaps"}).content[1].metadata["card_payload"]))
        self.assertIn('{"action": "teach", "concept_id": 4}', have)
        self.assertNotIn("build_map", have)
        pasted = json.dumps(json.loads(explain_card("Text", "Hashing", True, None, "notes " * 60).content[1].metadata["card_payload"]))
        self.assertIn("Make this a new course", pasted)  # a long paste can still become a course, on request

    def test_parse_selection(self):
        self.assertEqual(parse_selection('@agent1q {"selection": {"action": "answer", "choice": 2}, "approved": true}'),
                         {"action": "answer", "choice": 2})
        self.assertEqual(parse_selection("hello"), {})

    def test_days_until(self):
        self.assertEqual(days_until([int((1000 + 86400 * 3) * 1e6)], now=1000), 3)
        self.assertIsNone(days_until(None))


if __name__ == "__main__":
    unittest.main()
