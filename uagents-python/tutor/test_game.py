import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tutor import game
from tutor.cards import game_card, parse_selection

CONCEPTS = [
    {"id": 1, "name": "Arrays", "summary": "", "p": 0.97, "attempts": 5, "due": False},
    {"id": 2, "name": "Heaps", "summary": "", "p": 0.2, "attempts": 3, "due": False},
    {"id": 3, "name": "Graphs", "summary": "", "p": None, "attempts": 0, "due": False},
    {"id": 4, "name": "Big-O", "summary": "", "p": 0.6, "attempts": 2, "due": True},
    {"id": 5, "name": "Tries", "summary": "", "p": 0.5, "attempts": 1, "due": False},
]
RAW = {"question": "Which is fastest?", "choices": ["O(1)", "O(n)", "O(n²)", "O(2ⁿ)"],
       "correct_index": 0, "explanation": "Constant time doesn't grow."}


class PickTest(unittest.TestCase):
    def test_due_then_weakest_then_untested_then_mastered(self):
        self.assertEqual([c["id"] for c in game.pick_concepts(CONCEPTS, 5)], [4, 2, 5, 3, 1])

    def test_split_and_interleave(self):
        self.assertEqual(game.split(8, 3), [3, 3, 2])
        self.assertEqual(game.split(8, 4), [2, 2, 2, 2])
        self.assertEqual(game.split(8, 0), [])
        self.assertEqual(game.interleave([[1, 2, 3], ["a"], ["x", "y"]]), [1, "a", "x", 2, "y", 3])


class QuestionTest(unittest.TestCase):
    def test_keeps_four_short_choices(self):
        q = game.clean_game_question(RAW, 7)
        self.assertEqual(q["concept_id"], 7)
        self.assertEqual(q["choices"][q["answer"]], "O(1)")
        self.assertEqual(set(q), {"concept_id", "prompt", "choices", "answer", "explanation"})

    def test_rejects_what_wont_fit_a_timed_game(self):
        self.assertIsNone(game.clean_game_question({**RAW, "choices": RAW["choices"][:3]}, 1))
        self.assertIsNone(game.clean_game_question({**RAW, "question": "x" * 200}, 1))
        self.assertIsNone(game.clean_game_question({**RAW, "choices": ["a" * 90, "b", "c", "d"]}, 1))
        self.assertIsNone(game.clean_game_question({"question": "?"}, 1))

    def test_writes_requested_count_without_duplicates(self):
        reply = json.dumps({"questions": [RAW, RAW, {**RAW, "question": "Which is slowest?", "correct_index": 3},
                                          {"question": "bad"}]})
        with mock.patch.object(game, "call_llm", return_value=reply) as llm:
            qs = game.write_questions("DSA", {"id": 4, "name": "Big-O", "summary": "growth"}, 2)
        self.assertEqual([q["prompt"] for q in qs], ["Which is fastest?", "Which is slowest?"])
        self.assertEqual(llm.call_count, 1)

    def test_survives_unparseable_replies(self):
        with mock.patch.object(game, "call_llm", return_value="no json here"):
            self.assertEqual(game.game_questions("DSA", {"id": 4, "name": "Big-O", "summary": ""}, 2), [])

    def test_check_drops_disputed_and_ambiguous_questions(self):
        qs = [{"prompt": p, "choices": ["a", "b", "c", "d"], "answer": 1} for p in ("agree", "disagree", "vague", "skipped")]
        reply = json.dumps({"answers": [{"question": 0, "choice": 1, "ambiguous": False},
                                        {"question": 1, "choice": 2, "ambiguous": False},
                                        {"question": 2, "choice": 1, "ambiguous": True}]})
        with mock.patch.object(game, "call_llm", return_value=reply):
            self.assertEqual([q["prompt"] for q in game.check_answers("DSA", qs)], ["agree"])
        with mock.patch.object(game, "call_llm", return_value="oops"):
            self.assertEqual(game.check_answers("DSA", qs), qs)  # a failed check keeps everything


class CreateTest(unittest.TestCase):
    def test_creates_and_reads_back_the_newest_code(self):
        rows = [{"code": "OLDOLD", "created_at": [5]}, {"code": "NEWNEW", "created_at": [9]}]
        with mock.patch.object(game, "call") as call, mock.patch.object(game, "sql", return_value=rows), \
                mock.patch.object(game, "PLAY_URL", "https://play.test"):
            g = game.create_game("agent1me", 3, "DSA review", [game.clean_game_question(RAW, 4)])
        reducer, address, course_id, title, seconds, key, questions = call.call_args.args
        self.assertEqual((reducer, address, course_id, seconds), ("create_game", "agent1me", 3, 20))
        self.assertGreaterEqual(len(key), 16)
        self.assertEqual(g["code"], "NEWNEW")
        self.assertEqual(g["host"], f"https://play.test/host/NEWNEW?k={key}")
        self.assertEqual(g["self"], f"https://play.test/play/NEWNEW?k={key}")
        self.assertEqual(g["join_display"], "play.test/play")

    def test_card_has_links_and_buttons(self):
        g = game.game_links("ABC234", "secretkey")
        msg = game_card("DSA", g, 8, 20, ["Big-O", "Heaps"])
        text = msg.content[0].text
        self.assertIn("**ABC234**", text)
        self.assertIn(g["host"], text)
        self.assertIn(g["self"], text)
        payload = json.loads(msg.content[1].metadata["card_payload"])
        buttons = [c for c in payload["root"]["children"][-1]["children"]]
        actions = [parse_selection(json.dumps(b["action"]))["action"] for b in buttons]
        self.assertEqual(actions, ["game", "home"])
        self.assertNotIn("secretkey", json.dumps(payload))


if __name__ == "__main__":
    unittest.main()
