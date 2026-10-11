# Valehalla

Solo, iPhone-only conquest game (Tribal Wars style), built as an installable
static web app. The design doc is the authority on rules and build phases:
https://claude.ai/code/artifact/c9d3c711-4d49-4d71-9275-cc416e067b84

## Ground rules

- `src/engine` is pure and deterministic. No `Date.now()`, no `Math.random()`,
  no browser APIs. Wall time comes in as an argument; randomness comes from
  `rngFor(seed, ...keys)`.
- Everything in `GameState` is plain JSON. If its shape changes, bump
  `SAVE_VERSION` in `src/engine/save.ts` and add a migration. The owner's
  progress must never be lost or reset.
- Balance numbers live only in `src/engine/content.ts`. Change them there and
  re-run `npm run sim` before trusting them.
- New rules get tests in the same change. `npm test` and `npm run sim` must
  both pass before a push; pushes to `main` deploy to GitHub Pages.
- No AI or API calls at runtime. No diplomacy, no random events, no Ages, no
  research tracks: these were considered and cut.
- Rival faction names, personalities and capital powers belong in a content
  file the owner does not read. Never describe them in the doc, README, commit
  messages or chat.
- Player-facing text: sentence case, plain words, no emoji in the game itself.

## Phases

0 Engine (done), 1 One city, 2 Armies and map (ends in the playable slice, a
go or no-go check), 3 Conquest, 4 Rivals, 5 Dynasty, 6 Endgame.
