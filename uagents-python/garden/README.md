# Sprout Garden

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

Agent that shows a student where they stand. Its chat logic (`skill.py`) also runs inside the Sprout agent, which is what students normally talk to; the Sprout orchestrator routes the journey map, the all-gardens overview and progress questions here.

**Role in the ecosystem.** Every concept in Sprout is a plant that grows as mastery grows. The Garden is the read-only view of that knowledge graph: it never writes mastery, so it can answer across every course a student has without being able to change anything. Teaching is the Tutor's job, games are the Arcade's, and syllabi are Curriculum's.

## What it does

1. **Learning journey.** The concept you studied last, its prerequisites, what it unlocks and a teaser for what comes after, drawn by `cards/` at `/api/journey`, with a button for each topic you can take next (those taps go to the Tutor).
2. **All gardens.** One card with every course: solid and due counts, exam countdown, and a link to each garden and to the all-courses overview on the web app.
3. **Questions across courses.** "Which course is my weakest?", "what's due across everything?" are answered by the ASI:One model with tool calling over three read-only tools (`list_courses`, `course_progress`, `due_reviews`). The student's address is never a tool argument, so the model can only read the person it's talking to, and untested concepts are reported as "not tested" instead of a made-up number.

## Files

- `skill.py`: the chat flow (`on_chat`)
- `insights.py`: the cross-course summaries and the tool-calling loop
- `cards.py`: the journey and gardens cards
- `agent.py`: runs `skill.py` as a standalone agent

Shared code lives one level up: `cardkit.py`, `learning.py` (including `journey()`), `content.py`, `sprout_db.py`, `relay.py`.

## Run and test

From `uagents-python/`, with `ASI_ONE_API_KEY`, `GARDEN_SEED` and the `SPACETIMEDB_*` settings in `.env`:

```bash
python -m garden.agent
python -m unittest garden.test_garden
```

`python build_hosted.py garden` writes `dist/garden/agent.py` for the hosted copy.
