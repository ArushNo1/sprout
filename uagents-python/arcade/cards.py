"""ASI:One cards for the arcade agent: the game invite, the arcade invite, and the results podium."""

from urllib.parse import quote, urlencode

from uagents_core.contrib.protocols.chat import ChatMessage

from cardkit import CARDS_URL, _button, _card, _row, _section, clip_label, ordinal


def game_image(course_name: str, game: dict, questions: int, seconds: int, topics: list) -> tuple:
    """The /api/game invite: the join code as big tiles, where to join, and the topics."""
    params = [("course", course_name), ("code", game["code"]), ("join", game["join_display"]),
              ("q", questions), ("s", seconds)] + [("t", t) for t in topics[:4]]
    if game.get("arcade"):
        params.append(("arcade", game["arcade"]))
    return f"{CARDS_URL}/api/game?{urlencode(params, quote_via=quote)}", "1080:700"  # GAME_SIZE in cards/lib/render.js


def game_card(course_name: str, game: dict, questions: int, seconds: int, topics: list) -> ChatMessage:
    """A live game is ready: the invite image, plus links to host it and to play as yourself."""
    src, ratio = game_image(course_name, game, questions, seconds, topics)
    root = _section(
        {"type": "image", "src": src, "alt": f"Game code {game['code']}", "aspect_ratio": ratio},
        {"type": "text", "style": "muted",
         "value": "Open the host screen from the links above, then tap Results here when the game ends."},
        _row(_button("Results", "game_results", True, code=game["code"]), _button("Make another game", "game")),
        _row(_button("Back to my course", "home")),
    )
    text = (f"Your {course_name} game is ready. Code **{game['code']}**.\n\n"
            f"[Open the host screen]({game['host']}) on a laptop or TV and press Start when everyone's in. "
            f"[Play as you]({game['self']}) on your phone so your answers grow your garden.")
    return _card(text, root)


def arcade_card(course_name: str, game: dict, questions: int, topics: list, other: tuple) -> ChatMessage:
    """An arcade game is ready: the invite image, your link (answers count), and the link to share."""
    src, ratio = game_image(course_name, game, questions, 0, topics)
    other_key, other_name = other
    root = _section(
        {"type": "image", "src": src, "alt": f"{game['arcade']}, code {game['code']}", "aspect_ratio": ratio},
        {"type": "text", "style": "muted",
         "value": "Everyone plays at their own pace. Replay as often as you like: the board keeps your best run."},
        _row(_button("High scores", "game_results", True, code=game["code"]),
             _button(f"Try {other_name}", "arcade", template=other_key)),
        _row(_button("Live game with friends", "game"), _button("Back to my course", "home")),
    )
    text = (f"Your {course_name} arcade game is ready: **{game['arcade']}**, code **{game['code']}**.\n\n"
            f"[Play it]({game['self']}) (your answers grow your garden). "
            f"Friends play at [{game['join_display']}]({game['join']}) and land on the same high-score board.")
    return _card(text, root)


def podium_image(course_name: str, res: dict) -> tuple:
    """The /api/podium standings: the top three on a podium, then up to three more rows."""
    top = res["players"][:6]
    title = "High scores" if res.get("mode") == "arcade" else "Final results" if res["status"] == "finished" else "Standings so far"
    params = [("title", title),
              ("subtitle", f"{course_name} · {res['questions']} questions")]
    params += [("p", f"{p['rank']}~{p['score']}~{p['name']}") for p in top]
    me = next((i for i, p in enumerate(top) if res["me"] and p["id"] == res["me"]["id"]), None)
    if me is not None:
        params.append(("me", me))
    extra = max(0, len(top) - 3)
    height = 40 + 80 + 44 + 420 + (20 + extra * 58 if extra else 0) + 40  # podiumSize() in cards/lib/render.js
    return f"{CARDS_URL}/api/podium?{urlencode(params, quote_via=quote)}", f"1080:{height}"


def results_card(course_name: str, res: dict) -> ChatMessage:
    """After a game: the podium, how this student did, what moved, and the concept the group found hardest."""
    if not res["players"]:
        return _card("Nobody joined that game, so there are no results.",
                     _section(_row(_button("Make another game", "game", True), _button("Back to my course", "home"))))
    src, ratio = podium_image(course_name, res)
    me, hardest = res["me"], (res["concepts"][0] if res["concepts"] else None)
    badges = []
    if me:
        badges.append({"type": "badge", "label": f"You came {ordinal(me['rank'])} of {len(res['players'])}", "variant": "info"})
        badges.append({"type": "badge", "label": f"{me['correct_count']} of {res['questions']} right",
                       "variant": "success" if me["correct_count"] * 2 >= res["questions"] else "warning"})
    moved = [m for m in res["moved"] if m.get("to") is not None]
    root = _section(
        {"type": "image", "src": src, "alt": "Game standings", "aspect_ratio": ratio},
        {"type": "group", "direction": "row", "gap": 8, "children": badges} if badges else None,
        {"type": "heading", "value": "What moved", "level": 3} if moved else None,
        {"type": "group", "direction": "column", "gap": 6, "children": [
            {"type": "text", "style": "body", "value": f"{m['name']}: {m['from']:.0%} → {m['to']:.0%}"} for m in moved[:6]]}
        if moved else None,
        {"type": "text", "style": "muted",
         "value": f"Hardest for the group: {hardest['name']} ({hardest['share']:.0%} of answers right)"} if hardest else None,
        _row(_button(f"Review {clip_label(hardest['name'], 22)}", "teach", True, concept_id=hardest["id"]) if hardest else None,
             _button("Play again", "arcade", template=res["template"]) if res.get("mode") == "arcade" and res.get("template")
             else _button("Play again", "game")),
        _row(_button("Refresh", "game_results", code=res["code"]) if res["status"] != "finished" else None,
             _button("Back to my course", "home")),
    )
    if res.get("mode") == "arcade" and me:
        text = f"You're {ordinal(me['rank'])} on the board with {me['score']:,} points."
    elif res.get("mode") == "arcade":
        text = f"{res['players'][0]['name']} leads with {res['players'][0]['score']:,} points."
    elif res["status"] != "finished":
        text = "The game is still going. Here are the standings so far."
    elif me:
        text = f"Game over. You came {ordinal(me['rank'])} with {me['score']:,} points."
    else:
        text = f"Game over. {res['players'][0]['name']} won with {res['players'][0]['score']:,} points."
    return _card(text, root)
