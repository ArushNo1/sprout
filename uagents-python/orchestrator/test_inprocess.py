import asyncio
import json
import logging
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, MetadataContent, TextContent

import orchestrator.agent as sprout
from orchestrator.routing import CURRICULUM, TUTOR

USER = "agent1qstudent"


class Storage(dict):
    def set(self, key, value):
        self[key] = value


class FakeContext:
    def __init__(self):
        self.storage, self.sent, self.logger = Storage(), [], logging.getLogger("sprout-test")

    async def send(self, destination, message):
        self.sent.append((destination, message))


def message(text: str, card: bool = False) -> ChatMessage:
    content = [TextContent(type="text", text=text)]
    if card:
        content.append(MetadataContent(type="metadata", metadata={"card_kind": "custom", "card_payload": "{}"}))
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=content)


def specialist(name: str, calls: list):
    """A stand-in chat handler: acknowledges like the real ones, then sends a card."""
    async def on_chat(ctx, user, msg):
        calls.append((name, "".join(c.text for c in msg.content if isinstance(c, TextContent))))
        await ctx.send(user, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
        await ctx.send(user, message(f"{name} card", card=True))
    return on_chat


class InProcessTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.saved = sprout.SKILLS.copy(), sprout.IN_PROCESS
        sprout.SKILLS.update({CURRICULUM: specialist(CURRICULUM, self.calls), TUTOR: specialist(TUTOR, self.calls)})
        sprout.IN_PROCESS = True

    def tearDown(self):
        sprout.SKILLS.clear()
        sprout.SKILLS.update(self.saved[0])
        sprout.IN_PROCESS = self.saved[1]

    def test_cards_go_straight_to_the_student_and_taps_return_to_their_owner(self):
        ctx = FakeContext()
        asyncio.run(sprout.forward(ctx, USER, TUTOR, text="hi"))
        to_student = [m for to, m in ctx.sent if to == USER]
        self.assertEqual(len(to_student), 1)  # the specialist's own acknowledgement is dropped
        self.assertEqual(to_student[0].content[0].text, "tutor card")
        self.assertEqual(sprout.load(ctx, USER)["cards_from"], TUTOR)

    def test_confirming_a_map_hands_off_to_the_tutor(self):
        ctx = FakeContext()
        tap = json.dumps({"selection": {"action": "confirm_map"}, "approved": True})
        asyncio.run(sprout.forward(ctx, USER, CURRICULUM, text=tap, then=TUTOR))
        self.assertEqual([name for name, _ in self.calls], [CURRICULUM, TUTOR])
        self.assertEqual(sprout.load(ctx, USER)["cards_from"], TUTOR)

    def test_a_failing_specialist_still_answers(self):
        async def broken(ctx, user, msg):
            raise RuntimeError("boom")
        sprout.SKILLS[TUTOR] = broken
        ctx = FakeContext()
        with self.assertLogs(level="ERROR"):
            asyncio.run(sprout.forward(ctx, USER, TUTOR, text="hi"))
        self.assertIn("went wrong", ctx.sent[-1][1].content[0].text)


if __name__ == "__main__":
    unittest.main()
