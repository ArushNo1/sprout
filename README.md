# Sprout

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

Sprout is a study partner in ASI:One that remembers what you know. Paste a syllabus and it builds a map of the course: concepts and the order to learn them. From then on it quizzes you, teaches what you're shaky on in the format that works for you, schedules reviews before your exam, and picks up exactly where you left off in every new chat. Everything it knows about you lives in a shared SpacetimeDB database, so nothing is lost when a chat ends.

Built for MHacks 2026 (Fetch.ai track).

## Try it

Open [ASI:One](https://asi1.ai) and message **Sprout** (`@blank-agent-184`). Tap "Try a sample" if you don't have a syllabus handy.

## Agents

| Agent | Handle | Address | What it does |
| --- | --- | --- | --- |
| **Sprout** (talk to this one) | `@blank-agent-184` | `agent1q27e9dntmewremft08ehnpdd7davz8kgy7dz744gr87q9jfqvewuq2h7q4g` | The orchestrator: the Chat Protocol agent students use. Routes each turn and each card tap to the specialist that owns it and runs it in-process. [Code](uagents-python/orchestrator) |
| Sprout Tutor | `@blank-agent-183` | `agent1qfd9vn03a5udss62gpl9nag9r6qljz9td0ngmrdfzea70csvk04hwpc5upy` | Teaching: diagnostics, lessons, flashcards, reviews, session summaries. Also runs standalone. [Code](uagents-python/tutor) |
| Sprout Arcade | `Sprout Arcade` | `agent1qdvszkqcf6xz6frmegrtk95uymzayfvdcu7m8cpuajjr3vyj5zqlsxwj6dz` | Game creator: picks the concepts a student needs, writes and double-checks questions, opens live rooms and solo arcade games, reports results back into mastery. [Code](uagents-python/arcade) |
| Sprout Garden | `Sprout Garden` | `agent1qwxlahz0xv67shp4eawqh76f5le7u5hqy9tkafntaz9d4w0es07jjdary93` | Progress and the knowledge graph: the learning journey map, every course's garden, and tool-calling answers to questions across courses. Read-only. [Code](uagents-python/garden) |
| Sprout Curriculum | `@blank-agent-181` | `agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh` | Syllabus to concept map, saved to the database. Also answers `GetConceptMap` / `ParseSyllabusRequest` from other agents. [Code](uagents-python/curriculum) |

All five are hosted on Agentverse and use the Agent Chat Protocol with ASI:One interactive cards. Each has one job and its own README; they share the database and a small card toolkit, not each other's code.

## The other pieces

| Piece | Where | Code |
| --- | --- | --- |
| Shared database (BKT mastery, SM-2 reviews, Thompson sampling over teaching formats, next-concept choice) | SpacetimeDB Maincloud, database `sprout-live` | [`spacetimedb/spacetimedb`](spacetimedb/spacetimedb), reducers in [API.md](spacetimedb/API.md) |
| Card images (progress, course map, journey map) | https://sprout-cards-six.vercel.app | [`cards`](cards) |
| Knowledge garden: every concept as a plant that grows with live mastery | https://sproutlearn.tech/`<learner address>`/garden (the `web/` site) | [`web`](web) |
| Live games (Kahoot-style): Sprout writes a quiz on your weak spots, friends join with a code, and your answers update your mastery | https://sproutlearn.tech/play (same site) | [`web/components/play`](web/components/play), plan and status in [docs/games-plan.md](docs/games-plan.md) |
| Mastery models in Python: BKT parameter fitting from the attempt log, mastery labels | runs offline against `sprout-live` | [`mastery`](mastery) |

## How it fits together

```
ASI:One ──chat──► Sprout (Agentverse)
                    ├─ Curriculum: syllabus or topic → concept map → create_course / ingest_concept_graph
                    ├─ Tutor:      compute_next_step → question or lesson → record_attempt
                    ├─ Arcade:     weakest concepts → checked questions → create_game → results
                    └─ Garden:     journey map, all gardens, cross-course questions (read-only)
                               │
                               ▼
                    SpacetimeDB sprout-live  ◄── garden page subscribes live
                               ▲
                    mastery/fit_params.py fits per-concept BKT parameters offline
```

Sprout runs the four specialists' logic in the same process, so a card tap is one hosted-agent hop. The same code also runs as the standalone agents above, and the relay protocol in [`relay.py`](uagents-python/relay.py) lets any orchestrator use them remotely.

More detail: [docs/architecture.md](docs/architecture.md).

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp uagents-python/.env.example uagents-python/.env   # fill in the keys (ask the team)
cd uagents-python
python -m orchestrator.agent      # Sprout, with the tutor and curriculum in-process
python -m tutor.agent             # optional: the standalone tutor
python -m curriculum.agent        # optional: the standalone curriculum agent
```

Each agent prints an inspector link; connect it to a mailbox to reach it from ASI:One.

## Tests

```bash
cd uagents-python && python -m unittest test_cardkit orchestrator.test_routing orchestrator.test_inprocess tutor.test_tutor arcade.test_arcade garden.test_garden curriculum.test_concept_map
python -m pytest mastery                 # from the repo root
cd spacetimedb && npm test               # database algorithms and game scoring
cd web && npm test                       # graph helpers and play-site routing
```

## Deploy

- **Agents:** `cd uagents-python && python deploy_hosted.py [sprout|tutor|curriculum]` builds and uploads the files to Agentverse through its API (needs `AGENTVERSE_API_KEY`; `--dry-run` only builds). To paste by hand instead, `python uagents-python/build_hosted.py` writes the files for each hosted agent's editor: `dist/sprout/` (six files, multi-file hosted agent), `dist/tutor/agent.py` and `dist/curriculum/agent.py`. Stop the agent before editing, save, then start it. Secrets go in each agent's `.env` in the editor: `ASI_ONE_API_KEY`, `SPACETIMEDB_TOKEN`, `SPACETIMEDB_DB=sprout-live`.
- **Cards and garden:** Vercel projects `sprout-cards` (`cards/`) and `sprout-web` (`web/`, Next.js; root directory `web`). The agents link to https://sproutlearn.tech once its `/api/health` reports it is reading `sprout-live`, and to the first garden site until then.
- **Database:** `spacetime publish` from `spacetimedb/spacetimedb` (owner only).
