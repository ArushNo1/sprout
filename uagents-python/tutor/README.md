# Tutor agent

Teaches from each student's course in Sprout's SpacetimeDB database, so a new chat starts where the last one ended. The database does the learning science (BKT mastery, SM-2 reviews, prerequisites, Thompson sampling over formats); this agent writes questions and lessons with the ASI:One model and shows them as cards in ASI:One.

## What a student sees

1. **Progress card.** Opening a chat shows the course's mastery bars (weakest first), days to the exam, how many concepts are due, last session's recap, and, once there's evidence, which teaching format works best for them. Students with several active courses pick one first.
2. **Diagnostic quiz.** 5 questions, each on the concept `compute_next_step('diagnostic')` picks (untested, most depended-on first). Answers go to `record_attempt` as `diagnostic`.
3. **Learn next.** `compute_next_step('teach')` picks the weakest concept whose prerequisites are solid and a format by Thompson sampling (worked example, flashcards, diagram or analogy). The agent writes the lesson in that format, then 2 check questions. Check answers are recorded with the format, which is what trains the format bandit.
4. **Review.** Up to 3 questions on concepts due by SM-2 (`compute_next_step('review')`).
5. **Done for today.** `end_session` saves a recap that opens the next chat.

Every answer card shows the concept's mastery before and after.

## Files

- `learning.py`: database reads and writes (`../sprout_db.py`)
- `content.py`: question and lesson prompts; questions are validated and their choices shuffled
- `cards.py`: progress, course picker, question, lesson and feedback cards
- `agent.py`: chat flow and per-student place in the conversation
- `build_hosted.py`: bundles everything into `dist/hosted_agent.py` for a hosted Agentverse agent

## Run locally

Needs `ASI_ONE_API_KEY`, `TUTOR_SEED` and the `SPACETIMEDB_*` settings in `uagents-python/.env`, and a confirmed course for the student (from the Curriculum agent, or `seed_demo` for the demo learner).

```bash
cd uagents-python/tutor
python agent.py
python -m unittest test_tutor
```
