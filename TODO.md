# Sprout TODO

Status vs. the Product Development Plan (Oct 3, 2026). Goal: a brand-new ASI:One chat that already knows the student.

## Where we are

| Plan item | State |
| --- | --- |
| Curriculum ingestion + confirm step | Done: `uagents-python/curriculum` saves draft/confirmed courses to SpacetimeDB |
| Shared DB (SpacetimeDB) with BKT, SM-2, Thompson bandit, next-concept picker | Done: `spacetimedb/spacetimedb/src` (`record_attempt`, `compute_next_step`, ...) |
| Tutor agent: progress card, diagnostic, lessons, review, recap | Built: `uagents-python/tutor` |
| Orchestrator (Chat Protocol, routing, relay) | Built: `uagents-python/orchestrator`; deployment and ASI:One routing unverified |
| Interactive Cards infra | Done: `cards/` on Vercel |
| Paid packs (Payment Protocol) | **Removed**: the store agent and the payment tables were deleted upstream |
| Garden view | Placeholder `spacetimedb/src/App.tsx` (lists courses and concept counts) |
| Calendar / Canvas sync | Not started (stretch) |

## P0: make the core loop demo-ready

- [ ] **Deploy and wire all three agents.** Host orchestrator, tutor and curriculum on Agentverse; set `TRUSTED_ORCHESTRATORS`, `CURRICULUM_ADDRESS`, `TUTOR_ADDRESS` and `SPACETIMEDB_*` secrets. Use a registered agent token (`register_agent`), not the owner token.
- [ ] **ASI:One discovery test.** Clear name, description and keywords on the orchestrator; confirm "help me study for my data structures midterm" routes to it. Keep the Agentverse profile link as a backup.
- [ ] **End-to-end run in ASI:One:** paste syllabus -> confirm map -> diagnostic -> a wrong answer drops a concept to shaky -> teach -> close the chat -> new chat, "let's keep going" gets the recap (shaky, due, days to exam). Fix whatever breaks.
- [ ] **Seed the demo account** (`seed_demo`) with two days of history and an exam date; check it matches the CS persona.
- [ ] **Pre-test extraction** on `curriculum/examples/data_structures_syllabus.txt`.
- [ ] **Latency check:** "let's keep going" to first content under 10 s, now that the orchestrator relays through a specialist.
- [ ] **Failure handling:** retries on DB/LLM calls, and a plain message when something fails (a cheap bonus area).

## P1: high-value additions

- [ ] **Show the format insight** ("worked examples raised your scores 30% more than flashcards"). The tutor surfaces the best format once there's evidence; make sure the demo account has enough data and the line is explicit.
- [ ] **Form card** for course name / current unit / exam date (the plan's onboarding step 1) and for editing exam dates.
- [ ] **Forget a course:** the `forget_course` reducer exists but no agent calls it. Add "forget this course" in chat (privacy requirement).
- [ ] **Decide on monetization.** Payments and the store agent were removed, but the plan scores the Payment Protocol under Fetch.ai technology and wants one paid unlock (mock exam) in the demo. Either restore it (the old code is in git history before commit `6928a1c`) or drop the claim from the pitch and README.
- [ ] **Retire the Supabase `mastery/` package.** It duplicates the TS reducers and still targets Supabase. Delete it or move its tests to document the algorithms.

## P2: stretch

- [ ] **Knowledge garden view** in `spacetimedb/src/App.tsx`: concepts as plants that grow with mastery and wilt when due (`depth` = row, unit = column). Deploy and link it from chat.
- [ ] **Calendar / Canvas sync** for exam dates (cut first if time runs short).
- [ ] **Embedding concept graph, BKT tuning, PDF slide ingestion** (post-hackathon roadmap).

## Submission checklist (missing any of the first six = ineligible)

- [ ] All agents registered on Agentverse
- [ ] Orchestrator implements the Agent Chat Protocol and is usable via ASI:One
- [ ] Full primary workflow works inside an ASI:One conversation
- [ ] Public GitHub repo with run and test instructions. The root `README.md` is still the single-agent template (`python agent.py`); rewrite it around the three agents.
- [ ] README lists every agent's name and address (the table only has curriculum; add orchestrator and tutor) plus extras (cards Vercel URL, SpacetimeDB database)
- [ ] Innovation Lab and hackathon badges in **each** agent's README (none yet)
- [ ] Demo video, 3-5 min, plus a recorded backup
- [ ] Devpost submission
- [ ] Register through the MHacks ASI:One Submission Agent
- [ ] Claim ASI:One Pro / Agentverse Premium with code `MHACKS26MHACKSAV`

## Demo prep

- [ ] Test 3-5 hackers: time to first useful help, and whether the second session needs re-explaining
- [ ] Rehearse the 4-minute script: hook, onboarding, live ML, new-chat moment, adaptation, garden

## Housekeeping

- [ ] Remove the template `uagents-python/agent.py` and `test-agent.py`
- [ ] Add `docs/architecture.md` that matches what shipped (orchestrator + curriculum + tutor + SpacetimeDB, not the plan's five agents)
- [ ] Run the unit tests (`curriculum`, `tutor`, `orchestrator`, `spacetimedb` via `npm test`) in CI
