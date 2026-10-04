# Sprout web

The pages that don't fit in an ASI:One card: the garden, the knowledge graph, and the live multiplayer games and arcade. Next.js (App Router), deployed on Vercel.

| URL | Page |
|---|---|
| `/` | Landing |
| `/<user id>` | The learner's garden: links to the garden and games |
| `/<user id>/garden` | Each course's concepts as plants arranged by prerequisite depth: seeds sprout, grow, bud and flower with mastery, and wilt when a review is due. `?course=<id>` picks a course. |
| `/<user id>/garden` (several courses) | With two or more active courses and no `?course=`, an overview: what's due for review across all of them (soonest exam first) and one card per course with solid/tested/due counts. Each card opens that course's garden. |
| `/<user id>/<game>/<room code>` | Placeholder lobby from `lib/games.ts`. The real games are the next three rows. |
| `/play`, `/play/<code>` | Join a live Kahoot-style game. `?k=<key>` links the player's answers to their mastery. |
| `/host/<code>?k=<key>` | Host screen for a live game. |
| `/arcade/<code>` | Solo arcade game (Quiz Runner, Meteor Blaster) filled with Sprout's questions. |

`<user id>` is the learner's ASI:One address, the same key the database uses. Unknown learners, games, or malformed room codes show a 404.

Pages read SpacetimeDB on the server (`lib/stdb.ts`), so the token never reaches the browser.

## Run locally

```bash
cd web
npm install
cp .env.example .env.local   # fill in SPACETIMEDB_HOST / _DB / _TOKEN
npm run dev                  # http://localhost:3200
npm test
```

## Deploy on Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `web`. The framework is detected as Next.js.
2. Add environment variables `SPACETIMEDB_HOST`, `SPACETIMEDB_DB`, `SPACETIMEDB_TOKEN` (Production and Preview). The host must be reachable from the internet, e.g. `https://maincloud.spacetimedb.com`.
3. Add the domain (e.g. `sprout.tech`) under Project > Domains and point its DNS at Vercel.
4. Agents link here by building `https://<domain>/<user id>/garden`.

Anyone with a link can view that learner's graph, and the user id is the only secret in it. Treat these links as private.
