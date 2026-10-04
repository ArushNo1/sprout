"""Building blocks every Sprout agent's cards share: the ChatMessage wrapper, buttons, tap parsing,
and links to the card images and the web app.

A tapped button comes back as text JSON {"selection": {<inputs>, "action": ...}, "approved": true}.
Text-only replies end the chat session, or ASI:One doesn't show them.
"""

import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlencode
from uuid import uuid4

import requests

from uagents_core.contrib.protocols.chat import ChatMessage, EndSessionContent, MetadataContent, TextContent

CARDS_URL = os.getenv("SPROUT_CARDS_URL", "https://sprout-cards-six.vercel.app")


# The Next.js site in web/: garden at /<learner>/garden, games at /play, /host, /arcade.
WEB_URL = (os.getenv("SPROUT_WEB_URL") or os.getenv("SPROUT_GARDEN_URL") or "https://sproutlearn.tech").rstrip("/")
# The first garden site, kept as a fallback. It reads the learner from ?u= instead of the path.
FALLBACK_URL = "https://sprout-garden-seven.vercel.app"
_SITE = {"url": None, "checked": 0.0}


def site_ready(url: str) -> bool:
    """Whether the web/ site at `url` is up and reading the same database the agents write to
    (its /api/health says so). A site that can't reach the database shows empty gardens and
    "game not found", so links only go there once this passes."""
    try:
        r = requests.get(f"{url}/api/health", timeout=5)
        body = r.json() if r.status_code == 200 else {}
    except (requests.RequestException, ValueError):
        return False
    return bool(body.get("ok")) and body.get("db") == os.getenv("SPACETIMEDB_DB", "sprout-live")


def web_url() -> str:
    """The site links should point at: WEB_URL when it's healthy, else the fallback site. Checked at
    most every 10 minutes, so the agents switch over by themselves when the site is deployed."""
    if time.time() - _SITE["checked"] > 600:
        _SITE.update(url=WEB_URL if "sprout-garden" in WEB_URL or site_ready(WEB_URL) else FALLBACK_URL,
                     checked=time.time())
    return _SITE["url"]


CARD_WIDTH = "560"


def text_message(text: str) -> ChatMessage:
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(),
                       content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")])


def _card(text: str, root: dict) -> ChatMessage:
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=[
        TextContent(type="text", text=text),
        MetadataContent(type="metadata", metadata={
            "card_protocol_version": "1",
            "requires_card_interaction": "true",
            "card_kind": "custom",
            "card_payload": json.dumps({"root": root}),
            "preferred_drawer_width_px": CARD_WIDTH,
        }),
    ])


def parse_selection(text: str) -> dict:
    """Card replies are JSON text, sometimes after an @mention. Returns {} for plain chat."""
    text = (text or "").strip()
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


def _button(label: str, action: str, primary: bool = False, **extra) -> dict:
    return {"type": "button", "label": label, "primary": primary, "action": {"selection": {"action": action, **extra}}}


def _row(*buttons) -> dict:
    return {"type": "group", "direction": "row", "gap": 8, "children": [b for b in buttons if b]}


def _section(*children) -> dict:
    return {"type": "section", "children": [c for c in children if c]}


def garden_link(address: str, course_id: int) -> str:
    """The live knowledge garden (web/) for this student and course."""
    site = web_url()
    if "sprout-garden" in site:
        return f"{site}/?{urlencode({'u': address, 'course': course_id})}"
    return f"{site}/{quote(address, safe='')}/garden?{urlencode({'course': course_id})}"


def gardens_link(address: str) -> str:
    """The all-courses garden overview (web/)."""
    site = web_url()
    if "sprout-garden" in site:
        return f"{site}/?{urlencode({'u': address})}"
    return f"{site}/{quote(address, safe='')}/garden"


def clip_label(text: str, n: int = 30) -> str:
    return text if len(text) <= n else text[:n - 1].rstrip() + "…"


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"
