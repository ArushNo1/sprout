import json
import unittest
from unittest import mock

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cardkit import gardens_link
from garden import insights as G
from garden.cards import gardens_card

NOW = 1_800_000_000
DAY = 86_400 * 1_000_000


def fake_sql(query):
    if "FROM course" in query:
        return [{"id": 1, "name": "CS 201", "exam_date": [(NOW + 7 * 86_400) * 1_000_000], "created_at": [1]},
                {"id": 2, "name": "MATH 241", "exam_date": [(NOW + 3 * 86_400) * 1_000_000], "created_at": [2]},
                {"id": 3, "name": "Art History", "exam_date": None, "created_at": [3]}]
    if "FROM concept WHERE course_id = 1" in query:
        return [{"id": 10, "name": "Big-O"}, {"id": 11, "name": "Heaps"}]
    if "FROM concept WHERE course_id = 2" in query:
        return [{"id": 20, "name": "Vectors"}]
    if "FROM concept" in query:
        return []
    if "FROM mastery" in query:
        return [{"course_id": 1, "concept_id": 10, "p_mastered": 0.2, "attempts": 3, "next_review": [(NOW - 1) * 1_000_000]},
                {"course_id": 2, "concept_id": 20, "p_mastered": 0.9, "attempts": 4, "next_review": [(NOW + 5) * 1_000_000]}]
    raise AssertionError(query)


@mock.patch("garden.insights.sql", fake_sql)
@mock.patch("learning.sql", fake_sql)
class GardensTest(unittest.TestCase):
    def test_summaries_sorted_by_exam(self):
        gs = G.gardens("agent1qx", now=NOW)
        self.assertEqual([g["name"] for g in gs], ["MATH 241", "CS 201", "Art History"])  # no exam goes last
        cs = gs[1]
        self.assertEqual((cs["concepts"], cs["tested"], cs["solid"], cs["due"], cs["exam_in_days"]), (2, 1, 0, 1, 7))
        self.assertEqual(gs[0]["solid"], 1)

    def test_untested_concepts_never_get_a_number(self):
        out = G.run_tool("agent1qx", "course_progress", {"course": "cs"}, G.gardens("agent1qx", now=NOW))
        self.assertEqual([(c["concept"], c["mastery"]) for c in out["concepts"]], [("Big-O", "20%"), ("Heaps", "not tested")])

    def test_tools_only_use_the_callers_address(self):
        gs = G.gardens("agent1qx", now=NOW)
        out = G.run_tool("agent1qx", "list_courses", {"user": "agent1qsomeoneelse"}, gs)
        self.assertTrue(all("agent1qx" in c["garden_url"] and "someoneelse" not in c["garden_url"] for c in out["courses"]))

    def test_ambiguous_or_unknown_course_is_an_error_not_a_guess(self):
        gs = G.gardens("agent1qx", now=NOW)
        self.assertIn("error", G.run_tool("agent1qx", "course_progress", {"course": "zzz"}, gs))
        self.assertIn("error", G.run_tool("agent1qx", "nope", {}, gs))

    def test_due_across_courses(self):
        out = G.run_tool("agent1qx", "due_reviews", {}, G.gardens("agent1qx", now=NOW))
        self.assertEqual(out["due"], [{"course": "CS 201", "concept": "Big-O", "mastery": "20%"}])

    def test_tool_loop_feeds_results_back(self):
        replies = [
            {"content": "", "tool_calls": [{"id": "c1", "type": "function",
                                           "function": {"name": "list_courses", "arguments": "{}"}}]},
            {"content": "MATH 241 is your strongest."},
        ]
        seen = []
        def chat(messages):
            seen.append(json.loads(json.dumps(messages)))
            return replies[len(seen) - 1]
        with mock.patch.object(G, "_chat", chat), mock.patch.object(G, "gardens", return_value=G.gardens("agent1qx", now=NOW)):
            self.assertEqual(G.answer_question("agent1qx", "who is strongest?"), "MATH 241 is your strongest.")
        tool_msg = seen[1][-1]
        self.assertEqual((tool_msg["role"], tool_msg["tool_call_id"]), ("tool", "c1"))
        self.assertIn("MATH 241", tool_msg["content"])

    def test_loop_gives_up_politely(self):
        looping = {"content": "", "tool_calls": [{"id": "c", "type": "function", "function": {"name": "list_courses", "arguments": "{}"}}]}
        with mock.patch.object(G, "_chat", lambda m: looping), mock.patch.object(G, "gardens", return_value=G.gardens("agent1qx", now=NOW)):
            self.assertIn("one course at a time", G.answer_question("agent1qx", "?"))

    def test_card_lists_every_course_with_a_link(self):
        gs = G.gardens("agent1qx", now=NOW)
        msg = gardens_card("agent1qx", gs)
        text = msg.content[0].text
        for g in gs:
            self.assertIn(g["name"], text)
            self.assertIn(f"course={g['course_id']}", text)
        self.assertIn(gardens_link("agent1qx"), text)


if __name__ == "__main__":
    unittest.main()
