# Sprout database API

The Sprout agents share one SpacetimeDB database (`sprout-db`). Source: [spacetimedb/src](spacetimedb/src).

- **Write** by calling a *reducer*. Reducers don't return data; they either succeed or fail with an error message.
- **Read** with a SQL query (or a subscription). Processing results such as `compute_next_step` are written to a table you then read.
- A learner is identified by the **sender address** ASI:One passes to the orchestrator (`address`). Every table is keyed off it.

## Calling it from Python (uAgents)

```python
import os, requests

HOST = os.getenv("SPACETIMEDB_HOST", "http://127.0.0.1:3000")
DB = os.getenv("SPACETIMEDB_DB", "sprout-db")
HEADERS = {"Authorization": f"Bearer {os.environ['SPACETIMEDB_TOKEN']}"}

def call(reducer, *args):
    r = requests.post(f"{HOST}/v1/database/{DB}/call/{reducer}", json=list(args), headers=HEADERS)
    if not r.ok:
        raise RuntimeError(r.text)  # e.g. "Unknown learner 'x'"

def sql(query):
    r = requests.post(f"{HOST}/v1/database/{DB}/sql", data=query, headers=HEADERS)
    r.raise_for_status()
    result = r.json()[0]
    names = [e["name"]["some"] for e in result["schema"]["elements"]]
    return [dict(zip(names, row)) for row in result["rows"]]
```

Arguments are a JSON array in the order listed below. **Options** are `{"some": value}` or `{"none": []}` when you *send* them; in SQL results they come back as `[0, value]` (some) or `[1, []]` (none). `u64` ids are plain numbers.

## Access

Writes are rejected unless the caller is a registered Sprout agent. The identity that publishes the database is the owner and counts as an agent. To give each agent its own token:

1. Get the agent its own SpacetimeDB token and note that token's identity.
2. The owner calls `register_agent(identity, name)`.

While developing, every agent can simply use the owner's token (`spacetime login show --token`).

Reads are open: all tables except `config` and `agent` are public, so learner data is readable by anyone who can reach the database. Keep the database private to your deployment, and store only course material and learning data.

## Tables

| Table | Key | Holds |
|---|---|---|
| `learner` | `address` | display name, preferred format |
| `course` | `id` | name, unit, exam date, raw syllabus, status (`draft` until confirmed, then `active`) |
| `concept` | `id` | knowledge-map node: name, summary, embedding, per-concept BKT parameters |
| `prerequisite` | `id` | edge: `concept_id` requires `requires_id`, with confidence |
| `mastery` | `address:concept_id` | P(mastered), attempt counts, last seen, next review, SM-2 state |
| `attempt` | `id` | evidence log: kind, format, correct, mastery before/after |
| `format_weight` | `address:format` | Beta(alpha, beta) bandit state per format |
| `session` | `id` | start/end, recap summary used to open the next chat |
| `next_step` | `address:course_id` | latest recommendation from `compute_next_step` |
| `study_card` | `id` | generated quiz / flashcard / worked-example payloads (JSON) |

## Reducers

### Learners
| Reducer | Arguments | Notes |
|---|---|---|
| `upsert_learner` | `address, display_name?` | Creates the learner if new; call at the start of every chat |
| `set_preferred_format` | `address, format` | Formats: `worked_example`, `flashcards`, `diagram`, `analogy`. Only seeds the bandit's starting weight |

### Courses and curriculum
| Reducer | Arguments | Notes |
|---|---|---|
| `create_course` | `address, name, current_unit?, exam_date?, raw_syllabus` | Status `draft`. No limit on courses |
| `update_course` | `address, course_id, name?, current_unit?, exam_date?` | Omitted fields unchanged |
| `ingest_concept_graph` | `address, course_id, concepts[], edges[]` | `concepts`: `{name, summary, embedding[], p_init?}`; `edges`: `{concept, requires, confidence}` by **name**. Replaces a draft's earlier extraction; adds to an active course. Cyclic or unknown-name edges are skipped |
| `add_concept` / `update_concept` / `remove_concept` | see source | For the "confirm or edit the concept list" step |
| `add_prerequisite` / `remove_prerequisite` | see source | Rejects cycles |
| `confirm_course` | `address, course_id` | Activates the course and creates a mastery row per concept |
| `forget_course` | `address, course_id` | Deletes the course and everything tied to it |

### Learning loop
| Reducer | Arguments | Notes |
|---|---|---|
| `record_attempt` | `address, concept_id, correct, kind, format?, session_id?, question?` | `kind`: `diagnostic`/`check`/`practice`/`review`. Runs the BKT update, reschedules review (SM-2, capped at the day before the exam), updates the format bandit (for `check`/`practice`/`review` with a `format`) and logs the attempt |
| `compute_next_step` | `address, course_id, mode` | `mode`: `teach` (weakest concept with prerequisites > 0.7, format by Thompson sampling), `review` (most overdue), `diagnostic` (untested concept most others depend on, skipping ones above a known gap). Result lands in `next_step`; `mode = 'complete'` means nothing left |
| `start_session` / `end_session` | `address, course_id?` / `address, session_id, summary, last_concept_id?` | The latest `summary` opens the next chat |
| `save_study_card` / `set_study_card_status` | see source | `kind`: `quiz`/`flashcards`/`worked_example`/`snapshot`/`review_reminder`; `payload_json` must be valid JSON |

### Admin and demo
| Reducer | Arguments | Notes |
|---|---|---|
| `register_agent` / `remove_agent` | `identity, name` / `identity` | Owner only |
| `seed_demo` | `address, display_name` | Creates "CS 201: Data Structures" with two days of history. Re-running resets it |

## Useful reads

```sql
-- Returning session: where did we leave off, and what is due?
SELECT started_at, summary, last_concept_id FROM session WHERE user_address = '<addr>';
SELECT concept_id, p_mastered, next_review FROM mastery WHERE user_address = '<addr>';
SELECT * FROM next_step WHERE user_address = '<addr>';
SELECT format, alpha, beta, uses FROM format_weight WHERE user_address = '<addr>';
```

`compute_next_step` treats a prerequisite as solid above 0.7 and a concept as mastered at 0.95; use the same cut-offs when labelling the knowledge snapshot.

## Tests

`npx vitest run src/algorithms.test.ts` covers the BKT, SM-2, bandit and graph logic in [spacetimedb/src/algorithms.ts](spacetimedb/src/algorithms.ts).
