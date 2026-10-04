# Sprout MHacks judging package

This package is built around one claim that the demo can prove in three minutes:

> Sprout remembers what a student knows and changes what they study next after every answer.

The main deck is `Sprout-MHacks-3-Minute-Pitch.pptx`. Slides 1–4 are the timed pitch. Slides 5–7 are backup slides for questions.

## Three-minute run of show

| Time | Screen | Action |
| --- | --- | --- |
| 0:00–0:22 | Slide 1 | Deliver the hook and name the student problem. |
| 0:22–0:48 | Slide 2 | Explain syllabus mapping and the persistent learning loop. |
| 0:48–1:58 | ASI:One | Run the prepared flashcard miss and reopen Sprout in a fresh conversation. |
| 1:58–2:34 | Slide 3 | Explain the algorithms and why SpacetimeDB is central. |
| 2:34–3:00 | Slide 4 | Close on usefulness, persistence, and the product vision. |

Do not generate a syllabus, lesson, or multiplayer game live. Those paths contain model calls and can consume the entire demo window. The prepared interaction still proves the core adaptive behavior.

## Exact pitch script

### Slide 1 — 0:00–0:22

“Students have more study material than ever, but they still have to answer the hardest question themselves: what should I study next? Sprout is an adaptive study partner inside ASI:One. It remembers what you know, finds the gap blocking your progress, and picks up where you left off in every new conversation.”

### Slide 2 — 0:22–0:48

“A student can paste a syllabus or simply name a subject. Sprout turns it into a prerequisite map, checks the foundations first, and builds a study plan around the exam. Then every answer changes three things: estimated mastery, the next review date, and which explanation format Sprout should try next.”

### Live ASI:One demo — 0:48–1:58

Begin on a prepared lesson card with its four-card practice deck available.

“Here is a lesson Sprout selected because this concept is weak and its prerequisites are ready.”

Tap the **Practice … flashcards** button, then **Show answer**, then **Didn't know**.

“That answer becomes evidence. Sprout updates this concept immediately instead of treating the conversation as disposable.”

Point to the mastery change shown on the next card. Switch to a fresh Sprout conversation and send **Let's keep going**.

“This is a separate chat. Sprout reads the same learner state, brings back the course, the weak concept, and what is due. The student does not rebuild context every time.”

If the reply is slow, say: “While that loads, the key point is that the new agent session reads the same state from SpacetimeDB.” Then return to the slides at 1:58 even if it has not appeared.

### Slide 3 — 1:58–2:34

“The intelligence is a closed loop in the backend. Bayesian Knowledge Tracing updates mastery. SM-2 schedules review before the exam. Thompson sampling learns whether worked examples, diagrams, analogies, or flashcards work better for this student. SpacetimeDB executes those updates transactionally and also runs our synchronized quiz rooms, timers, scoring, and leaderboards.”

### Slide 4 — 2:34–3:00

“That gives students one place to learn, practice with friends, and return without starting over. Fetch.ai makes Sprout discoverable and usable through conversation. SpacetimeDB makes the learner model persistent and the multiplayer experience live. Sprout turns ‘I should study’ into one clear next action, based on what the student actually knows.”

Stop. Do not add feature lists after the final sentence.

## Laptop layout

Prepare three full-screen windows in this order:

1. The deck in presentation mode on slide 1.
2. ASI:One conversation A on the prepared lesson card.
3. ASI:One conversation B as a clean, direct conversation with Sprout.

Use Command+Tab to move between them. Keep a local copy of the backup demo video open in a fourth window. Hide bookmarks, notifications, secrets, developer tools, and unrelated tabs. Disable sleep and connect power.

## Live-demo preparation

Complete this 20–30 minutes before judging:

1. Open the seeded **CS 201: Data Structures** course.
2. Tap **Learn next** and wait for the lesson.
3. Confirm the lesson contains a **Practice … flashcards** button. Leave that conversation untouched.
4. Open a second direct Sprout conversation and leave it empty.
5. Open the garden once so DNS and the deployment are warm.
6. Record the exact live flow once as a fallback.
7. Turn off notifications and close any terminal containing environment variables.

The first conversation must stay on the lesson card. If you practice the card before judging, generate another lesson so its flashcard state is fresh.

## Failure paths

| Problem | What to do |
| --- | --- |
| ASI:One reply exceeds 10 seconds | Continue narrating, then switch back to slide 3 at 1:58. |
| A card action fails | Say “Here is the same recorded flow,” and play the 35–45 second backup clip. |
| Fresh conversation does not load | Show the garden or the recorded fresh-chat result. Do not debug live. |
| Internet fails | Play the full product demo video, then use slides 3 and 4 for the technical close. |
| Multiplayer is unavailable | Mention it on slide 3 and use the backup slide. Never attempt repair during judging. |

## Judge questions to invite

- “How does one answer change the learner model?”
- “Why does this need SpacetimeDB rather than a normal chat history?”
- “How do you keep the generated quiz questions reliable?”
- “What happens when a student starts a new chat?”

The backup slides answer these directly.
