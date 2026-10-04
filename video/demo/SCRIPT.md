# Sprout demo — script with motion graphics

Approved. The rendered graphics live in this folder (see README.md).

**Look:** the Sprout site and the existing launch sting. Paper background (`#fbf6ef`) with soft green light, frosted cream cards, Instrument Serif, and leaves at the corners. Concepts appear as plants: a seed when unknown, a bloom when mastered. Colours always mean the same thing. Green `#0b6122` is solid knowledge, vein green `#a4d7a2` is links and growth, amber `#e8a33d` is "ready to learn", wilt red `#b0584c` is a gap, focus blue `#1f6fb2` is the cursor or selection, and tan `#dccbb2` is empty track.

**Motion:** slow and organic. Elements ease in like growth (`power3.out`), edges draw on like roots, and nothing bounces. Every graphic stays inside the central 80% of the frame.

**Two kinds of graphic:**
- **FULL**: a full-screen 1920×1080 scene, cut in between screen recordings.
- **OVER**: a transparent overlay (ProRes 4444 `.mov` with alpha) placed on top of your own screen recording in the editor. It never redraws Sprout's UI. It only points at the real UI.

**Runtime:** the spoken script runs about **3:55** at a natural pace. The original timestamps gave the hook 12 s, but it has about 95 words (roughly 38 s). The timings below follow the words. A tighter hook is offered as option B.

---

## 0:00–0:38 · Hook

> “AI is a great study tool, but it often forgets that learning is cumulative. Your agent doesn't know whether you have the base knowledge of matrix row operations when you ask it to teach you something more complex. It assumes you already have that knowledge.
> Oftentimes, this means we end up pasting paragraphs on paragraphs, countless PDFs, and other context for our chatbot to finally end up where we are, so it can explain whatever it needs to in the best possible way. We're changing this with Sprout.”

**G01 · “Learning is cumulative”** · FULL · 0:00–0:14
A short stack of concepts grows upward like a stem: *Row operations → Matrix inverse → Determinants → Eigenvalues*. Each node unfolds as a small leaf on the stem. A generic chat bubble drops in beside the top node and asks *“Explain eigenvalues.”* The camera pushes toward the bottom node, *Row operations*. Its leaf turns wilt red and droops, and a dashed red ring pulses once around it. Text: **It assumes you already know this.**

**G02 · “The context pile”** · FULL · 0:14–0:31
A plain chat input bar sits at the bottom of the frame. Context drops into it and stacks up: paragraph cards, PDF chips (*lecture-03.pdf*, *notes.pdf*, *hw2-solutions.pdf*), and a pasted syllabus. The pile gets taller and slightly messy, while a counter in the corner ticks up: *4,812 words of context*. Each drop lands with a small squash, like paper landing. The pile wobbles once.

**G03 · Sprout wordmark** · FULL · 0:31–0:38
On “We're changing this with Sprout,” the pile is swept off-frame by one large leaf, as if by a gust of wind. The lowercase **sprout** wordmark rises from behind a mask, and its leaf grows from the final *t*. Tagline in italics: *a study partner that remembers what you know.*

> **Option B (tighter hook, ~18 s):** “AI is a great study tool, but it forgets that learning is cumulative. Ask it about eigenvalues and it assumes you know row operations. So we paste paragraphs, PDFs and notes until it finally catches up. Sprout changes that.” With this hook, G01–G03 shrink proportionally and the whole video runs about 3:35.

## 0:38–1:04 · Product in one sentence

> “Sprout is an adaptive study partner inside ASI:One. It uses five agents to map a course, diagnose missing foundations, teach the next concept, schedule review, and resume from the same learner state in every new chat.
> What's more, you can turn your subject and course topics into multiplayer games that any of your friends can join from any device, in real time, all thanks to SpacetimeDB.”

**G04 · “Five verbs”** · FULL · 0:38–0:56
A frosted card titled *Sprout · in ASI:One* sits on the left. To its right, five short lines appear one at a time, in sync with the narration. Each has a tiny plant icon that moves one growth stage further than the line before: **map the course · find the gaps · teach the next thing · schedule the review · pick up where you left off**. As the last line lands, a thin vein-green ring loops from the bottom line back to the top line. The loop says “resume”.

**G05 · “Play together”** · FULL · 0:56–1:04
The card slides left and three device outlines fan in on the right: laptop, phone, tablet. Each shows only a large join code, **4 8 2 1 9**, and a dot that turns green as it joins. A small *SpacetimeDB* label sits under a single line that connects all three devices.

## 1:04–1:34 · Arush — From syllabus to course graph

> “Sprout is not a single prompt. Its orchestrator reads each request and routes it to the specialist that owns the task. Here, the Curriculum agent turns the syllabus into concepts and prerequisite links, removes broken references and cycles, and saves a draft graph in SpacetimeDB. Only when the student confirms that graph does it activate the course, create the mastery records, and hand the workflow to the Tutor.”

**G06 · “The router”** · FULL · 1:04–1:12
A message chip, *“here's my syllabus”*, travels into a central node labelled **Sprout**. Four specialist nodes sit around it: Curriculum, Tutor, Garden, Arcade. The path lights up toward **Curriculum**, and the other three dim.

**G07 · “Clean graph”** · OVER on the syllabus-to-map recording · 1:14–1:26
Small callout tags on the right edge tick off in order: **concepts extracted ✓ · prerequisites linked ✓ · broken refs removed ✓ · cycles removed ✓**. A short insert inside the tag area shows the cleanup on a mini graph: a red edge that loops back on itself is snipped, and the graph settles into a clean tree.

**G08 · “Draft → confirmed”** · OVER on the “Looks right” tap · 1:26–1:34
A status pill in the top-right flips from *draft* (tan) to **active** (green) at the moment of the tap. Beneath it, three small lines cascade in: *course activated · mastery records created · handed to Tutor →*.

## 1:34–2:30 · Pranav — The adaptive learning engine

> “Now the Tutor asks the backend what should happen next. SpacetimeDB filters out locked concepts, then chooses the weakest one the student is ready to learn. A Thompson-sampling policy selects worked examples, flashcards, diagrams, or analogies based on what has worked before. The model writes the lesson, but it does not choose the path.
> When the student marks ‘Didn't know,’ the Tutor records one attempt. Our Bayesian Knowledge Tracing model fits each concept's starting mastery, learning, slip, and guess rates from attempt history. Those parameters update the student's probability of mastery. In the same transaction, SM-2 turns that new state into a spaced-repetition date, the format policy updates its evidence, and the attempt is logged. Every specialist then sees the new learner state.”

**G09 · “What's next?”** · FULL · 1:34–1:50 (algorithm callout 1)
A garden bed holds eight plants, each labelled with a concept and drawn at its mastery stage. Concepts whose prerequisites are unmet go grey and get a small lock. They are filtered out. Among the rest, the plants re-sort by mastery, and the weakest one is highlighted in amber: **Ready & weakest → Hash tables**. A caption at the bottom reads: *chosen by `compute_next_step` in SpacetimeDB, not by the model.*

**G10 · “Which format?”** · FULL · 1:50–2:02
Four cards: **Worked example · Flashcards · Diagram · Analogy**. Each card has a soft probability curve that wiggles as a sample is drawn. Worked example draws the highest value and rises. Label: *Thompson sampling: tries what has worked for you.* Final line: **The model writes the lesson. The database picks the path.**

**G11 · “One tap, one transaction”** · OVER on the “Didn't know” tap, then FULL · 2:02–2:30 (algorithm callout 2)
At the tap, a blue ripple appears on the real button. The graphic then takes over the frame with a single frosted card titled **record_attempt · one transaction**. Four rows fill in one after another, linked by a vertical vein:
1. **BKT**: a mastery bar for *Hash tables* drops from 0.62 to 0.41, and the plant beside it droops one stage. Below it, four small fitted values: *prior · learn · slip · guess*.
2. **SM-2**: a calendar chip moves its next review from *in 6 days* to **tomorrow**.
3. **Format policy**: the flashcard evidence bar shrinks slightly.
4. **Attempt logged**: a new row slides into a tiny log.

When all four rows are in, a bracket closes around them labelled *commit*. Four agent dots (Curriculum, Tutor, Garden, Arcade) pulse once to show that every agent now sees the same state.

## 2:30–3:28 · Nish — Memory and shared state

> “Closing the chat removes the conversation, not the learning state. In a fresh ASI:One conversation, Sprout recognizes a returning learner and routes the request back to the Tutor. The Tutor rebuilds the session from the shared graph: the active course, mastery for each concept, upcoming reviews, the last-session recap, and the next eligible topic. The student never has to explain where they left off.
> Arcade is another specialist over the same learner graph. It selects weak concepts, writes and checks questions, creates the room, and issues a shared code. SpacetimeDB owns the timer, answers, scoring, and standings. Each screen subscribes to that state, so one update redraws both views. The course owner's answers pass through the same mastery update used by the Tutor.”

**G12 · “The chat goes, the garden stays”** · FULL · 2:30–2:40
A chat window outline sits above a garden bed. The chat window folds away and dissolves like a falling leaf. The garden underneath stays in place, and a soft sun rises behind it. Text: **Closing the chat removes the conversation, not the learning.**

**G13 · “Welcome back”** · OVER on the fresh-chat recording · 2:44–2:58
Five tags appear one at a time beside the real welcome-back card, each linked to the card by a thin line: **active course · mastery per concept · reviews due · last-session recap · next topic**.

**G14 · “One state, two screens”** · FULL · 3:06–3:24
A single **SpacetimeDB** node sits in the centre, holding four small rows: *timer · answers · scores · standings*. Two outlined screens are connected to it: a host laptop on the left and a phone on the right. A single answer travels from the phone up to the node. The node's *scores* row ticks, and twin pulses run down to both screens at the same moment, so the leaderboard bars reorder on each. A last branch peels off to a tiny mastery bar: *host's answers → same mastery update*.

## 3:28–4:02 · Ashmith — Architecture and close

> “These features look different, but they all run through one system. Fetch.ai provides Agentverse discovery, the Agent Chat Protocol, ASI:One, and interactive cards. Sprout routes each task across four specialists: Curriculum, Tutor, Garden, and Arcade. SpacetimeDB gives them shared memory and decision logic. Models generate the content; database reducers enforce prerequisites, mastery, reviews, and multiplayer state.
> Sprout turns ‘I should study’ into one clear next action, based on what the student actually knows.”

**G15 · “One system”** · FULL · 3:28–3:54 (architecture diagram)
The diagram grows from top to bottom like a root system, and each layer lights up as it is named:
- **Fetch.ai layer**: ASI:One → Agent Chat Protocol → Agentverse, with interactive-card chips.
- **Sprout** orchestrator, branching to four specialist nodes: **Curriculum · Tutor · Garden · Arcade**.
- **SpacetimeDB** as the soil at the bottom, holding reducer chips: *prerequisites · BKT mastery · SM-2 reviews · format bandit · game state*.

On “Models generate the content,” a small *LLM* node lights up on the content edges. On “reducers enforce,” the soil chips glow green.

**G16 · End card** · FULL · 3:54–4:02+ (hold 6 s)
The phrase *“I should study”* is struck through and resolves into a single green pill: **Learn next → Hash tables**. The **sprout** wordmark and leaf land, followed by: *Message `@blank-agent-184` on ASI:One · github.com/ArushNo1/sprout · sproutlearn.tech*.

---

## Script fixes I'd make (please confirm)

1. **“5-agent LangGraph” → “five agents.”** Sprout runs on Fetch.ai uAgents (an orchestrator plus four specialists), and there is no LangGraph in the code. Judges reading the repo would catch this.
2. **BKT wording.** The fitter exists (`mastery/fit_params.py`), but per `TODO.md` it hasn't run on live data yet, because each concept needs at least 30 answers. “Is trained on attempt history” overstates it. I softened the line to “fits each concept's … rates from attempt history.” If you've already run the fitter, the original wording is fine.
3. **“all thanks to spacetime” → “all thanks to SpacetimeDB.”**
4. Small grammar fixes: “teaches” → “teach” (to match the other verbs), and “Often times” → “Oftentimes.”

## What I'll deliver after approval

One HyperFrames project in `video/demo/`, with each graphic as its own sub-composition and rendered file:
- `renders/G01.mp4` … FULL scenes (H.264, 1080p30)
- `renders/G07.mov` … OVER graphics (ProRes 4444 with alpha) to drop on top of your recordings
- `renders/graphics-reel.mp4`: every graphic in order, with silence where your recordings go, as a timing reference for the edit

Captions: once the voice-over is recorded, I can transcribe it with whisper-cpp and burn in captions in the same style, if you want that.
