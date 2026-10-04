"""ASI:One interactive cards for the curriculum agent.

Cards render inline in a direct chat with the agent. ASI:One draws inputs and
buttons in its own style, so the Sprout look comes from PNGs served by the
sprout-cards Vercel project (see ../cards). Card images must be http(s) URLs.

A submitted card comes back as a text message holding JSON:
{"selection": {<input values>, "action": ...}, "approved": true}
"""

import json
import os
import time
from datetime import date, datetime, timezone
from urllib.parse import quote, urlencode
from uuid import uuid4

import requests

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


_GARDEN_IMAGE = {"ok": None, "checked": 0.0}


def garden_image_live() -> bool:
    """Whether the cards site serves /api/garden yet. Checked at most every 10 minutes, so a map card
    never shows a broken image while the cards project is a deploy behind the agents."""
    if time.time() - _GARDEN_IMAGE["checked"] > 600:
        try:
            ok = requests.get(f"{CARDS_URL}/api/garden?title=Sprout&u=Unit~0", timeout=6).status_code == 200
        except requests.RequestException:
            ok = False
        _GARDEN_IMAGE.update(ok=ok, checked=time.time())
    return bool(_GARDEN_IMAGE["ok"])


def map_card_url(cmap: dict, garden: bool = True) -> tuple:
    """The course map picture and its aspect ratio. With `garden`, /api/garden: a row of seeds per
    unit, one per concept. Otherwise the older /api/card: a bar per unit sized by its concept count."""
    counts = {u["id"]: 0 for u in cmap["units"]}
    for c in cmap["concepts"]:
        counts[c["unit"]] = counts.get(c["unit"], 0) + 1
    course = cmap["course"]
    days = _days_until(course.get("exam_date"))
    code = course.get("code")
    subtitle = " · ".join(filter(None, [
        code if code and code.lower() not in course["name"].lower() else None,
        f"{len(cmap['concepts'])} concepts",
        f"exam in {days} days" if days is not None else None,
    ]))
    units = cmap["units"][:MAX_ROWS]
    params = [("title", course["name"]), ("subtitle", subtitle)]
    if garden:
        params += [("u", f"{u['name']}~{'0' * counts[u['id']]}") for u in units]
        height = 40 + 80 + 44 + 30 + len(units) * 100 + 24 + 200 + 30  # gardenSize() in cards/lib/render.js
        return f"{CARDS_URL}/api/garden?{urlencode(params, quote_via=quote)}", f"1080:{height}"
    most = max(counts.values(), default=1) or 1
    params += [("r", f"{u['name']}~{counts[u['id']] / most:.2f}~{counts[u['id']]}") for u in units]
    height = 40 + 80 + 44 + 34 + len(units) * 58 + 30  # cardSize() in cards/lib/render.js
    return f"{CARDS_URL}/api/card?{urlencode(params, quote_via=quote)}", f"1080:{height}"


def map_card(cmap: dict, inferred: bool = False) -> ChatMessage:
    """The course map to confirm. `inferred` says the map was filled in from a topic, not a syllabus."""
    src, ratio = map_card_url(cmap, garden_image_live())
    names = {c["id"]: c["name"] for c in cmap["concepts"]}
    starts = [names[cid] for cid in cmap["order"] if next(
        c for c in cmap["concepts"] if c["id"] == cid)["depth"] == 0][:3]
    root = {
        "type": "section",
        "children": [
            {"type": "image", "src": src, "alt": f"{cmap['course']['name']} concept map", "aspect_ratio": ratio},
            {"type": "text", "style": "muted",
             "value": f"{len(cmap['edges'])} prerequisite links. Good places to start: {', '.join(starts)}."},
            {"type": "group", "direction": "row", "gap": 8, "children": [
                _button("Looks right", "confirm_map", primary=True),
                _button("Edit", "edit_map"),
            ]},
        ],
    }
    if inferred:
        return card_message(f"I didn't have a syllabus, so I filled in a standard {cmap['course']['name']} sequence "
                            "myself. Tap Edit to change anything, or Looks right to start.", root)
    return card_message("Here's your course map. Does it look right?", root)
