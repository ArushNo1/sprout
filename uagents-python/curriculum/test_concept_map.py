import json
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from curriculum.concept_map import extract_json, mentions_exam_date, normalize

EXAMPLE = Path(__file__).parent / "examples" / "data_structures.raw.json"


class NormalizeTest(unittest.TestCase):
    def test_example_order_respects_prerequisites(self):
        m = normalize(json.loads(EXAMPLE.read_text()))
        pos = {cid: i for i, cid in enumerate(m["order"])}
        self.assertEqual(len(pos), len(m["concepts"]))
        for e in m["edges"]:
            self.assertLess(pos[e["from"]], pos[e["to"]])

    def test_messy_llm_output(self):
        raw = {
            "course": "Intro ML",
            "concepts": [
                {"name": "Linear Algebra", "unit": "Math"},
                {"name": "Gradient Descent", "unit": "Optimization"},
                {"name": "linear algebra"},  # duplicate name
                {"name": "Backprop", "unit": "Optimization", "kind": "weird"},
            ],
            "edges": [
                {"from": "Linear Algebra", "to": "Gradient Descent", "confidence": 0.9},
                {"from": "gradient-descent", "to": "backprop", "confidence": 0.8},
                {"from": "backprop", "to": "linear-algebra", "confidence": 0.2},  # closes a cycle
                {"from": "backprop", "to": "backprop"},  # self-loop
                {"from": "ghost", "to": "backprop"},  # dangling
                {"from": "Linear Algebra", "to": "Gradient Descent", "confidence": "high"},
            ],
        }
        m = normalize(raw)
        self.assertEqual(m["course"]["name"], "Intro ML")
        self.assertEqual([c["id"] for c in m["concepts"]],
                         ["linear-algebra", "gradient-descent", "backprop"])
        self.assertEqual([(e["from"], e["to"]) for e in m["edges"]],
                         [("linear-algebra", "gradient-descent"), ("gradient-descent", "backprop")])
        self.assertEqual([c["depth"] for c in m["concepts"]], [0, 1, 2])
        self.assertEqual(m["concepts"][2]["kind"], "concept")
        self.assertEqual([u["id"] for u in m["units"]], ["math", "optimization"])

    def test_extract_json_from_fenced_reply(self):
        reply = 'Here is the map:\n```json\n{"concepts": [{"name": "A"}]}\n```\nDone.'
        self.assertEqual(extract_json(reply)["concepts"][0]["name"], "A")

    def test_exam_date_only_when_syllabus_has_one(self):
        self.assertTrue(mentions_exam_date("Midterm: October 22"))
        self.assertTrue(mentions_exam_date("Final exam 12/9"))
        self.assertFalse(mentions_exam_date("Unit 1: Big-O. Unit 2: Trees. Final project."))
        self.assertFalse(mentions_exam_date("Week of Oct 5: heaps"))  # a date, but no exam

    def test_rejects_empty_map(self):
        with self.assertRaises(ValueError):
            normalize({"concepts": []})


if __name__ == "__main__":
    unittest.main()
