"""Small client for Sprout's SpacetimeDB database, shared by the Python agents.

Writes go through reducers, reads through SQL (see spacetimedb/API.md).
Env: SPACETIMEDB_HOST (default Maincloud), SPACETIMEDB_DB, SPACETIMEDB_TOKEN.
"""

import os
from datetime import date, datetime, time, timezone

import requests

HOST = os.getenv("SPACETIMEDB_HOST", "https://maincloud.spacetimedb.com").rstrip("/")
DB = os.getenv("SPACETIMEDB_DB", "sprout-live")
TIMEOUT = 20


class DbError(RuntimeError):
    """A reducer rejected the call or the database couldn't be reached."""


def enabled() -> bool:
    return bool(os.getenv("SPACETIMEDB_TOKEN"))


def _headers() -> dict:
    return {"Authorization": f"Bearer {os.environ['SPACETIMEDB_TOKEN']}"}


# ---- argument encoding (SpacetimeDB's JSON format) ----

def some(value):
    return {"some": value}


NONE = {"none": []}


def opt(value):
    """Option argument: {"some": v} or {"none": []}."""
    return NONE if value is None or value == "" else some(value)


def timestamp(value):
    """A date, datetime or YYYY-MM-DD string as a SpacetimeDB timestamp (UTC midnight for dates)."""
    if isinstance(value, str):
        value = date.fromisoformat(value)
    if isinstance(value, date) and not isinstance(value, datetime):
        value = datetime.combine(value, time(0), tzinfo=timezone.utc)
    micros = int(value.timestamp() * 1_000_000)
    return {"__timestamp_micros_since_unix_epoch__": micros}


# ---- calls ----

def call(reducer: str, *args):
    try:
        r = requests.post(f"{HOST}/v1/database/{DB}/call/{reducer}", json=list(args),
                          headers=_headers(), timeout=TIMEOUT)
    except requests.RequestException as err:
        raise DbError(f"{reducer}: {err}") from err
    if not r.ok:
        raise DbError(f"{reducer}: {r.text.strip()[:300]}")


def _decode(value):
    """SQL results return options as [0, value] (some) or [1, []] (none)."""
    if isinstance(value, list) and len(value) == 2 and value[0] in (0, 1) and (value[0] == 0 or value[1] == []):
        return value[1] if value[0] == 0 else None
    return value


def sql(query: str) -> list:
    try:
        r = requests.post(f"{HOST}/v1/database/{DB}/sql", data=query, headers=_headers(), timeout=TIMEOUT)
    except requests.RequestException as err:
        raise DbError(f"sql: {err}") from err
    if not r.ok:
        raise DbError(f"sql: {r.text.strip()[:300]}")
    result = r.json()[0]
    names = [e["name"]["some"] for e in result["schema"]["elements"]]
    return [dict(zip(names, (_decode(v) for v in row))) for row in result["rows"]]


def sql_str(text: str) -> str:
    """A SQL string literal."""
    return "'" + str(text).replace("'", "''") + "'"
