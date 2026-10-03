"""ASI:One interactive cards for the curriculum agent.

Cards render inline in a direct chat with the agent. ASI:One draws inputs and
buttons in its own style, so the Sprout look comes from PNGs served by the
sprout-cards Vercel project (see ../cards). Card images must be http(s) URLs.

A submitted card comes back as a text message holding JSON:
{"selection": {<input values>, "action": ...}, "approved": true}
"""

import json
import os
from datetime import date, datetime, timezone
from urllib.parse import quote, urlencode
from uuid import uuid4

from uagents_core.contrib.protocols.chat import ChatMessage, EndSessionContent, MetadataContent, TextContent

CARDS_URL = os.getenv("SPROUT_CARDS_URL", "https://sprout-cards-six.vercel.app")
CARD_WIDTH = "560"
MAX_ROWS = 12

SAMPLE_COURSE = "Data Structures and Algorithms"
SAMPLE_SYLLABUS = """Unit 1: Foundations
Week 1: Big-O notation, asymptotic analysis, recursion review
Week 2: Arrays and ArrayLists, amortized analysis of resizing
Week 3: Singly and doubly linked lists, circular linked lists
Unit 2: Linear ADTs
Week 4: Stacks and queues (array-backed and linked), deques
Week 5: Iterators and the Iterable interface
Unit 3: Trees
Week 6: Binary trees, tree traversals (preorder, inorder, postorder, level-order)
Week 7: Binary search trees: search, add, remove
Week 8: Heaps and priority queues, heapify (build heap in O(n))
Week 9: AVL trees and rotations; 2-4 trees
Midterm: October 22
Unit 4: Hashing and Sorting
Week 10: HashMaps, hash functions, collision handling (external chaining, linear probing)
Week 11: Simple sorts (bubble, insertion, selection); merge sort, quick sort; stability
Week 12: Pattern matching (Boyer-Moore, KMP)
Unit 5: Graphs
Week 13: Graph representations, BFS, DFS
Week 14: Dijkstra's shortest path, minimum spanning trees (Prim, Kruskal)"""


def text_message(text: str) -> ChatMessage:
    """A plain reply. It ends the session: ASI:One didn't show text-only replies that left it open."""
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")],
    )


def card_message(text: str, root: dict) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=text),
            MetadataContent(
                type="metadata",
                metadata={
                    "card_protocol_version": "1",
                    "requires_card_interaction": "true",
                    "card_kind": "custom",
                    "card_payload": json.dumps({"root": root}),
                    "preferred_drawer_width_px": CARD_WIDTH,
                },
            ),
        ],
    )


def parse_selection(text: str) -> dict:
    """Card replies arrive as JSON text, sometimes after an @mention. Returns {} for plain chat."""
    text = text.strip()
    if text.startswith("@"):
        text = text.split(None, 1)[1] if " " in text else ""
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    selection = data.get("selection", data)
    return selection if isinstance(selection, dict) and selection.get("action") else {}


def _button(label: str, action: str, primary: bool = False) -> dict:
    return {"type": "button", "label": label, "primary": primary, "action": {"selection": {"action": action}}}


def upload_card(course_name: str = "", exam_date: str = "", syllabus: str = "") -> ChatMessage:
    def field(name, kind, label, placeholder=None, default="", **extra):
        f = {"type": "input", "name": name, "kind": kind, "label": label, **extra}
        if placeholder:
            f["placeholder"] = placeholder
        if default:
            f["default"] = default
        return f

    root = {
        "type": "section",
        "children": [
            {"type": "image", "src": f"{CARDS_URL}/header.png", "alt": "Sprout, it grows with you", "aspect_ratio": "1080:300"},
            field("course_name", "text", "Course", "CS 1332 Data Structures", course_name),
            field("exam_date", "date", "Next exam", default=exam_date),
            field("syllabus", "text", "Syllabus or topic list",
                  "Paste the schedule, units, or lecture topics", syllabus, multiline=True),
            {"type": "group", "direction": "row", "gap": 8, "children": [
                _button("Build my map", "build_map", primary=True),
                _button("Try a sample", "sample"),
            ]},
        ],
    }
    return card_message("Add a course and I'll map what to learn first.", root)


def _days_until(exam_date):
    try:
        days = (date.fromisoformat(exam_date) - date.today()).days
    except (TypeError, ValueError):
        return None
    return days if days >= 0 else None


def map_card_url(cmap: dict) -> str:
    counts = {u["id"]: 0 for u in cmap["units"]}
    for c in cmap["concepts"]:
        counts[c["unit"]] = counts.get(c["unit"], 0) + 1
    most = max(counts.values()) or 1
    course = cmap["course"]
    days = _days_until(course.get("exam_date"))
    code = course.get("code")
    subtitle = " · ".join(filter(None, [
        code if code and code.lower() not in course["name"].lower() else None,
        f"{len(cmap['concepts'])} concepts",
        f"exam in {days} days" if days is not None else None,
    ]))
    params = [("title", course["name"]), ("subtitle", subtitle)]
    params += [("r", f"{u['name']}~{counts[u['id']] / most:.2f}~{counts[u['id']]}") for u in cmap["units"][:MAX_ROWS]]
    return f"{CARDS_URL}/api/card?{urlencode(params, quote_via=quote)}"


def map_card(cmap: dict) -> ChatMessage:
    rows = min(len(cmap["units"]), MAX_ROWS)
    height = 40 + 80 + 44 + 34 + rows * 58 + 30  # matches cardSize() in cards/lib/render.js
    names = {c["id"]: c["name"] for c in cmap["concepts"]}
    starts = [names[cid] for cid in cmap["order"] if next(
        c for c in cmap["concepts"] if c["id"] == cid)["depth"] == 0][:3]
    root = {
        "type": "section",
        "children": [
            {"type": "image", "src": map_card_url(cmap), "alt": f"{cmap['course']['name']} concept map",
             "aspect_ratio": f"1080:{height}"},
            {"type": "text", "style": "muted",
             "value": f"{len(cmap['edges'])} prerequisite links. Good places to start: {', '.join(starts)}."},
            {"type": "group", "direction": "row", "gap": 8, "children": [
                _button("Looks right", "confirm_map", primary=True),
                _button("Edit", "edit_map"),
            ]},
        ],
    }
    return card_message("Here's your course map. Does it look right?", root)
