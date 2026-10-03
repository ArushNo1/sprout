# Orchestrator

The one Sprout agent students talk to in ASI:One. It routes each message to a specialist and relays the specialist's replies, cards included, back to the student (`../relay.py`):

| Student does | Goes to |
|---|---|
| Opens Sprout with no course yet, pastes a syllabus, or asks to add a course | Curriculum agent (upload card, map card) |
| Opens a new chat with an active course, or says "let's keep going", "quiz me", "review" | Tutor agent (progress card, questions, lessons) |
| Taps a button on a card | Whichever agent sent that card |
| Taps "Looks right" on a course map | Curriculum confirms it, then the tutor's progress card opens |

A new chat checks the shared database for an active course, so a returning student lands on the tutor's "Welcome back" card with last session's recap, what's due and days to the exam.

## How the relay works

The orchestrator sends a specialist a `StudentTurn` (student address, text or card selection, new-chat flag). The specialist runs its normal chat handler as that student, collects the chat messages it would have sent, and returns them in a `StudentReplies`. Specialists only accept turns from addresses in `TRUSTED_ORCHESTRATORS`, and keep keying state and database rows by the student's address. Students can still chat with each specialist directly.

## Files

- `routing.py`: which specialist handles a message (tested in `test_routing.py`)
- `agent.py`: chat protocol, forwarding and relaying
- `build_hosted.py`: bundles it with `../sprout_db.py` and `../relay.py` into `dist/hosted_agent.py`

## Run locally

Set `ORCHESTRATOR_SEED`, `CURRICULUM_ADDRESS`, `TUTOR_ADDRESS` and the `SPACETIMEDB_*` settings in `uagents-python/.env`, and add the orchestrator's address to `TRUSTED_ORCHESTRATORS` for the curriculum and tutor agents.

```bash
cd uagents-python/orchestrator
python agent.py
python -m unittest test_routing
```
