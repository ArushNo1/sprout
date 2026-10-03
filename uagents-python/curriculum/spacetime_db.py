"""HTTP client for the shared Sprout SpacetimeDB database.

The `learner` table there is the source of truth for whether we've met an
address before -- never the LLM, never this agent's local `ctx.storage`.
`get_learner` is what the chat handler uses to tell a new user from a
returning one. See ../../spacetimedb/API.md and ../../spacetimedb/src/schema.ts
for the full schema and reducer list.

Env: SPACETIMEDB_HOST (default: local dev server), SPACETIMEDB_DB_NAME
(default: the deployed "sprout-0gz5d" database), SPACETIMEDB_TOKEN (an agent
token registered via `register_agent`, or the database owner's token -- see
API.md's Access section). Callers should treat failures (including a missing
token) as "SpacetimeDB is unavailable" and fail open, not crash the chat.
"""

import os
from typing import Optional

import requests

HOST = os.getenv("SPACETIMEDB_HOST", "http://127.0.0.1:3000")
DB_NAME = os.getenv("SPACETIMEDB_DB_NAME", "sprout-0gz5d")
TIMEOUT = 15


def _headers() -> dict:
    return {"Authorization": f"Bearer {os.environ['SPACETIMEDB_TOKEN']}"}


def call(reducer: str, *args) -> None:
    """Invoke a reducer. Reducers never return data; this raises on failure."""
    resp = requests.post(
        f"{HOST}/v1/database/{DB_NAME}/call/{reducer}",
        json=list(args), headers=_headers(), timeout=TIMEOUT,
    )
    if not resp.ok:
        raise RuntimeError(resp.text)


def sql(query: str) -> list:
    """Run a read-only SQL query, returned as a list of row dicts."""
    resp = requests.post(
        f"{HOST}/v1/database/{DB_NAME}/sql",
        data=query, headers=_headers(), timeout=TIMEOUT,
    )
    resp.raise_for_status()
    result = resp.json()[0]
    names = [e["name"]["some"] for e in result["schema"]["elements"]]
    return [dict(zip(names, row)) for row in result["rows"]]


def opt(value):
    """Wrap a value for a reducer's Option argument."""
    return {"none": []} if value is None else {"some": value}


def get_learner(address: str) -> Optional[dict]:
    """None if this address has no row in `learner` yet, i.e. a new user."""
    safe = address.replace("'", "''")
    rows = sql(f"SELECT address, display_name, plan FROM learner WHERE address = '{safe}'")
    return rows[0] if rows else None
