# Sprout (orchestrator)

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

Hosted agent `@blank-agent-184` (`agent1q27e9dntmewremft08ehnpdd7davz8kgy7dz744gr87q9jfqvewuq2h7q4g`): the one agent students talk to in ASI:One.

| Student does | Handled by |
|---|---|
| Opens Sprout with no course yet, pastes a syllabus, or asks to add a course | Curriculum (upload card, map card) |
| Opens a new chat with an active course, or says "let's keep going", "quiz me", "review" | Tutor (progress card, questions, lessons) |
| Taps a button on a card | Whichever skill sent that card |
| Taps "Looks right" on a course map | Curriculum confirms it, then the tutor opens the course |
| Says "forget my course" | Tutor's confirmation card |

## In-process, not relayed

Sprout imports the tutor and curriculum chat handlers (`tutor/skill.py`, `curriculum/skill.py`) and runs them itself through `relay.run_in_process`, so a card tap is one hosted-agent hop instead of three (Sprout → specialist → Sprout). Set `SPROUT_IN_PROCESS=0` to relay to the separately hosted agents instead (`relay.py`'s `StudentTurn` / `StudentReplies`, accepted only from `TRUSTED_ORCHESTRATORS`).

Each turn logs how long it took and how much of that was the database.

## Files

- `routing.py`: which skill handles a message (`test_routing.py`)
- `agent.py`: chat protocol, routing, in-process run or relay (`test_inprocess.py`)

## Run and test

From `uagents-python/`, with `ORCHESTRATOR_SEED`, `ASI_ONE_API_KEY` and the `SPACETIMEDB_*` settings in `.env`:

```bash
python -m orchestrator.agent
python -m unittest orchestrator.test_routing orchestrator.test_inprocess
```

`python build_hosted.py sprout` writes the six files of the hosted agent to `dist/sprout/`.
