# Sprout product demo script

Target runtime: **3 minutes 30 seconds**

## Ashmith — Opening · 0:00–0:32

“Students do not need another chatbot that forgets them. They need to know what to study next.

Sprout is an adaptive study partner inside ASI:One. It maps a course, diagnoses missing foundations, teaches the next concept, schedules review, and resumes from the same learner state in every new chat.”

## Arush — From syllabus to course graph · 0:32–1:02

“Sprout is not a single prompt. Its orchestrator reads each request and routes it to the specialist that owns the task. Here, the Curriculum agent turns the syllabus into concepts and prerequisite links, removes broken references and cycles, and saves a draft graph in SpacetimeDB. Only when the student confirms that graph does it activate the course, create the mastery records, and hand the workflow to the Tutor.”

## Pranav — The adaptive learning engine · 1:02–1:58

“Now the Tutor asks the backend what should happen next. SpacetimeDB filters out locked concepts, then chooses the weakest one the student is ready to learn. A Thompson-sampling policy selects worked examples, flashcards, diagrams, or analogies based on what has worked before. The model writes the lesson, but it does not choose the path.

When the student marks ‘Didn’t know,’ the Tutor records one attempt. Our Bayesian Knowledge Tracing model is trained on attempt history to fit each concept’s starting mastery, learning, slip, and guess rates. Those fitted parameters update the student’s probability of mastery. In the same transaction, SM-2 turns that new state into a spaced-repetition date, the format policy updates its evidence, and the attempt is logged. Every specialist then sees the new learner state.”

## Nish — Memory and shared state · 1:58–2:56

“Closing the chat removes the conversation, not the learning state. In a fresh ASI:One conversation, Sprout recognizes a returning learner and routes the request back to the Tutor. The Tutor rebuilds the session from the shared graph: the active course, mastery for each concept, upcoming reviews, the last-session recap, and the next eligible topic. The student never has to explain where they left off.

Arcade is another specialist over the same learner graph. It selects weak concepts, writes and checks questions, creates the room, and issues a shared code. SpacetimeDB owns the timer, answers, scoring, and standings. Each screen subscribes to that state, so one update redraws both views. The course owner’s answers pass through the same mastery update used by the Tutor.”

## Ashmith — Architecture and close · 2:56–3:30

“These features look different, but they all run through one system. Fetch.ai provides Agentverse discovery, the Agent Chat Protocol, ASI:One, and interactive cards. Sprout routes each task across four specialists: Curriculum, Tutor, Garden, and Arcade. SpacetimeDB gives them shared memory and decision logic. Models generate the content; database reducers enforce prerequisites, mastery, reviews, and multiplayer state.

Sprout turns ‘I should study’ into one clear next action, based on what the student actually knows.”
