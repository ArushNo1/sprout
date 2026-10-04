"""Small client for Sprout's SpacetimeDB database, shared by the Python agents.

Writes go through reducers, reads through SQL (see spacetimedb/API.md).
Env: SPACETIMEDB_HOST (default Maincloud), SPACETIMEDB_DB, SPACETIMEDB_TOKEN.
"""

import os
import time as time_module
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

RETRY_DELAYS = (0.3, 1.0)  # seconds before the 2nd and 3rd tries
SESSION = requests.Session()  # keeps the HTTPS connection open between calls instead of a new TLS handshake each time
STATS = {"calls": 0, "seconds": 0.0}  # running totals, for timing logs
UNPROCESSED = (502, 503)   # the request never reached the database


def _post(url: str, what: str, safe: bool, **kwargs) -> requests.Response:
    """POST with retries. Reads are always safe to repeat; a reducer call is only repeated when it
    can't have run (connection refused, 502/503), so an answer is never recorded twice."""
    for attempt in range(len(RETRY_DELAYS) + 1):
        started = time_module.monotonic()
        try:
            r = SESSION.post(url, headers=_headers(), timeout=TIMEOUT, **kwargs)
            if r.status_code not in UNPROCESSED and not (safe and r.status_code >= 500):
                return r
            err = f"HTTP {r.status_code}"
        except requests.ConnectionError as e:
            err = e
        except requests.RequestException as e:  # a timeout: a reducer may already have run
            if not safe:
                raise DbError(f"{what}: {e}") from e
            err = e
        finally:
            STATS["calls"] += 1
            STATS["seconds"] += time_module.monotonic() - started
        if attempt < len(RETRY_DELAYS):
            time_module.sleep(RETRY_DELAYS[attempt])
    raise DbError(f"{what}: {err}")


def call(reducer: str, *args):
    r = _post(f"{HOST}/v1/database/{DB}/call/{reducer}", reducer, safe=False, json=list(args))
    if not r.ok:
        raise DbError(f"{reducer}: {r.text.strip()[:300]}")


def _decode(value):
    """SQL results return options as [0, value] (some) or [1, []] (none)."""
    if isinstance(value, list) and len(value) == 2 and value[0] in (0, 1) and (value[0] == 0 or value[1] == []):
        return value[1] if value[0] == 0 else None
    return value


def sql(query: str) -> list:
    r = _post(f"{HOST}/v1/database/{DB}/sql", "sql", safe=True, data=query)
    if not r.ok:
        raise DbError(f"sql: {r.text.strip()[:300]}")
    result = r.json()[0]
    names = [e["name"]["some"] for e in result["schema"]["elements"]]
    return [dict(zip(names, (_decode(v) for v in row))) for row in result["rows"]]


def sql_str(text: str) -> str:
    """A SQL string literal."""
    return "'" + str(text).replace("'", "''") + "'"
