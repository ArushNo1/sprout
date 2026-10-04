# Architecture

What shipped, as of October 3, 2026. The product plan described five agents; this is the three-agent version that's live.

## Request path

1. A student messages **Sprout** in ASI:One (Agent Chat Protocol). Sprout acknowledges right away, in the background, because a hosted agent's acknowledgement takes seconds to deliver.
2. `orchestrator/routing.py` picks a specialist:
   - **Card taps** go back to whoever sent the card. There's no database lookup, since taps are most of the traffic.
   - **"Looks right" on a course map** goes to the curriculum, then the tutor opens the new course.
   - **A pasted syllabus** or "add a course" goes to the curriculum.
   - **"Forget my course"** goes to the tutor's confirmation card.
   - **Everything else** goes to the tutor if the student has an active course, otherwise to the curriculum.
3. Sprout runs that specialist's `on_chat` in-process (`relay.run_in_process`). The specialist's messages go straight to the student, minus its own acknowledgement.
4. The specialist reads and writes **SpacetimeDB** over HTTP (`sprout_db.py`):
   - Reducers handle writes, SQL handles reads.
   - One kept-alive HTTPS session is shared across calls.
   - Retries are safe: a write is only repeated when it provably didn't reach the database.

Each turn logs its time and how much of it went to the database, e.g. `-> tutor (card tap 'home') in 4.3s, 5 database calls taking 0.7s`.

## Why in-process

The first version relayed every turn to separately hosted tutor and curriculum agents. The agent logs showed each hosted-agent hop costing 5–10 s even for trivial work, and a card tap took three hops (about 22 s). Running the skills inside Sprout makes it one hop (about 9 s, most of it Agentverse's own overhead). The standalone agents still run the same code for direct chats and for other orchestrators, through the `SproutRelay` protocol.

## Where the learning science lives

| Concern | Where | Notes |
| --- | --- | --- |
| Mastery (BKT) | `record_attempt` reducer | Per-concept `pInit/pLearn/pSlip/pGuess` |
| Review schedule (SM-2) | `record_attempt` | Capped at the day before the exam |
| Teaching format (Thompson sampling) | `format_weight` table, `compute_next_step` | Updated by check, practice and review answers that carry a format |
| What to study next | `compute_next_step` | Weakest unlocked concept; prerequisites solid at 0.7 |
| BKT parameter fitting | `mastery/fit_params.py` (offline, pyBKT) | Writes through `set_concept_params` (not yet published to `sprout-live`) |
| Labels and course progress | `mastery/bkt.py` (`mastery_label`, `subject_mastery`) | Pure functions |

The agents never compute mastery themselves: they call reducers and display what comes back.

## What students see

| Card | Built by |
| --- | --- |
| Upload, concept map | `curriculum/cards.py` |
| Progress (with a link to the garden), journey map with tappable next topics, question, feedback, lesson, one-at-a-time flashcards, session summary, course mastered, forget-course confirmation | `tutor/cards.py` |
| Progress, map and journey images | `cards/` on Vercel (`/api/card`, `/api/journey`), drawn with @vercel/og |
| Knowledge garden | `web/` (Next.js on Vercel) at `/<learner>/garden`; reads `sprout-live` on the server |

## Deploying

`uagents-python/build_hosted.py` builds what each hosted agent runs:

- **Sprout:** six files (`agent.py`, `tutor_skill.py`, `curriculum_skill.py`, `sprout_db.py`, `relay.py`, `routing.py`).
- **Standalone specialists:** one file each.

Hosted agents read secrets from the `.env` in their editor.
