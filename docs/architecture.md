# Architecture

What shipped, as of October 3, 2026. The product plan described five agents; this is the version that's live: an orchestrator plus four specialists, each with one job.

## Request path

1. A student messages **Sprout** in ASI:One (Agent Chat Protocol). Sprout acknowledges right away, in the background, because a hosted agent's acknowledgement takes seconds to deliver.
2. `orchestrator/routing.py` picks a specialist:
   - **Card taps** go to whichever agent owns the button (`ACTION_OWNER`), so one card can offer lessons, a game and the journey map. There's no database lookup, since taps are most of the traffic.
   - **"Looks right" on a course map** goes to the curriculum, then the tutor opens the new course.
   - **A pasted syllabus** or "add a course" goes to the curriculum.
   - **"Forget my course"** goes to the tutor's confirmation card.
   - **Games** ("make a game", "arcade") go to the arcade agent; **the journey map, "my gardens" and questions across courses** go to the garden agent.
   - **Everything else** goes to the tutor if the student has an active course, otherwise to the curriculum.
3. Sprout runs that specialist's `on_chat` in-process (`relay.run_in_process`). The specialist's messages go straight to the student, minus its own acknowledgement.
4. The specialist reads and writes **SpacetimeDB** over HTTP (`sprout_db.py`):
   - Reducers handle writes, SQL handles reads.
   - One kept-alive HTTPS session is shared across calls.
   - Retries are safe: a write is only repeated when it provably didn't reach the database.

Each turn logs its time and how much of it went to the database, e.g. `-> tutor (card tap 'home') in 4.3s, 5 database calls taking 0.7s`.

## The agents

| Agent | Job | Writes to the database? |
| --- | --- | --- |
| Curriculum | Turns a syllabus, topic list or one-line subject into a concept map | Creates and confirms courses |
| Tutor | Teaches: diagnostics, lessons, flashcards, reviews | Records every answer (BKT, SM-2, bandit) |
| Arcade | Builds and runs multiplayer study games | Creates game rooms; game answers update mastery through the same reducers |
| Garden | Shows progress: journey map, all gardens, cross-course questions | Never |

Shared plumbing, not shared logic: `sprout_db.py` (database client), `learning.py` (database reads), `content.py` (model calls), `cardkit.py` (card building blocks), `relay.py` (in-process and cross-agent turns).

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
| Upload, concept map (a row of seeds per unit) | `curriculum/cards.py` |
| Progress (with a link to the garden), question, feedback, lesson, one-at-a-time flashcards, session summary, course mastered, forget-course confirmation | `tutor/cards.py` |
| Journey map with tappable next topics, all-gardens overview | `garden/cards.py` |
| Game and arcade invites, results podium | `arcade/cards.py` |
| Progress, map and journey images | `cards/` on Vercel (`/api/card`, `/api/journey`), drawn with @vercel/og |
| Knowledge garden | `web/` (Next.js on Vercel) at `/<learner>/garden`; reads `sprout-live` on the server |

## Deploying

`uagents-python/build_hosted.py` builds what each hosted agent runs:

- **Sprout:** eleven files (`agent.py`, the four `*_skill.py`, the shared `sprout_db.py`, `relay.py`, `cardkit.py`, `content.py`, `learning.py`, and `routing.py`).
- **Standalone specialists:** one file each.

`deploy_hosted.py` uploads them through the Agentverse API, `create_hosted_agents.py` creates new agents, and `set_hosted_secrets.py` sets their secrets.
