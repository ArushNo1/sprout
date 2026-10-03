"""Clean up an LLM-produced concept map so other agents can trust it.

The LLM gives us roughly the right shape; this module makes it exact:
slug ids, no dangling or duplicate edges, no cycles, every concept in a
unit, plus `depth` per concept and a teaching `order`. Pure Python so it
runs locally, on Agentverse, or in tests without extra packages.
"""


import json
import re
from collections import defaultdict

DEFAULT_CONFIDENCE = 0.7
KINDS = {"concept", "skill", "fact"}


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return slug or "item"


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model reply (handles ``` fences and chatter)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text[text.find("{"): text.rfind("}") + 1]
    if not candidate:
        raise ValueError("No JSON object found in model reply")
    return json.loads(candidate)


EXAM_WORDS = re.compile(r"\b(exam|midterm|final|test|quiz)\b", re.I)
DATE_WORDS = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b",
    re.I)


def mentions_exam_date(syllabus: str) -> bool:
    return bool(EXAM_WORDS.search(syllabus) and DATE_WORDS.search(syllabus))


def _unique(slug: str, taken: set[str]) -> str:
    out, n = slug, 2
    while out in taken:
        out, n = f"{slug}-{n}", n + 1
    taken.add(out)
    return out


def normalize(raw: dict) -> dict:
    course = raw.get("course") or {}
    if isinstance(course, str):
        course = {"name": course}

    # Units: keep given order, add any a concept refers to but the list missed.
    units, unit_ids, unit_alias = [], set(), {}
    for i, u in enumerate(raw.get("units") or [], start=1):
        if isinstance(u, str):
            u = {"name": u}
        name = str(u.get("name") or u.get("id") or f"Unit {i}").strip()
        uid = _unique(slugify(u.get("id") or name), unit_ids)
        unit_alias[str(u.get("id") or name)] = uid
        unit_alias[name] = uid
        units.append({"id": uid, "name": name, "order": i})

    def unit_for(ref) -> str:
        ref = str(ref or "").strip()
        if ref in unit_alias:
            return unit_alias[ref]
        if slugify(ref) in unit_ids:
            return slugify(ref)
        name = ref or "General"
        uid = _unique(slugify(name), unit_ids)
        unit_alias[ref] = uid
        units.append({"id": uid, "name": name, "order": len(units) + 1})
        return uid

    # Concepts: slug ids, dedupe by id and by name.
    concepts, concept_ids, alias = [], set(), {}
    seen_names: dict[str, str] = {}
    for c in raw.get("concepts") or []:
        if isinstance(c, str):
            c = {"name": c}
        name = str(c.get("name") or c.get("id") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen_names:  # same concept listed twice
            alias[str(c.get("id") or name)] = seen_names[key]
            continue
        cid = _unique(slugify(c.get("id") or name), concept_ids)
        seen_names[key] = cid
        alias[str(c.get("id") or name)] = cid
        alias[name] = cid
        kind = c.get("kind") if c.get("kind") in KINDS else "concept"
        concepts.append({
            "id": cid,
            "name": name,
            "summary": str(c.get("summary") or "").strip(),
            "unit": unit_for(c.get("unit")),
            "kind": kind,
            "source": c.get("source") or None,
        })
    if not concepts:
        raise ValueError("Concept map has no concepts")

    def resolve(ref):
        ref = str(ref or "")
        return alias.get(ref) or (slugify(ref) if slugify(ref) in concept_ids else None)

    # Edges: prerequisite -> dependent. Drop self-loops, dangling refs, duplicates.
    best: dict[tuple[str, str], dict] = {}
    for e in raw.get("edges") or raw.get("prerequisites") or []:
        a, b = resolve(e.get("from")), resolve(e.get("to"))
        if not a or not b or a == b:
            continue
        try:
            conf = float(e.get("confidence", DEFAULT_CONFIDENCE))
        except (TypeError, ValueError):
            conf = DEFAULT_CONFIDENCE
        conf = round(min(1.0, max(0.0, conf)), 2)
        edge = {"from": a, "to": b, "confidence": conf, "reason": e.get("reason") or None}
        if (a, b) not in best or conf > best[(a, b)]["confidence"]:
            best[(a, b)] = edge
    edges = sorted(best.values(), key=lambda e: -e["confidence"])

    # Break cycles: add edges strongest-first, skip any that would close a loop.
    kept, children = [], defaultdict(set)

    def reaches(src: str, dst: str) -> bool:
        stack, seen = [src], set()
        while stack:
            n = stack.pop()
            if n == dst:
                return True
            if n not in seen:
                seen.add(n)
                stack.extend(children[n])
        return False

    for e in edges:
        if reaches(e["to"], e["from"]):
            continue
        children[e["from"]].add(e["to"])
        kept.append(e)

    # Depth = longest prerequisite chain; order = topological, by unit then depth.
    parents = defaultdict(set)
    for e in kept:
        parents[e["to"]].add(e["from"])
    depth: dict[str, int] = {}

    def depth_of(cid: str) -> int:
        if cid not in depth:
            depth[cid] = 1 + max((depth_of(p) for p in parents[cid]), default=-1)
        return depth[cid]

    unit_rank = {u["id"]: u["order"] for u in units}
    position = {c["id"]: i for i, c in enumerate(concepts)}
    for c in concepts:
        c["depth"] = depth_of(c["id"])
    order = [c["id"] for c in sorted(
        concepts, key=lambda c: (c["depth"], unit_rank[c["unit"]], position[c["id"]])
    )]

    used_units = {c["unit"] for c in concepts}
    units = [u for u in units if u["id"] in used_units]
    for i, u in enumerate(units, start=1):
        u["order"] = i

    return {
        "version": 1,
        "course": {
            "name": str(course.get("name") or "Untitled course").strip(),
            "code": course.get("code") or None,
            "exam_date": course.get("exam_date") or None,
        },
        "units": units,
        "concepts": concepts,
        "edges": sorted(kept, key=lambda e: (order.index(e["from"]), order.index(e["to"]))),
        "order": order,
    }


def summarize(cmap: dict) -> str:
    """Short plain-text recap for the chat reply."""
    names = {c["id"]: c["name"] for c in cmap["concepts"]}
    lines = [f"{cmap['course']['name']}: {len(cmap['concepts'])} concepts, "
             f"{len(cmap['edges'])} prerequisite links."]
    for u in cmap["units"]:
        members = [names[cid] for cid in cmap["order"]
                   if next(c for c in cmap["concepts"] if c["id"] == cid)["unit"] == u["id"]]
        lines.append(f"- {u['name']}: {', '.join(members)}")
    return "\n".join(lines)
