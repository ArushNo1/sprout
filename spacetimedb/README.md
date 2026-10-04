# Sprout database

The SpacetimeDB module (TypeScript) that holds everything Sprout knows: learners, courses, the concept graph, mastery (BKT), reviews (SM-2), the teaching-format bandit and the live games. Source: [spacetimedb/src](spacetimedb/src). Reducers and tables: [API.md](API.md).

The Next.js site in [`../web`](../web) is the only frontend. Its generated bindings live in `web/lib/module_bindings`.

## Work on it

Prerequisites: [Node.js](https://nodejs.org/) and the [SpacetimeDB CLI](https://spacetimedb.com/install).

```bash
npm install            # tests only
npm test               # algorithms (BKT, SM-2, bandit) and game scoring
cd spacetimedb && npm install
```

## Publish (database owner only)

```bash
spacetime login
spacetime publish sprout-live --module-path spacetimedb --server maincloud
npm run generate       # regenerates ../web/lib/module_bindings
```

Register each agent once with `spacetime call sprout-live register_agent '["0x<identity>"]' '"<name>"'`, then give that agent its own token as `SPACETIMEDB_TOKEN`.
