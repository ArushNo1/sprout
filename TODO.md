# Sprout TODO

Status vs. the Product Development Plan (Oct 3, 2026). Goal: a brand-new ASI:One chat that already knows the student.

## Where we are

| Plan item | State |
| --- | --- |
| Curriculum ingestion (syllabus -> concept map) | Done: `uagents-python/curriculum`, hosted on Agentverse, with cards |
| Interactive Cards infra | Done: `cards/` on Vercel (map, button, product images) |
| Paid packs (Payment Protocol + Stripe) | Built: `uagents-python/store`, **not deployed** |
| Shared DB + schema, reducers | Built: `spacetimedb/` (learner, course, concept, mastery, attempt, session, format_weight, study_card, payment, entitlement) |
| BKT, SM-2, Thompson bandit, next-concept picker | Built twice: TS in `spacetimedb/.../algorithms.ts` (used by reducers) and Python in `mastery/` |
| Orchestrator agent (Chat Protocol, routing) | **Missing**: `uagents-python/agent.py` is still the "Sprout heard" template |
| Diagnostic quiz | **Missing** |
| Tutor / teaching agent | **Missing** |
| Quiz agent (quiz, flashcard, worked-example cards) | **Missing** |
| Knowledge snapshot, review reminder cards | **Missing** |
| Returning-session recap | **Missing** (only a new/returning check exists) |
| Garden view | Placeholder `App.tsx` (lists courses and concept counts) |
| Calendar / Canvas sync | Not started (stretch) |

## P0: the core loop (blocks the demo)

- [ ] **Decide the data layer and delete the loser.** The plan says Supabase; the team built SpacetimeDB, and `mastery/mastery_store.py` still targets Supabase. Pick SpacetimeDB, then remove or archive `mastery/` Supabase code so there is one source of truth for BKT/SM-2/bandit (the TS reducers already run them).
- [ ] **Curriculum agent writes to the DB.** It only calls `upsert_learner` today. After the user confirms a map, call `create_course` + `ingest_concept_graph` + `confirm_course`. Add the confirm/edit step (the plan's "let users confirm or edit the concept list").
- [ ] **Orchestrator agent.** Replace the template in `uagents-python/agent.py`: Chat Protocol, identify user by sender address, load state from SpacetimeDB, route to specialists, and handle "let's keep going". This is the only agent users talk to, so ASI:One discovery depends on it.
- [ ] **Agent-to-agent protocol.** Define message models for orchestrator <-> curriculum / tutor / quiz (the store already has `GetConceptMap`). Keep schemas identical across files, since uAgents matches by schema.
- [ ] **Diagnostic quiz.** 5-8 adaptive questions generated per concept, tappable quiz cards, each answer calls `record_attempt` (BKT updates live).
- [ ] **Knowledge snapshot card.** Render per-concept mastery (solid / shaky / not started) in `cards/`; show it after every answer so the live ML update is visible.
- [ ] **Tutor agent.** Call `compute_next_step`, explain the chosen concept with course context in the picked format, then a two-question check.
- [ ] **Returning-session recap.** On "let's keep going": last session summary (`end_session` / `start_session`), what's shaky, what's due, days to exam, then the next concept.
- [ ] **Hosted/persistent deployment.** Deploy each agent to Agentverse (hosted, with `build_hosted.py` bundles) or a persistent host. Verify nothing depends on local `ctx.storage`.
- [ ] **ASI:One discovery test.** Give the orchestrator a clear Agentverse name, description and keywords; confirm "help me study for my data structures midterm" routes to it. Keep the Agentverse profile link as a backup.

## P1: stretch with the highest value

- [ ] **Format adaptation in the loop.** The bandit exists in the DB; log `format_used` per teaching step and show the insight line ("worked examples raised your scores 30% more than flashcards"). Plan says never cut the simplest version.
- [ ] **Flashcard carousel, worked-example, and review-reminder cards.** Plan lists them as card types; none exist.
- [ ] **Form card** for onboarding (course name, current unit, exam date) and updating exam dates.
- [ ] **Spaced review.** SM-2 is in the DB; surface "due today" in the recap and a review reminder card.
- [ ] **Store integration.** Deploy the store agent, register `Sprout Store` in the README table, and wire the Exam Pack to the real mastery data (weak-spot drill plan, review schedule) instead of only the concept map. Resolve entitlements via `create_payment_request` / `resolve_payment` in the DB so unlocks persist and gate free vs. paid tiers (free = one course).
- [ ] **Mock-exam paid unlock demo path**: ask for a mock exam -> payment request -> pay -> exam delivered.
- [ ] **Forget a course.** Wire "forget this course" to `forget_course` (privacy requirement).
- [ ] **Error handling.** Retry failed tool/DB calls, tell the user plainly when something failed (cheap bonus area).

## P2: stretch

- [ ] **Knowledge garden web view** (`spacetimedb/src/App.tsx`): concepts as plants that grow with mastery and wilt when due. Layout hints already exist (`depth` = row, unit = column). Deploy and link it from the chat.
- [ ] **Calendar / Canvas sync** for exam dates (cut first if time runs short).
- [ ] **Embedding concept graph** (plan lists embeddings; currently LLM extraction only). Low priority.
- [ ] **BKT parameter tuning** from real attempts; PDF lecture-slide ingestion.

## Submission checklist (missing any of the first six = ineligible)

- [ ] All agents registered on Agentverse (curriculum is; orchestrator and store are not)
- [ ] Orchestrator implements the Agent Chat Protocol (done in curriculum and store; do it in the orchestrator)
- [ ] Discoverable and usable through ASI:One
- [ ] Full primary workflow works inside ASI:One (onboarding -> quiz -> teach -> new-chat recap)
- [ ] Public GitHub repo with run and test instructions (root README is still the agent template; rewrite it)
- [ ] README lists every agent's name and address, plus extra resources (cards Vercel URL, SpacetimeDB, Stripe)
- [ ] Innovation Lab and hackathon badges in **each** agent's README (none yet)
- [ ] Demo video, 3-5 min, plus a recorded backup
- [ ] Devpost submission
- [ ] Register through the MHacks ASI:One Submission Agent
- [ ] Claim ASI:One Pro / Agentverse Premium with code `MHACKS26MHACKSAV`

## Demo prep

- [ ] Pre-seed a demo account with two days of history (`seed_demo` reducer exists; check it covers the CS persona and an exam date)
- [ ] Pre-test the concept extraction on the real demo syllabus (`curriculum/examples/data_structures_syllabus.txt`)
- [ ] Test 3-5 hackers: time to first useful help, and whether the second session needs re-explaining
- [ ] Rehearse the 4-minute script: hook, onboarding, live ML (wrong answer drops Big-O to shaky), new-chat moment, adaptation, garden

## Housekeeping

- [ ] Rewrite root `README.md` (still template deploy steps; keep the agents table)
- [ ] Remove or repurpose `uagents-python/test-agent.py` and the template `agent.py` once the orchestrator lands
- [ ] Tests: add integration tests for the DB client and the orchestrator routing; run `mastery/` and `spacetimedb` (`npm test`) tests in CI
- [ ] Store `SPACETIMEDB_TOKEN` as a registered agent token (`register_agent`), not the owner token, before deploying
- [ ] Add a short `docs/architecture.md` matching what was actually built (5 agents vs. what shipped)
