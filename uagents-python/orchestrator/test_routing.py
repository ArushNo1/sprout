import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestrator.routing import CURRICULUM, TUTOR, card_action, choose_route

tap = lambda action, **extra: "@agent1qx " + json.dumps({"selection": {"action": action, **extra}, "approved": True})


class RoutingTest(unittest.TestCase):
    def test_new_students_go_to_curriculum(self):
        r = choose_route("", True, None, has_course=False)
        self.assertEqual((r.specialist, r.start), (CURRICULUM, True))
        self.assertEqual(choose_route("hi", False, None, False).specialist, CURRICULUM)

    def test_returning_students_go_to_tutor(self):
        for text in ("", "let's keep going", "quiz me on heaps", "hi"):
            r = choose_route(text, text == "", "tutor", has_course=True)
            self.assertEqual((r.specialist, r.start), (TUTOR, True), text)

    def test_course_setup_goes_to_curriculum(self):
        self.assertEqual(choose_route("I want to add a new course", False, "tutor", True).specialist, CURRICULUM)
        syllabus = "Week 1: limits. Week 2: derivatives. Unit 2: integrals and the midterm on Oct 9. " * 3
        r = choose_route(syllabus, False, "tutor", True)
        self.assertEqual((r.specialist, r.text, r.start), (CURRICULUM, syllabus, False))

    def test_card_taps_go_to_the_card_owner(self):
        self.assertEqual(choose_route(tap("answer", choice=2), False, TUTOR, True).specialist, TUTOR)
        r = choose_route(tap("confirm_map"), False, CURRICULUM, True)
        self.assertEqual((r.specialist, r.then), (CURRICULUM, TUTOR))
        self.assertEqual(choose_route(tap("edit_map"), False, CURRICULUM, True).then, "")

    def test_new_course_and_forget(self):
        self.assertEqual(choose_route(tap("new_course"), False, TUTOR, True).specialist, CURRICULUM)
        r = choose_route("please forget my course", False, TUTOR, True)
        self.assertEqual((r.specialist, r.text, r.start), (TUTOR, "please forget my course", False))

    def test_topic_lists_go_to_curriculum(self):
        for text in ("Row operations\nREF & RREF\nDeterminants\nEigenvalues",
                     "Row operations, REF & RREF, Determinants"):
            r = choose_route(text, False, TUTOR, True)
            self.assertEqual((r.specialist, r.text), (CURRICULUM, text))
        self.assertEqual(choose_route("quiz, review, teach me", False, TUTOR, True).specialist, TUTOR)

    def test_a_bare_topic_becomes_a_course(self):
        for text in ("linear algebra", "I want to learn organic chemistry", "AP Bio"):
            r = choose_route(text, False, None, has_course=False)
            self.assertEqual((r.specialist, r.text, r.start), (CURRICULUM, text, False), text)
        for text in ("hi", "Hello!", "help", "what can you do?"):  # chatter still gets the welcome
            r = choose_route(text, False, None, has_course=False)
            self.assertEqual((r.specialist, r.text, r.start), (CURRICULUM, "", True), text)

    def test_a_new_subject_mid_course_goes_to_curriculum(self):
        for text in ("I want to learn music theory", "i'm taking organic chemistry", "help me learn Spanish"):
            self.assertEqual(choose_route(text, False, TUTOR, True).specialist, CURRICULUM, text)
        for text in ("teach me heaps", "I want to learn more", "I need to study for my midterm", "prepare for the exam"):
            self.assertEqual(choose_route(text, False, TUTOR, True).specialist, TUTOR, text)

    def test_games(self):
        r = choose_route("let's play a kahoot game with my friends", False, TUTOR, True)
        self.assertEqual((r.specialist, r.text, r.start), (TUTOR, "let's play a kahoot game with my friends", False))
        self.assertEqual(choose_route("play a game", False, TUTOR, False).specialist, CURRICULUM)  # no course yet
        self.assertEqual(choose_route(tap("game"), False, TUTOR, True).specialist, TUTOR)
        for text in ("let's play meteor blaster", "quiz runner please", "make me a video game"):
            r = choose_route(text, False, TUTOR, True)
            self.assertEqual((r.specialist, r.text), (TUTOR, text))

    def test_gardens_and_cross_course_questions(self):
        for text in ("show my gardens", "which course is my weakest?", "how am I doing across my classes",
                     "all my courses", "compare my courses"):
            r = choose_route(text, False, TUTOR, True)
            self.assertEqual((r.specialist, r.text, r.start), (TUTOR, text, False), text)
        # No course yet: still the curriculum agent's job.
        self.assertEqual(choose_route("show my gardens", False, None, False).specialist, CURRICULUM)
        # A new course is still a new course.
        self.assertEqual(choose_route("add another course", False, TUTOR, True).specialist, CURRICULUM)

    def test_card_action(self):
        self.assertEqual(card_action(tap("sample")), "sample")
        self.assertIsNone(card_action("hello"))
        self.assertIsNone(card_action("[1, 2]"))


if __name__ == "__main__":
    unittest.main()
