# Sprout web

The pages that don't fit in an ASI:One card: the garden, the knowledge graph, and the live multiplayer games and arcade. Next.js (App Router), deployed on Vercel.

| URL | Page |
|---|---|
| `/` | Landing: the hero, then a carousel of short demo videos, one per standout capability (syllabus to map, mastery tracing, prerequisite unlocking, format learning, spaced review, live games, shared agent memory). The clips are in `public/showcase/`. |
| `/<user id>` | The learner's garden: links to the garden and games |
| `/<user id>/garden` | The garden as one interactive map that fits the screen. Plants sit by prerequisite depth with the lines between them. Tap a plant to light up its whole chain (green = what it builds on, gold = what it unlocks) and open its details. Drag to pan, scroll or pinch to zoom, double-tap to zoom to a chain, **Fit** and the flip button re-lay it out. Filter by due / growing / solid / not started, search by name, or use the arrow keys (up and down follow prerequisites). Switch courses from the dropdown. On a phone the details open as a sheet. |
| `/<user id>/garden` (several courses) | With two or more active courses and no `?course=`, an overview with one card per course: its plants, solid/tested/due counts and weakest concept, soonest exam first. A card opens that course's map. |
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

## Landing-page demo clips

The seven videos in `public/showcase/` (`<id>.mp4` plus a `<id>.jpg` poster) are rendered from one HyperFrames project, `video/showcase/`, which uses Sprout's real numbers (the BKT constants, the Data Structures example map, the demo account's format posteriors). To change them, edit `video/showcase/index.html`, then:

```bash
cd video/showcase
npx hyperframes render --fps 30 --output renders/reel.mp4   # 7 clips x 6 s
# cut clip i (0-6) into web/public/showcase/<id>.mp4 and a poster at i*6+5.3s with ffmpeg
```

The carousel text lives in `app/page.tsx`. It pauses when scrolled out of view, has a pause button, and does not autoplay or auto-advance for people who prefer reduced motion.
