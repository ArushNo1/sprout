# Sprout product demo video

Target: **3 minutes 30 seconds**, 16:9, 1920×1080, 30 fps, H.264 MP4. This fits Fetch.ai’s required 3–5 minute demo window while leaving enough time to prove the product and the sponsor integrations.

## Storyboard and narration

### 0:00–0:12 — Hook

**Picture:** Talking head for 4 seconds, then a clean Sprout title and a quick knowledge-garden growth animation.

**Narration:** “Students do not need another chatbot that forgets them. They need to know what to study next.”

On-screen text: **Sprout remembers what you know.**

### 0:12–0:32 — Product in one sentence

**Picture:** ASI:One with the Sprout agent profile, followed by the course home card.

**Narration:** “Sprout is an adaptive study partner inside ASI:One. It maps a course, diagnoses missing foundations, teaches the next concept, schedules review, and resumes from the same learner state in every new chat.”

### 0:32–1:02 — From syllabus to map

**Picture:** A pre-recorded clean flow: paste the short sample syllabus, wait, reveal the concept map, tap **Looks right**. Speed up only the waiting portion and label it “generation shortened.”

**Narration:** “A syllabus becomes a prerequisite graph. Sprout validates the structure, saves a draft, and activates the course only after the student confirms it.”

Show the original result. Do not replace it with a recreated interface.

### 1:02–1:58 — The adaptive loop

**Picture:** Course overview, **Learn next**, lesson, **Practice … flashcards**, **Show answer**, **Didn't know**, visible mastery change.

**Narration:** “The backend chooses the weakest concept whose prerequisites are ready. Sprout teaches it in a format selected for this learner. When the student misses a flashcard, that answer updates the probability of mastery and the review schedule in one database transaction.”

At the mastery change, add a restrained two-line overlay:

- Bayesian Knowledge Tracing updates mastery
- SM-2 schedules the next review

### 1:58–2:28 — Memory across chats

**Picture:** Close the conversation, open a fresh Sprout conversation, send **Let's keep going**, and reveal the welcome-back progress card.

**Narration:** “A new conversation starts with the course, recent progress, weak concepts, and reviews still available. The student never has to explain where they left off.”

### 2:28–2:56 — Live shared state

**Picture:** Split screen with the quiz host on the left and a phone-sized player view on the right. Join with a code, submit one answer, and show both screens update. End on the leaderboard.

**Narration:** “The same SpacetimeDB backend also powers live quiz rooms. Questions, timers, answers, scoring, and standings synchronize through subscriptions, while the course owner’s answers feed back into mastery.”

If multiplayer has not passed a final end-to-end test, replace this segment with the knowledge garden and label multiplayer as a built extension. Do not imply a live deployment that was not verified.

### 2:56–3:20 — Architecture and sponsor proof

**Picture:** Simple animated diagram: ASI:One → Sprout → curriculum/tutor logic → SpacetimeDB → cards, garden, and multiplayer.

**Narration:** “Fetch.ai provides the agent runtime, Agent Chat Protocol, Agentverse discovery, ASI:One, and interactive cards. SpacetimeDB holds the learner graph and runs the transactional learning logic and multiplayer state. The model writes content; the backend decides what should happen next.”

### 3:20–3:30 — Close

**Picture:** Talking head or the Sprout wordmark over a moving garden.

**Narration:** “Sprout turns ‘I should study’ into one clear next action, based on what the student actually knows.”

End card: **Try Sprout in ASI:One · @sprout-main-cloud**

## Recording plan

Use OBS Studio or the macOS screen recorder. OBS is preferable because it can capture a browser window, microphone, and optional camera separately.

Record the demo as short clips, not one continuous take:

1. Agent profile and course overview.
2. Syllabus submission and confirmed map.
3. Lesson and flashcard miss.
4. Fresh-chat persistence.
5. Garden.
6. Multiplayer host and player.
7. Talking-head opening and closing.

Settings:

- Canvas and output: 1920×1080.
- Frame rate: 30 fps.
- Browser zoom: choose one level that makes card text readable, then keep it fixed.
- Microphone: record 48 kHz audio; aim for peaks around -12 dB and never clip.
- Cursor: move deliberately and stop over the target before clicking.
- Capture: exclude desktop notifications, bookmarks, account email, tokens, and terminal windows.

Record voice-over after the screen capture. This lets you shorten waits, replace failed clicks, and align narration to the most useful product state. Keep natural interface sounds muted unless they communicate an action.

## Editing rules

- Use direct cuts for normal navigation.
- Speed up waits longer than three seconds by 2×–4× and label the change.
- Keep on-screen text inside the central 80% of the frame.
- Use captions for every spoken line.
- Use motion graphics only for the opening title, two algorithm callouts, the architecture diagram, and the closing card.
- Keep music quiet under speech, roughly 18–24 dB below the voice.
- Never claim that the garden updates live unless the recording visibly proves it; the current garden loads current state when the page is requested.
- Never show private learner addresses, raw syllabus data from a real student, API keys, or database tokens.

## Required evidence checklist

The final edit should visibly prove:

- Sprout is directly usable inside ASI:One.
- Interactive cards complete the primary flow.
- An input causes a meaningful backend action.
- A student answer changes mastery.
- A new conversation restores persistent state.
- SpacetimeDB owns learning state and backend logic.
- Shared multiplayer state works, if included.
- The agent handle and public repository appear in the final frame or description.

## Export and review

Export H.264 MP4 at 1080p with a high-quality bitrate. Watch the exported file once with headphones and once muted. Confirm that captions remain understandable without audio, no loading spinner dominates a scene, small UI text is legible, and the final runtime stays between 3:00 and 5:00.

Upload an unlisted backup before judging and test it on a different device. Keep the local MP4 on the judging laptop.
