"""
fake_db.py — an in-memory stand-in for sprout_db, used by the tests.

Supports just the SQL the mastery package sends:
  SELECT a, b FROM table WHERE col = 1 AND col = 'text'
and records reducer calls. `record_attempt` applies the same BKT update the
real reducer does, so record_answer can read a changed p_mastered back.
"""

import re

from .bkt import update_mastery

_SELECT = re.compile(r"SELECT (?P<cols>.+?) FROM (?P<table>\w+)(?: WHERE (?P<where>.+))?$", re.S)
_COND = re.compile(r"(\w+) = ('(?:[^']|'')*'|-?\d+)")


class FakeDb:
    def __init__(self, **tables):
        self.tables = {name: [dict(r) for r in rows] for name, rows in tables.items()}
        self.calls = []
        self.queries = []
        self.fail_calls = set()

    # ---- reads ----
    def sql(self, query: str) -> list:
        self.queries.append(query)
        m = _SELECT.match(" ".join(query.split()))
        if not m:
            raise ValueError(f"FakeDb can't parse: {query}")
        cols = [c.strip() for c in m["cols"].split(",")]
        conds = []
        for col, raw in _COND.findall(m["where"] or ""):
            val = raw[1:-1].replace("''", "'") if raw.startswith("'") else int(raw)
            conds.append((col, val))
        rows = [r for r in self.tables.get(m["table"], []) if all(r.get(c) == v for c, v in conds)]
        return [dict(r) if cols == ["*"] else {c: r.get(c) for c in cols} for r in rows]

    # ---- writes ----
    def call(self, reducer: str, *args):
        self.calls.append((reducer, args))
        if reducer in self.fail_calls:
            raise RuntimeError(f"{reducer}: rejected")
        handler = getattr(self, f"_{reducer}", None)
        if handler:
            handler(*args)

    def _record_attempt(self, address, concept_id, correct, kind, fmt, session_id, question):
        concept = next(c for c in self.tables["concept"] if c["id"] == concept_id)
        key = f"{address}:{concept_id}"
        row = next((r for r in self.tables.setdefault("mastery", []) if r["key"] == key), None)
        if row is None:
            row = {"key": key, "user_address": address, "course_id": concept["course_id"],
                   "concept_id": concept_id, "p_mastered": concept["p_init"], "attempts": 0, "next_review": None}
            self.tables["mastery"].append(row)
        params = {"learn": concept["p_learn"], "slip": concept["p_slip"], "guess": concept["p_guess"]}
        row["p_mastered"] = update_mastery(row["p_mastered"], correct, params)
        row["attempts"] += 1

    def _set_concept_params(self, address, concept_id, p_init, p_learn, p_slip, p_guess):
        concept = next(c for c in self.tables["concept"] if c["id"] == concept_id)
        for col, opt in (("p_init", p_init), ("p_learn", p_learn), ("p_slip", p_slip), ("p_guess", p_guess)):
            if "some" in opt:
                concept[col] = opt["some"]
