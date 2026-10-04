import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from arcade import game
from arcade.cards import arcade_card, game_card, results_card
from cardkit import ordinal, parse_selection

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
        reducer, address, course_id, title, mode, template, seconds, key, questions = call.call_args.args
        self.assertEqual((reducer, address, course_id, mode, template, seconds), ("create_game", "agent1me", 3, "live", "", 20))
        self.assertGreaterEqual(len(key), 16)
        self.assertEqual(g["code"], "NEWNEW")
        self.assertEqual(g["host"], f"https://play.test/host/NEWNEW?k={key}")
        self.assertEqual(g["self"], f"https://play.test/play/NEWNEW?k={key}")
        self.assertEqual(g["join_display"], "play.test/play")

    def test_arcade_game_links(self):
        rows = [{"code": "ARC234", "created_at": [9]}]
        with mock.patch.object(game, "call") as call, mock.patch.object(game, "sql", return_value=rows) as sql, \
                mock.patch.object(game, "PLAY_URL", "https://play.test"):
            g = game.create_game("agent1me", 3, "DSA review", [], "arcade", "meteor")
        self.assertEqual(call.call_args.args[4:6], ("arcade", "meteor"))
        self.assertIn("status = 'arcade'", sql.call_args.args[0])
        self.assertEqual(g["self"], f"https://play.test/arcade/ARC234?k={call.call_args.args[7]}")
        self.assertEqual((g["join"], g["join_display"]), ("https://play.test/arcade/ARC234", "play.test/arcade/ARC234"))
        self.assertNotIn("host", g)

    def test_arcade_card(self):
        g = {**game.game_links("ARC234", "secretkey", "arcade"), "arcade": "Quiz Runner"}
        msg = arcade_card("DSA", g, 8, ["Big-O"], ("meteor", "Meteor Blaster"))
        self.assertIn("**Quiz Runner**", msg.content[0].text)
        self.assertIn(g["self"], msg.content[0].text)
        payload = json.loads(msg.content[1].metadata["card_payload"])
        kids = payload["root"]["children"]
        self.assertIn("arcade=Quiz%20Runner", kids[0]["src"])
        actions = [b["action"]["selection"] for row in kids[2:] for b in row["children"]]
        self.assertEqual(actions[:2], [{"action": "game_results", "code": "ARC234"}, {"action": "arcade", "template": "meteor"}])
        self.assertNotIn("secretkey", json.dumps(payload))

    def test_card_has_links_image_and_buttons(self):
        g = game.game_links("ABC234", "secretkey")
        msg = game_card("DSA", g, 8, 20, ["Big-O", "Heaps"])
        text = msg.content[0].text
        self.assertIn("**ABC234**", text)
        self.assertIn(g["host"], text)
        self.assertIn(g["self"], text)
        payload = json.loads(msg.content[1].metadata["card_payload"])
        kids = payload["root"]["children"]
        self.assertIn("/api/game?", kids[0]["src"])
        self.assertIn("code=ABC234", kids[0]["src"])
        self.assertIn("t=Big-O", kids[0]["src"])
        actions = [b["action"]["selection"] for row in kids[2:] for b in row["children"]]
        self.assertEqual([a["action"] for a in actions], ["game_results", "game", "home"])
        self.assertEqual(actions[0]["code"], "ABC234")
        self.assertNotIn("secretkey", json.dumps(payload))


ROWS = {
    "game": [{"id": 9, "course_id": 3, "mode": "live", "status": "finished", "question_count": 3, "created_at": [100]}],
    "player": [{"id": 1, "name": "Ada", "score": 2100, "correct_count": 3, "learner_address": None, "joined_at": [1]},
               {"id": 2, "name": "Me", "score": 900, "correct_count": 1, "learner_address": "agent1me", "joined_at": [2]},
               {"id": 3, "name": "Bob", "score": 900, "correct_count": 1, "learner_address": None, "joined_at": [3]}],
    "concept": [{"id": 4, "name": "Big-O"}, {"id": 5, "name": "Heaps"}],
    "game_question": [{"concept_id": 4, "correct_index": 0, "choice_counts": [3, 0, 0, 0]},
                      {"concept_id": 5, "correct_index": 1, "choice_counts": [2, 1, 0, 0]},
                      {"concept_id": 5, "correct_index": None, "choice_counts": []}],
    "attempt": [{"concept_id": 4, "p_before": 0.2, "p_after": 0.4, "created_at": [150]},
                {"concept_id": 4, "p_before": 0.4, "p_after": 0.6, "created_at": [160]},
                {"concept_id": 5, "p_before": 0.5, "p_after": 0.3, "created_at": [50]}],  # an older game
}


def fake_sql(query):
    table = query.split(" FROM ")[1].split()[0]
    return [dict(r) for r in ROWS[table]]


class ArcadeChoiceTest(unittest.TestCase):
    def test_named_game_is_honored(self):
        import asyncio
        from datetime import datetime, timezone
        from uuid import uuid4
        from uagents_core.contrib.protocols.chat import ChatMessage, TextContent
        from arcade import skill
        seen = []
        async def fake_handle(ctx, sender, action, sel):
            seen.append((action, sel.get("template")))
        class Ctx:
            async def send(self, *a): pass
            logger = None
        with mock.patch.object(skill, "handle", fake_handle), mock.patch.object(skill, "enabled", return_value=True):
            for text in ("let's play meteor blaster", "quiz runner please", "make me a video game"):
                msg = ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=[TextContent(type="text", text=text)])
                asyncio.run(skill.on_chat(Ctx(), "agent1me", msg))
        self.assertEqual(seen, [("arcade", "meteor"), ("arcade", "runner"), ("arcade", "")])


class ResultsTest(unittest.TestCase):
    def test_standings_concepts_and_what_moved(self):
        with mock.patch.object(game, "sql", side_effect=fake_sql):
            res = game.results("agent1me", "ABC234")
        self.assertEqual([(p["name"], p["rank"]) for p in res["players"]], [("Ada", 1), ("Me", 2), ("Bob", 2)])
        self.assertEqual(res["me"]["name"], "Me")
        self.assertEqual([(c["name"], round(c["share"], 2)) for c in res["concepts"]], [("Heaps", 0.33), ("Big-O", 1.0)])
        self.assertEqual(res["moved"], [{"name": "Big-O", "from": 0.2, "to": 0.6}])

    def test_missing_game(self):
        with mock.patch.object(game, "sql", return_value=[]):
            self.assertIsNone(game.results("agent1me", "NOPE00"))

    def test_results_card(self):
        with mock.patch.object(game, "sql", side_effect=fake_sql):
            res = game.results("agent1me", "ABC234")
        msg = results_card("DSA", res)
        self.assertEqual(msg.content[0].text, "Game over. You came 2nd with 900 points.")
        payload = json.loads(msg.content[1].metadata["card_payload"])
        flat = json.dumps(payload)
        self.assertIn("/api/podium?", flat)
        self.assertIn("me=1", payload["root"]["children"][0]["src"])
        self.assertIn("Big-O: 20% \\u2192 60%", flat)
        self.assertIn("Hardest for the group: Heaps (33% of answers right)", flat)
        review = [b for row in payload["root"]["children"] if row.get("type") == "group" and row.get("direction") == "row"
                  for b in row["children"] if b.get("type") == "button"]
        self.assertEqual(review[0]["action"]["selection"], {"action": "teach", "concept_id": 5})

    def test_unfinished_and_empty_games(self):
        with mock.patch.object(game, "sql", side_effect=fake_sql):
            res = game.results("agent1me", "ABC234")
        res["status"] = "question"
        self.assertIn("still going", results_card("DSA", res).content[0].text)
        self.assertIn("Nobody joined", results_card("DSA", {**res, "players": []}).content[0].text)

    def test_arcade_results_wording(self):
        with mock.patch.object(game, "sql", side_effect=fake_sql):
            res = game.results("agent1me", "ABC234")
        res.update(mode="arcade", status="arcade")
        msg = results_card("DSA", res)
        self.assertEqual(msg.content[0].text, "You're 2nd on the board with 900 points.")
        payload = json.loads(msg.content[1].metadata["card_payload"])
        self.assertIn("title=High%20scores", payload["root"]["children"][0]["src"])
        res["template"] = "runner"
        flat = json.dumps(json.loads(results_card("DSA", res).content[1].metadata["card_payload"]))
        self.assertIn('{"action": "arcade", "template": "runner"}', flat)

    def test_ordinal(self):
        self.assertEqual([ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 103)],
                         ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd"])


if __name__ == "__main__":
    unittest.main()
