# Sprout Tutor

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

Hosted agent `@blank-agent-183` (`agent1qfd9vn03a5udss62gpl9nag9r6qljz9td0ngmrdfzea70csvk04hwpc5upy`). Its chat logic (`skill.py`) also runs inside the Sprout agent, which is what students normally talk to.

Teaches from each student's course in Sprout's SpacetimeDB database, so a new chat starts where the last one ended. The database does the learning science (BKT mastery, SM-2 reviews, prerequisites, Thompson sampling over formats); the tutor writes questions and lessons with the ASI:One model and shows them as cards.

## What a student sees

1. **Progress card.** Mastery bars (tested concepts weakest first; untested ones show a dash, never a made-up number), days to the exam, what's due, last session's recap, the best teaching format once there's evidence, and a link to the live knowledge garden. Its game, arcade and journey buttons go to the Arcade and Garden agents. A returning student with reviews due is told so first.
2. **Diagnostic quiz.** 5 questions on the concepts `compute_next_step('diagnostic')` picks.
3. **Lessons.** The big idea, how it works, a core section in the format the bandit picks (worked example, diagram, analogy or flashcards), common mistakes, key takeaways, then "Practice 4 flashcards", "Check my understanding" or "Explain it another way".
4. **Flashcards.** One at a time: question, Show answer, then Knew it / Didn't know, recorded as practice so mastery updates. A summary offers to go over the misses.
5. **Reviews.** Up to 3 questions on concepts SM-2 says are due.
6. **Done for today.** A session summary card (score, what moved, next review) and a recap saved for the next chat.
7. **Forget my course.** A confirmation card, then `forget_course` deletes the course and its history.

## Files

- `skill.py`: the chat flow (`on_chat`) and each student's place in it
- `cards.py`: every tutor card
- `agent.py`: runs `skill.py` as a standalone agent

Shared with the other agents, one level up: `learning.py` (database reads and writes), `content.py` (question and lesson prompts; questions are validated and shuffled, lessons parsed into sections, math kept as plain text), `cardkit.py`, `sprout_db.py`.

## Run and test

From `uagents-python/`, with `ASI_ONE_API_KEY`, `TUTOR_SEED` and the `SPACETIMEDB_*` settings in `.env`:

```bash
python -m tutor.agent
python -m unittest tutor.test_tutor
```

`python build_hosted.py tutor` writes `dist/tutor/agent.py` for the hosted copy.
