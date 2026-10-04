# Sprout TODO

Status vs. the Product Development Plan (Oct 3, 2026). Goal: a brand-new ASI:One chat that already knows the student.

## Where we are

| Plan item | State |
| --- | --- |
| Curriculum ingestion + confirm step | Done: `uagents-python/curriculum` saves draft/confirmed courses to SpacetimeDB |
| Shared DB (SpacetimeDB) with BKT, SM-2, Thompson bandit, next-concept picker | Done: `spacetimedb/spacetimedb/src` (`record_attempt`, `compute_next_step`, ...) |
| Tutor: progress, journey map, diagnostic, full lessons, flashcards, reviews, session summary | Live: `uagents-python/tutor` (runs inside Sprout and standalone) |
| Orchestrator (Chat Protocol, routing) | Live as Sprout `@blank-agent-184`; runs the tutor and curriculum in-process (one hop per tap) |
| Interactive Cards infra | Done: `cards/` on Vercel |
| Paid packs (Payment Protocol) | **Dropped**: no payments in the product or the pitch |
| Garden view | Live in `web/` at `/<learner>/garden`, linked from the progress card |
| Live multiplayer games + arcade | Built and deployed (play site, cards, Sprout's code): Kahoot-style `/play` + `/host`, arcade `/arcade` (Quiz Runner, Meteor Blaster from Nexus's templates), invite and results cards. **Waiting on the module publish to `sprout-live`** |
| Calendar / Canvas sync | Not started (stretch) |

## P0: make the core loop demo-ready

- [x] **Deploy and wire all three agents.** All three hosted on Agentverse with their secrets and running the current code.
- [ ] **Switch the agents to a registered agent token.** Three agent identities are registered on `sprout-live` and their tokens are in `uagents-python/.env.agents` (gitignored). Still to do: paste each into that agent's own `SPACETIMEDB_TOKEN` on Agentverse and restart it.
- [ ] **ASI:One discovery test.** Clear name, description and keywords on the orchestrator; confirm "help me study for my data structures midterm" routes to it. Keep the Agentverse profile link as a backup.
- [x] **End-to-end run in ASI:One:** paste syllabus -> confirm map -> diagnostic -> a wrong answer drops a concept to shaky -> teach -> close the chat -> new chat, "let's keep going" gets the recap (shaky, due, days to exam). Fix whatever breaks.
- [x] **Seed the demo account** (`seed_demo`): "CS 201: Data Structures" (10 concepts, 8 tested, exam in 7 days) added to the main learner (course id 5), next to the existing course.
- [x] **Pre-test extraction** on `curriculum/examples/data_structures_syllabus.txt`.
- [x] **Latency check:** a card tap is about 9 s end to end (was about 22 s) since Sprout runs the specialists in-process; ~4 s of that is Agentverse's own overhead. Each turn logs its time and database share.
- [x] **Failure handling:** retries on DB/LLM calls, and a plain message when something fails (a cheap bonus area).

## P1: high-value additions

- [ ] **Show the format insight** ("worked examples raised your scores 30% more than flashcards"). The tutor surfaces the best format once there's evidence; make sure the demo account has enough data and the line is explicit.
- [ ] **Form card** for course name / current unit / exam date (the plan's onboarding step 1) and for editing exam dates.
- [x] **Forget a course:** the `forget_course` reducer exists but no agent calls it. Add "forget this course" in chat (privacy requirement).
- [x] **Monetization: dropped.** Payments and the store agent stay removed (old code is in git history before commit `6928a1c`). Don't claim the Payment Protocol in the pitch, README or Devpost.
- [ ] **Publish `set_concept_params` and run the BKT fitter.** `mastery/` now reads and writes SpacetimeDB through `sprout_db.py` (no more Supabase). Publish the module so the new reducer exists, then run `python -m mastery.fit_params --course <id> --dry-run` once a course has 30+ answers per concept. See `mastery/README.md`.

- [ ] **Turn on games.** Publish the module to `sprout-live` (adds the game tables, arcade mode and `set_concept_params`); Sprout's hosted files are already deployed. Then ask Sprout for a game and play it from two phones.
- [x] **Game results in chat:** podium image, place, what moved, hardest concept, review / play again.

## P2: stretch

- [ ] **Gold mode** (Gimkit-style shop between questions) and a solo mode from Nexus's `quizrunner` template.

- [x] **Knowledge garden view** in `web/components/GardenView.tsx`: concepts as plants that grow with mastery and wilt when due (`depth` = row, unit = column). Deploy and link it from chat.
- [ ] **Calendar / Canvas sync** for exam dates (cut first if time runs short).
- [ ] **Embedding concept graph, BKT tuning, PDF slide ingestion** (post-hackathon roadmap).

## Submission checklist (missing any of the first six = ineligible)

- [x] All agents registered on Agentverse
- [x] Orchestrator implements the Agent Chat Protocol and is usable via ASI:One
- [ ] Full primary workflow works inside an ASI:One conversation
- [x] Public GitHub repo with run and test instructions (root `README.md`)
- [x] README lists every agent's name and address plus extras (cards and garden URLs, SpacetimeDB database)
- [x] Innovation Lab and hackathon badges in **each** agent's README (repo READMEs and all three Agentverse profile READMEs)
- [ ] Demo video, 3-5 min, plus a recorded backup
- [ ] Devpost submission
- [ ] Register through the MHacks ASI:One Submission Agent
- [ ] Claim ASI:One Pro / Agentverse Premium with code `MHACKS26MHACKSAV`

## Demo prep

- [ ] Test 3-5 hackers: time to first useful help, and whether the second session needs re-explaining
- [ ] Rehearse the 4-minute script: hook, onboarding, live ML, new-chat moment, adaptation, garden

## Housekeeping

- [x] Remove the template `uagents-python/agent.py` and `test-agent.py`
- [x] Add `docs/architecture.md` that matches what shipped (orchestrator + curriculum + tutor + SpacetimeDB, not the plan's five agents)
- [x] Run the unit tests in CI (`.github/workflows/ci.yml`: agents, mastery, `spacetimedb`, `web` tests and build)
