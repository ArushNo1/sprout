# Curriculum agent

Turns a pasted syllabus or notes into a concept map: concepts (nodes) and prerequisite links (edges), as JSON. No UI yet.

- `agent.py`: the uAgent. Takes `ParseSyllabusRequest` from the orchestrator and replies with `ConceptMapResponse`. It also speaks the Agent Chat Protocol, so you can paste a syllabus to it in ASI:One and get the map back.
- `prompt.py`: the extraction prompt sent to the ASI:One LLM.
- `concept_map.py`: cleans the LLM output (slug ids, no duplicate or dangling edges, no cycles) and adds `depth` and a teaching `order`.
- `concept_map.schema.json`: the map format.
- `spacetime_db.py`: thin HTTP client for the shared SpacetimeDB database (`../../spacetimedb/API.md`). Used on first contact to tell a new user from a returning one via the `learner` table, instead of guessing from the LLM or local storage.
- `examples/`: a sample data structures syllabus and the map it should produce.
- `build_hosted.py`: bundles everything into `dist/hosted_agent.py`, the single file pasted into the Agentverse hosted agent "Sprout Curriculum". Re-run it after editing the source files.

## Onboarding

On the first message of a chat session (`StartSessionContent`), the agent looks up the
sender's address in SpacetimeDB's `learner` table (`spacetime_db.get_learner`). If no row
exists, it's a new user: the agent calls `upsert_learner` to create one, then sends a short
welcome explaining what Sprout does and asking what class or subject to start with, followed
by the usual upload card. A returning user (a `learner` row already exists) just gets the
upload card. This check never touches the LLM or this agent's own `ctx.storage` — SpacetimeDB
is the only source of truth for "have we met this address before." If SpacetimeDB is
unreachable or `SPACETIMEDB_TOKEN` isn't set, the agent logs a warning and falls back to
the returning-user behavior rather than blocking the chat.

## Map format

Edges point from the prerequisite to the concept that needs it (`big-o` → `amortized-analysis`). `depth` is the longest prerequisite chain above a concept (0 = none). `order` lists every concept id with prerequisites first. Together they give the knowledge agent its graph and give a future garden view its layout: depth is the row, unit is the column.

## Run locally

From the repo root (uses the root `requirements.txt`):

```bash
pip install -r requirements.txt
```

Copy `uagents-python/.env.example` to `uagents-python/.env` and fill in `ASI_ONE_API_KEY` and `CURRICULUM_SEED` (the file is gitignored), then:

```bash
cd uagents-python/curriculum
python agent.py
python -m unittest test_concept_map
```

## Hosted copy on Agentverse

The live agent is the hosted agent "Sprout Curriculum" (`agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh`). Hosted agents run a single file, so `python build_hosted.py` writes `dist/hosted_agent.py` to paste into its editor. Stop the agent before editing (the editor is read-only while it runs), save, then start it. Its `ASI_ONE_API_KEY` lives in the editor's `.env` file.

## Cards

ASI:One renders the cards inline when you chat with the agent directly. Their images (header, map card) come from the `sprout-cards` Vercel project at https://sprout-cards-six.vercel.app, which draws them from URL parameters. Card images must be http(s) URLs.
