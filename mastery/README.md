# mastery

Python helpers for Sprout's learning model, backed by the shared SpacetimeDB database.

The database does the live work. The `record_attempt` reducer runs the BKT update, the SM-2 reschedule and the format bandit, and `compute_next_step` picks the next concept (see `spacetimedb/API.md`). This package reads and writes through those reducers and adds two things the database doesn't do: display helpers for the tutor and offline fitting of per-concept BKT parameters.

| File | What it does |
| --- | --- |
| `bkt.py` | BKT update (same formula and defaults as `algorithms.ts`), `mastery_label`, `subject_mastery`, `run_diagnostic`, and fitting with pyBKT (`fit_params_by_concept`, `fit_params`) |
| `mastery_store.py` | `record_answer` (calls `record_attempt`, reads the new p_mastered back) and `get_snapshot` (every concept in a course with mastery and label) |
| `fit_params.py` | CLI that fits BKT parameters from a course's `attempt` log and writes them with `set_concept_params` |
| `srs.py`, `scheduler.py` | SM-2 and next-concept logic, mirroring the reducers; used for local demos and tests |
| `fake_db.py` | In-memory stand-in for the database, used by the tests |

## Setup

```
pip install -r mastery/requirements.txt
```

Environment, read by `uagents-python/sprout_db.py`. A `.env` in `uagents-python/` or the current directory is loaded when python-dotenv is installed.

| Variable | Value |
| --- | --- |
| `SPACETIMEDB_HOST` | defaults to `https://maincloud.spacetimedb.com` |
| `SPACETIMEDB_DB` | `sprout-live` |
| `SPACETIMEDB_TOKEN` | token of a registered Sprout agent (see "Access" in `spacetimedb/API.md`). Never commit it |

`mastery_store` imports `sprout_db` from `uagents-python/` on first use, so importing the package needs neither the network nor `requests`.

## Using it from an agent

```python
from mastery import mastery_store
from mastery.bkt import subject_mastery

p, label = mastery_store.record_answer(address, concept_id, correct, "worked_example", kind="check")
snapshot = mastery_store.get_snapshot(address, course_id)
solid, total, _ = subject_mastery({r["name"]: r["p_mastered"] for r in snapshot})
print(f"{solid} of {total} solid")
```

`mastery_label` and `subject_mastery` are pure functions with no imports, so the tutor can call them for the "3 of 31 solid" line and the solid/shaky tags on cards, or copy them into a hosted bundle. "Solid" starts at 0.7, the same cut-off the database uses for prerequisites.

Both store functions log and return a safe value on errors (`(prior, "not started")` and `[]`) so a database hiccup doesn't crash the agent.

## Fitting BKT parameters

```
pip install -r mastery/requirements-fit.txt     # Python 3.10-3.12, see the file for why
python -m mastery.fit_params --course 12 --dry-run
python -m mastery.fit_params --course 12
python -m mastery.fit_params --course 12 --min-attempts 50
```

Run it from the repo root. A concept is fitted only when it has at least 30 answers (`--min-attempts`), including at least one right and one wrong. With fewer, EM on four parameters mostly returns noise, and with one-sided answers the parameters can't be identified. Every other concept keeps its current parameters. Slip and guess are clamped below 0.5 both here and in the reducer.

A new `p_init` only seeds mastery rows created later; existing `p_mastered` values are not changed. The other three parameters apply from the next `record_attempt`. The `set_concept_params` reducer has to be published with the module before the CLI can write.

## Tests

```
python -m pytest mastery
```

No network or database is needed. The store and CLI tests use `fake_db.FakeDb`, and the pyBKT tests use fake modules, except one that runs real pyBKT when it's installed and is skipped otherwise.
