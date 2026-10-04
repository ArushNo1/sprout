# Sprout Curriculum

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

Hosted agent `@blank-agent-181` (`agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh`). Its chat logic (`skill.py`) also runs inside the Sprout agent.

Turns a pasted syllabus or notes into a concept map: concepts (nodes) and prerequisite links (edges), saved to the shared database.

- `skill.py`: the chat flow: upload card, map card, "Looks right" / "Edit", plain pasted syllabi, "json".
- `agent.py`: runs `skill.py` as a standalone agent. Also answers `ParseSyllabusRequest` (replies `ConceptMapResponse`) and `GetConceptMap` from other agents.
- `prompt.py`: the extraction prompt sent to the ASI:One LLM.
- `concept_map.py`: cleans the LLM output (slug ids, no duplicate or dangling edges, no cycles) and adds `depth` and a teaching `order`.
- `concept_map.schema.json`: the map format.
- `examples/`: a sample data structures syllabus and the map it should produce.

## Shared database

When `SPACETIMEDB_TOKEN` is set, the agent saves each student's course to Sprout's SpacetimeDB database through `../sprout_db.py`:

1. Building a map calls `upsert_learner`, `create_course` (status `draft`) and `ingest_concept_graph` with the concepts and prerequisite links. Rebuilding after "Edit" updates the same draft course instead of making a new one.
2. "Looks right" calls `confirm_course`, which makes the course active and creates the student's mastery rows, so the tutor can start from it.

Without a token the agent works the same and keeps maps in its own storage only. To test against a local database: `spacetime start`, then `spacetime publish sprout-local --server local --module-path spacetimedb/spacetimedb --no-config`, and set `SPACETIMEDB_HOST=http://127.0.0.1:3000`, `SPACETIMEDB_DB=sprout-local` and the local token from `spacetime login show --token`.

## Map format

Edges point from the prerequisite to the concept that needs it (`big-o` → `amortized-analysis`). `depth` is the longest prerequisite chain above a concept (0 = none). `order` lists every concept id with prerequisites first. Together they give the knowledge agent its graph and give a future garden view its layout: depth is the row, unit is the column.

## Run locally

From the repo root (uses the root `requirements.txt`):

```bash
pip install -r requirements.txt
```

Copy `uagents-python/.env.example` to `uagents-python/.env` and fill in `ASI_ONE_API_KEY` and `CURRICULUM_SEED` (the file is gitignored), then from `uagents-python/`:

```bash
python -m curriculum.agent
python -m unittest curriculum.test_concept_map
```

## Hosted copy on Agentverse

The live agent is the hosted agent "Sprout Curriculum" (`agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh`). `python build_hosted.py curriculum` (from `uagents-python/`) writes `dist/curriculum/agent.py` to paste into its editor. Stop the agent before editing (the editor is read-only while it runs), save, then start it. Its `ASI_ONE_API_KEY` lives in the editor's `.env` file.

## Cards

ASI:One renders the cards inline when you chat with the agent directly. Their images (header, map card) come from the `sprout-cards` Vercel project at https://sprout-cards-six.vercel.app, which draws them from URL parameters. Card images must be http(s) URLs.
