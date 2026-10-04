# Sprout Arcade: multiplayer study games

A student asks Sprout for a game ("make a game for my study group", or taps Play a game on a card). An agent builds a Kahoot/Gimkit-style quiz from the concepts that student is weakest on, creates a live room in SpacetimeDB, and replies with a card holding a join code and a Vercel link. Friends join from their phones, everyone plays in real time, and every answer from a Sprout learner feeds the same mastery model the tutor uses.

## What we take from Nexus, and what we don't

Nexus (`ArushNo1/Nexus`, `nexus-agent/`) generates a whole single-player game per lesson:

- A LangGraph pipeline: game planner (picks one of 10 Kaplay templates and designs one add-on mechanic) → design evaluator (loops back up to 3 times) → implementation planner → game coder (Gemini Pro writes the full HTML) → game player (runs it headless in Puppeteer, loops back to the coder up to 5 times).
- Output is one self-contained Kaplay HTML file stored in Supabase (`html_src`) and shown in a sandboxed iframe (`app/lessons/[id]/page.tsx`).
- A run takes minutes and several large model calls.

That design doesn't fit live multiplayer. A Kahoot room has to open in seconds, and model-written netcode would break in front of judges. So we split the job:

- **Hand-built game shell.** The multiplayer client, the timer and the scoring are written once, tested, and deployed to Vercel. They never get generated.
- **Generated content.** The agent only writes the questions and an optional theme, borrowing two Nexus ideas: a writer → evaluator loop for quality, and a headless browser playtest, used as a CI smoke test instead of per game.
- **Optional solo mode (stretch).** Nexus's `quizrunner` Kaplay template, filled with the same questions, gives a single-player arcade game for students without a group.

## How it fits together

```
ASI:One chat ──► Sprout (orchestrator)
                   │  "play a game" / Play button
                   ▼
              Arcade agent ── writes questions (ASI:One model) ──► evaluator pass
                   │  create_game reducer (agent-only)
                   ▼
              SpacetimeDB (sprout-live): game, player, answer tables, scheduled tick
                   ▲                              ▲
   host screen /host/CODE              players /g/CODE   (Vercel app: sprout-play)
                   │
   end of game ──► record_attempt for linked Sprout learners ──► BKT, SM-2 and bandit update
                   ▼
              Sprout sends a results card in chat
```

## 1. Database (additive changes to the existing module)

Put the new tables in the existing module in `spacetimedb/spacetimedb/src`, not a separate one, so game answers can update mastery directly. The changes only add tables and reducers. Arush reviews them before anything is published to `sprout-live`.

Tables:

| Table | Public | Purpose |
| --- | --- | --- |
| `game` | yes | `id`, `code` (6 letters), `host_address`, `course_id`, `mode` (`classic` or `gold`), `status` (`lobby`, `question`, `reveal`, `finished`), `question_index`, `question_started_at`, `seconds_per_question`, `created_at` |
| `game_question` | yes | `game_id`, `index`, `concept_id`, `prompt`, `choices`, plus `correct_index`, which stays empty until the reveal |
| `game_answer_key` | **no** | `game_id`, `index`, `correct_index`, `explanation`. Private, so players can't read answers off the wire |
| `player` | yes | `game_id`, `identity`, `name`, `score`, `gold`, `streak`, `learner_address` (set when the link came from Sprout) |
| `player_answer` | yes | `game_id`, `index`, `player identity`, `choice`, `correct`, `ms_to_answer`, `points` |
| `player_upgrade` | yes | gold mode only: `multiplier`, `streak_bonus`, `insurance` levels |
| `game_tick` | scheduled | drives timeouts: question → reveal → next question |

Reducers:

- `create_game(host_address, course_id, mode, questions_json)`: registered agents only (`requireAgent`). Writes the game in the `lobby` state and the questions, with answers stored in the private key table.
- `join_game(code, name, learner_address?)`: anyone can call it. It caps names, rejects duplicates, and only allows joining while the game is in the lobby or between questions.
- `start_game` and `next_question`: the host's identity only.
- `submit_answer(choice)`: one answer per player per question. Points are computed on the server from server timestamps, Kahoot-style: up to 1000 points, scaled by how fast the answer came. Clients can't send their own score.
- `reveal` runs on the `game_tick` schedule when time is up or everyone has answered. It copies `correct_index` into `game_question` and updates streaks.
- `buy_upgrade(kind)`: gold mode only, allowed only between questions.
- `finish_game`: for each player with a `learner_address`, it runs the same BKT, SM-2 and bandit update as `record_attempt`, with a new attempt kind `game`, one per answered question. It does this by calling a shared function, so the logic isn't copied.

Pure functions (`scorePoints`, `goldFor`, `upgradeCost`) go in `algorithms.ts` with vitest tests, like the existing BKT and SM-2 code.

## 2. Arcade agent (Python, `uagents-python/arcade/`)

- Triggers: free text ("make a game", "quiz battle", "study group game"), a Play a game button on the progress card, and the journey map (section 4).
- Picking concepts: due reviews first, then the lowest `p_mastered` among tested concepts, then the next untested concepts on the map. Default is 10 questions spread across 3–5 concepts.
- Writing questions: one batch call to the ASI:One model, validated with the tutor's existing `clean_question` (it shuffles choices, removes duplicates and converts math to plain text). Then one evaluator call, the Nexus idea in a cheap form: a second prompt flags wrong, ambiguous or too-easy questions, and those get rewritten once or dropped. Target time is 10–15 s, not Nexus's minutes.
- Creating the room: call the `create_game` reducer through `sprout_db.py`, then reply with an Arcade card. The card shows the course, a big join code, the mode, and buttons for Host on this screen, Copy invite and Change mode. The chat text above the card carries the links:
  - `https://sprout-play.vercel.app/host/CODE` for the host
  - `https://sprout-play.vercel.app/g/CODE?u=<learner address>` to share. `u` links a Sprout student's answers to their mastery.
- Results: an `on_interval` handler checks every 30 s for finished games this agent created, then sends the host a results card. It shows the podium, the concepts the group missed most, and "your mastery: Big-O 52% → 71%". It has buttons for Review the missed concepts (hands off to the tutor) and Rematch.
- Speed: this lives inside Sprout like the tutor and curriculum (the merge we agreed on). It's also deployed as its own hosted agent with a `CreateGame` protocol, so the multi-agent story holds. Creating a game is a one-off wait of about 15 s, so the extra hop is acceptable here, unlike for flashcard taps.

## 3. Play site (Vercel project `sprout-play`)

A Vite + React app built on the SpacetimeDB React hooks and generated bindings in `spacetimedb/src`. It's deployed like `sprout-cards`.

- `/g/CODE`, the player on a phone:
  1. enter a name
  2. lobby with the player list
  3. question with 4 big colored answer tiles and a countdown computed from `question_started_at`
  4. "Correct, +870" or "Not quite", with the explanation
  5. leaderboard
  6. final podium
- `/host/CODE`, the host on a laptop or projector: the large question, a live count of who has answered, an answer histogram at the reveal, the leaderboard, and the Start / Next buttons.
- Gold mode (Gimkit-style): correct answers earn gold. Between questions, a shop sells a multiplier, a streak bonus and insurance (a wrong answer loses nothing). The winner has the most gold when the time runs out.
- Style: the same cream and green with Instrument Serif as the chat cards. Colors come from `cards/lib/render.js` and fonts from `cards/fonts`. It must work at phone width.
- Each subscription is filtered to the one game (`WHERE game_id = …`), so clients only receive their own room's rows.

## 4. Journey map with clickable next topics

The map card becomes the "your learning journey" design. Each concept is a rounded box:

- done concepts in faded green
- the current concept in dark green with white text
- the next unlocked concepts in tan
- arrows for prerequisites

Vercel renders the image (a new `/api/journey` route next to `/api/card`). Images in cards can't be tapped, so under the image the card gets one button per unlocked next concept (for example "Row Operations" and "REF & RREF"), plus Play a game. Tapping a concept sends `{"action": "teach", "concept_id": N}`. The tutor then teaches that concept instead of the database's pick, still using the format the bandit chooses. This needs `teach` to accept an optional concept id. Unlocked means every prerequisite is at or above `PREREQ_SOLID` (0.7), which is the same rule the database uses.

## 5. Testing

- vitest for scoring, gold and upgrade math, plus the reducer rules: one answer per question, no answers after the reveal, answers hidden until the reveal.
- Python tests for question selection and the evaluator filter. These use fake model replies, like the existing tutor tests.
- A Playwright smoke test that opens one host and three players against a local SpacetimeDB and plays a full 3-question game. It adapts Nexus's `puppeteer_runner.py` idea and runs in CI.
- A live check in ASI:One: ask Sprout for a game, join from two phones, finish, and see the results card and the mastery change.

## 6. Build order

| Step | Work | Rough time |
| --- | --- | --- |
| 1 | Tables, reducers, scheduled tick and tests; publish to `sprout-live` after Arush reviews | 3 h |
| 2 | Arcade agent: concept selection, question batch and evaluator, `create_game`, Arcade card | 2 h |
| 3 | Play site: player and host flows for classic mode; deploy to Vercel | 3–4 h |
| 4 | Mastery hook in `finish_game`, results card, Rematch | 1.5 h |
| 5 | Journey map card with clickable next topics | 1.5 h |
| 6 | Gold mode and shop | 2 h |
| 7 | Stretch: solo Kaplay mode from Nexus's `quizrunner` template, shown in a sandboxed iframe at `/arcade/ID` | 2–3 h |

Steps 1–4 make a complete demo: a chat request, a live multiplayer game, and the mastery update showing up in the next chat.

## Open questions for the team

- Should game answers count as full evidence for mastery? Self-rated flashcards already move mastery a lot (20% → 55% after one "Knew it"). A `game` attempt kind could use a lower learn rate.
- Can players without a Sprout account join? The plan says yes; they just don't get mastery updates.
- Who owns publishing module changes to `sprout-live`? Today that's Arush, with the owner token.
