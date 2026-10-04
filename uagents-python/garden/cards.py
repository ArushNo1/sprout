"""ASI:One cards for the garden agent: the learning journey map and the all-courses overview."""

from urllib.parse import quote, urlencode

from uagents_core.contrib.protocols.chat import ChatMessage

from cardkit import CARDS_URL, _button, _card, _row, _section, clip_label, garden_link, gardens_link


def journey_image(course_name: str, path: dict) -> tuple:
    """The /api/journey picture for journey(): rows of boxes and the arrows between them."""
    params = [("title", course_name), ("subtitle", "your learning journey")]
    params += [("n", f"{n['row']}~{n['state']}~{n['label']}") for n in path["nodes"]]
    params += [("e", f"{a}-{b}") for a, b in path["edges"]]
    rows = len({n["row"] for n in path["nodes"]})
    height = 40 + 80 + 44 + 44 + rows * 80 + (rows - 1) * 110 + 44  # journeyLayout() in cards/lib/render.js
    return f"{CARDS_URL}/api/journey?{urlencode(params, quote_via=quote)}", f"1080:{height}"


def journey_card(course_name: str, path: dict) -> ChatMessage:
    """The map around where the student is, with a button for each topic they can take on next."""
    src, ratio = journey_image(course_name, path)
    cid, name = path["current"]
    picks = [_button(clip_label(n), "teach", False, concept_id=c) for c, n in path["choices"][:4]]
    root = _section(
        {"type": "image", "src": src, "alt": f"{course_name} learning journey", "aspect_ratio": ratio},
        _row(_button(f"Keep going: {clip_label(name)}", "teach", True, concept_id=cid)),
        *[_row(*picks[i:i + 2]) for i in range(0, len(picks), 2)],
        _row(_button("Back to overview", "home")),
    )
    return _card(f"Here's your path through {course_name}. Pick what to learn next.", root)


def gardens_card(address: str, gardens: list) -> ChatMessage:
    """Every course with its progress and a link to its garden. `gardens` comes from tutor.gardens.gardens()."""
    lines = []
    for g in gardens:
        bits = [f"{g['solid']} of {g['concepts']} solid"]
        if g["due"]:
            bits.append(f"{g['due']} due for review")
        if g["exam_in_days"] is not None:
            bits.append(f"exam in {g['exam_in_days']} day{'s' if g['exam_in_days'] != 1 else ''}")
        lines.append(f"**{g['name']}**: {', '.join(bits)}. [Garden]({garden_link(address, g['course_id'])})")
    root = _section(
        {"type": "heading", "value": "Your gardens", "level": 2},
        *[{"type": "text", "style": "body", "value": ln} for ln in lines],
        _row(*[_button(f"Study {g['name']}"[:40], "open", len(gardens) == 1, course_id=g["course_id"]) for g in gardens[:3]]),
    )
    text = "Your gardens:\n\n" + "\n".join(f"- {ln}" for ln in lines) + f"\n\n[All gardens]({gardens_link(address)})"
    return _card(text, root)
