"""Live multiplayer games (Kahoot-style) on the play site (spacetimedb/src/play).

Sprout writes a short quiz on the student's weakest and due concepts, stores it in SpacetimeDB
with create_game, and sends back a six-character join code and two links: the host screen, which
goes on a big screen and runs the game, and the student's own player link, whose answers update
their mastery. Friends join at /play with the code. The database runs the game from there: timers,
scoring and the live leaderboard all happen in reducers, and every screen follows by subscription.
"""

import json
import os
import secrets

from sprout_db import call, sql, sql_str
from .cards import GARDEN_URL
from .content import _json_object, call_llm, clean_question
from .learning import MASTERED, micros

PLAY_URL = os.getenv("SPROUT_PLAY_URL", GARDEN_URL).rstrip("/")
GAME_QUESTIONS = 8
GAME_CONCEPTS = 4
SECONDS_PER_QUESTION = 20
MAX_PROMPT = 160
MAX_CHOICE = 70


def pick_concepts(concepts: list, n: int = GAME_CONCEPTS) -> list:
    """Due reviews first, then the weakest tested concepts, then untested ones, then mastered ones."""
    def rank(c):
        p = c["p"]
        if c["due"]:
            tier = 0
        elif p is not None and c["attempts"] and p < MASTERED:
            tier = 1
        elif not c["attempts"]:
            tier = 2
        else:
            tier = 3
        return tier, p if p is not None else 0.5, c["id"]
    return sorted(concepts, key=rank)[:n]


def split(total: int, parts: int) -> list:
    """`total` questions over `parts` concepts, as evenly as possible: split(8, 3) == [3, 3, 2]."""
    return [total // parts + (i < total % parts) for i in range(parts)] if parts else []


def interleave(batches: list) -> list:
    """One question from each concept in turn, so the same topic doesn't come up twice in a row."""
    out = []
    for i in range(max((len(b) for b in batches), default=0)):
        out.extend(b[i] for b in batches if i < len(b))
    return out


def clean_game_question(raw: dict, concept_id: int):
    """A model-written question fit for a timed game, or None: four short choices, a short prompt."""
    try:
        q = clean_question(raw)
    except (ValueError, KeyError, TypeError):
        return None
    if len(q["choices"]) != 4 or len(q["question"]) > MAX_PROMPT or any(len(c) > MAX_CHOICE for c in q["choices"]):
        return None
    return {"concept_id": concept_id, "prompt": q["question"], "choices": q["choices"],
            "answer": q["correct_index"], "explanation": q["explanation"][:300]}


def write_questions(course_name: str, concept: dict, count: int) -> list:
    """Up to `count` model-written questions on one concept, cleaned for a timed game."""
    prompt = (f"Course: {course_name}\nConcept: {concept['name']}: {concept['summary']}\n\n"
              f"Write {count} different multiple-choice questions on this concept for a live quiz game "
              f"where players have {SECONDS_PER_QUESTION} seconds each. Each question should be answerable "
              f"in that time without paper: short (under {MAX_PROMPT} characters), at the level of a course "
              f"exam, testing understanding rather than wording. Give exactly 4 short choices (under "
              f"{MAX_CHOICE} characters) with exactly one correct answer, true in every case, and plausible "
              "wrong ones.\n\n"
              'Return only JSON: {"questions": [{"question": str, "choices": [str, str, str, str], '
              '"correct_index": int, "explanation": "one sentence on why the answer is right"}]}')
    good = []
    for _ in range(2):
        try:
            raw = _json_object(call_llm(prompt, temperature=0.7)).get("questions", [])
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            continue
        seen = {q["prompt"] for q in good}
        for item in raw if isinstance(raw, list) else []:
            q = clean_game_question(item, concept["id"]) if isinstance(item, dict) else None
            if q and q["prompt"] not in seen:
                good.append(q)
                seen.add(q["prompt"])
        if len(good) >= count:
            break
    return good[:count]


def check_answers(course_name: str, questions: list) -> list:
    """Keeps the questions whose answer key a second, blind pass agrees with and doesn't find
    ambiguous. A wrong key costs a player points in front of their friends, so a doubtful question
    is dropped. If the check itself fails, the questions are kept as they are."""
    if not questions:
        return []
    listing = "\n".join(f"{i}. {q['prompt']}\n" + "\n".join(f"   {j}: {c}" for j, c in enumerate(q["choices"]))
                        for i, q in enumerate(questions))
    prompt = (f"Course: {course_name}\n\nAnswer each multiple-choice question yourself. If more than one choice "
              "could reasonably be called correct, or none is, mark it ambiguous.\n\n"
              f"{listing}\n\n"
              'Return only JSON: {"answers": [{"question": int, "choice": int, "ambiguous": bool}]}')
    try:
        answers = _json_object(call_llm(prompt, temperature=0)).get("answers", [])
        verdicts = {int(a["question"]): a for a in answers if isinstance(a, dict)}
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return questions
    return [q for i, q in enumerate(questions)
            if i in verdicts and not verdicts[i].get("ambiguous") and verdicts[i].get("choice") == q["answer"]]


def game_questions(course_name: str, concept: dict, count: int) -> list:
    """`count` checked questions on one concept. Writes one spare, since the check drops some.
    Blocks on the model, so callers run it in a thread."""
    return check_answers(course_name, write_questions(course_name, concept, count + 1))[:count]


ARCADE = {"runner": "Quiz Runner", "meteor": "Meteor Blaster"}


def game_links(code: str, key: str, mode: str = "live") -> dict:
    site = PLAY_URL.split("://", 1)[-1]
    if mode == "arcade":
        return {"code": code, "self": f"{PLAY_URL}/arcade/{code}?k={key}", "join": f"{PLAY_URL}/arcade/{code}",
                "join_display": f"{site}/arcade/{code}"}
    return {"code": code, "host": f"{PLAY_URL}/host/{code}?k={key}", "self": f"{PLAY_URL}/play/{code}?k={key}",
            "join": f"{PLAY_URL}/play/{code}", "join_display": f"{site}/play"}


def results(address: str, code: str):
    """A game's standings, how the group did per concept, and how this student's mastery moved.
    None if the game is gone (games are cleared a day after they're made)."""
    games = sql(f"SELECT id, course_id, mode, template, status, question_count, created_at FROM game WHERE code = {sql_str(code)}")
    if not games:
        return None
    g = games[0]
    players = sorted(sql(f"SELECT id, name, score, correct_count, learner_address, joined_at FROM player WHERE game_id = {int(g['id'])}"),
                     key=lambda p: (-p["score"], micros(p["joined_at"])))
    rank = 0
    for i, p in enumerate(players):
        if i == 0 or p["score"] != players[i - 1]["score"]:
            rank = i + 1
        p["rank"] = rank
    names = {c["id"]: c["name"] for c in sql(f"SELECT id, name FROM concept WHERE course_id = {int(g['course_id'])}")}

    # Share of answers that were right, per concept, over the questions that were revealed.
    right, total = {}, {}
    for q in sql(f"SELECT concept_id, correct_index, choice_counts FROM game_question WHERE game_id = {int(g['id'])}"):
        counts = q["choice_counts"] or []
        if q["correct_index"] is None or not sum(counts):
            continue
        right[q["concept_id"]] = right.get(q["concept_id"], 0) + counts[q["correct_index"]]
        total[q["concept_id"]] = total.get(q["concept_id"], 0) + sum(counts)
    by_concept = sorted(({"id": c, "name": names.get(c, "a concept"), "share": right[c] / total[c]} for c in total),
                        key=lambda c: c["share"])

    # This student's mastery before their first game answer and after their last, per concept.
    start = micros(g["created_at"])
    moved = {}
    for a in sorted(sql(f"SELECT concept_id, p_before, p_after, created_at FROM attempt "
                        f"WHERE user_address = {sql_str(address)} AND kind = 'game'"), key=lambda a: micros(a["created_at"])):
        if micros(a["created_at"]) < start:
            continue
        m = moved.setdefault(a["concept_id"], {"name": names.get(a["concept_id"], "a concept"), "from": a["p_before"]})
        m["to"] = a["p_after"]
    return {"code": code, "mode": g["mode"], "template": g.get("template") or "", "status": g["status"], "questions": g["question_count"], "players": players,
            "me": next((p for p in players if p["learner_address"] == address), None),
            "concepts": by_concept, "moved": list(moved.values())}


def create_game(address: str, course_id: int, title: str, questions: list, mode: str = "live", template: str = "") -> dict:
    """Stores the game and returns its code and links. The key in the host and player links is what
    lets someone run the game or play as this student, so only the student's own chat gets it."""
    key = secrets.token_urlsafe(18)
    call("create_game", address, int(course_id), title, mode, template, SECONDS_PER_QUESTION, key, questions)
    status = "arcade" if mode == "arcade" else "lobby"
    rows = sql(f"SELECT code, created_at FROM game WHERE host_address = {sql_str(address)} AND status = '{status}'")
    newest = max(rows, key=lambda r: micros(r["created_at"]))
    return {**game_links(newest["code"], key, mode), "mode": mode, "template": template}
