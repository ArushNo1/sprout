# Curriculum agent

Turns a pasted syllabus or notes into a concept map: concepts (nodes) and prerequisite links (edges), as JSON. No UI yet.

- `agent.py`: the uAgent. Takes `ParseSyllabusRequest` from the orchestrator and replies with `ConceptMapResponse`. It also speaks the Agent Chat Protocol, so you can paste a syllabus to it in ASI:One and get the map back.
- `prompt.py`: the extraction prompt sent to the ASI:One LLM.
- `concept_map.py`: cleans the LLM output (slug ids, no duplicate or dangling edges, no cycles) and adds `depth` and a teaching `order`.
- `concept_map.schema.json`: the map format.
- `examples/`: a sample data structures syllabus and the map it should produce.
- `build_hosted.py`: bundles everything into `dist/hosted_agent.py`, the single file pasted into the Agentverse hosted agent "Sprout Curriculum". Re-run it after editing the source files.

## Map format

Edges point from the prerequisite to the concept that needs it (`big-o` → `amortized-analysis`). `depth` is the longest prerequisite chain above a concept (0 = none). `order` lists every concept id with prerequisites first. Together they give the knowledge agent its graph and give a future garden view its layout: depth is the row, unit is the column.

## Run locally

From the repo root (uses the root `requirements.txt`):

```bash
pip install -r requirements.txt
```

Put `ASI_ONE_API_KEY=...` and `CURRICULUM_SEED=<long secret phrase>` in a `.env` file (gitignored), then:

```bash
cd uagents-python/curriculum
python agent.py
python -m unittest test_concept_map
```

## Hosted copy on Agentverse

The live agent is the hosted agent "Sprout Curriculum" (`agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh`). Hosted agents run a single file, so `python build_hosted.py` writes `dist/hosted_agent.py` to paste into its editor. Stop the agent before editing (the editor is read-only while it runs), save, then start it. Its `ASI_ONE_API_KEY` lives in the editor's `.env` file.

## Cards

ASI:One renders the cards inline when you chat with the agent directly. Their images (header, map card) come from the `sprout-cards` Vercel project at https://sprout-cards-six.vercel.app, which draws them from URL parameters. Card images must be http(s) URLs.
