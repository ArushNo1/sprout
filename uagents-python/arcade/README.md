# Sprout Arcade

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

Agent that builds multiplayer study games. Its chat logic (`skill.py`) also runs inside the Sprout agent, which is what students normally talk to; the Sprout orchestrator routes game requests and the Live game / Arcade game / Results buttons here.

**Role in the ecosystem.** Curriculum builds the map, the Tutor teaches, the Garden shows progress, and the Arcade turns the same mastery data into something social: it reads what a student is weakest on and due for, writes a quiz on exactly that, and sends the results back into the mastery model.

## What it does

1. **Picks the concepts.** Due reviews first, then the lowest mastery among tested concepts, then the next untested ones (`game.pick_concepts`).
2. **Writes and checks the questions.** One ASI:One call per concept, in parallel, then a blind second pass answers each question and drops any whose key it disagrees with or finds ambiguous. About 6 seconds for 8 questions.
3. **Opens a room in SpacetimeDB** (`create_game`) and replies with a card: a join code, a host link for a laptop or TV, and a link to play as yourself so your answers count toward your mastery. A random per-game key, never your learner address, is what links answers to you.
4. **Two modes.** *Live game*: Kahoot-style, everyone answers together. *Arcade*: Quiz Runner or Meteor Blaster, each player at their own pace, one shared high-score board that keeps each player's best run.
5. **Results.** A podium image, your place, which concepts moved, the concept the group found hardest, and buttons to review it (handed to the Tutor) or play again.

## Files

- `skill.py`: the chat flow (`on_chat`)
- `game.py`: concept picking, question writing and checking, `create_game`, `results`
- `cards.py`: the invite, arcade and results cards
- `agent.py`: runs `skill.py` as a standalone agent

Shared code lives one level up: `cardkit.py` (card building blocks), `learning.py` (database reads), `content.py` (model calls and question cleanup), `sprout_db.py`, `relay.py`.

## Run and test

From `uagents-python/`, with `ASI_ONE_API_KEY`, `ARCADE_SEED` and the `SPACETIMEDB_*` settings in `.env`:

```bash
python -m arcade.agent
python -m unittest arcade.test_arcade
```

`python build_hosted.py arcade` writes `dist/arcade/agent.py` for the hosted copy.
