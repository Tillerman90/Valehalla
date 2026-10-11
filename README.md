# Valehalla

A solo, phone-only conquest game: found a village, raise a dynasty, and take a
cursed valley from five rival powers. It installs to the iPhone home screen
from Safari and needs no server, account or API key.

**Status: phase 0 (engine) complete.** The page that is live now is a plain
test build for proving the engine and the saves on a real phone. The designed
game screens start in phase 1.

## What is here

| Folder | What it holds |
| --- | --- |
| `src/engine` | The rules. Pure TypeScript, no browser code. Game clock, event queue, catch-up, economy (three resources, production from building levels, Farm population, Market trading), build queue, city plans, seeded rolls, save format with migrations |
| `src/engine/content.ts` | Every balance number. Tuning the game means editing this file |
| `src/storage` | Autosave to the phone (rotating slots in two storage systems) and backup to a private GitHub Gist |
| `src/sim` | Bot players and the balance simulator |
| `src/app` | The phone test page |
| `reports` | The latest simulator report |

## Commands

```
npm install
npm run dev        # play locally
npm test           # engine, save and simulator tests
npm run sim        # 1,000 worlds per bot, checked against the design targets
npm run build      # production build into dist/
```

`npm run sim -- --worlds=200 --days=28 --out=reports/phase0.md` changes the
run size and writes the report to a file.

## How time works

Every timer runs on game time. Game time follows the real clock while the game
is open and for 12 hours after it closes, then the whole world stands still
until you return. Opening the game replays every event that came due, in
order, so nothing needs to run in the background.

## How saves work

Progress must never reset, so there are four layers:

1. Autosave after every order and every 15 seconds, and again the instant the
   game is hidden or closed.
2. Two rotating slots in each of two storage systems. Every copy carries a
   checksum, and loading takes the newest copy that passes it.
3. Automatic backup to a private GitHub Gist every 5 minutes, once a token is
   added on the Saves section. The game refuses to overwrite a backed-up
   empire with a different or older one unless told to.
4. Manual export and import of a save file.

To make the token: GitHub, Settings, Developer settings, Personal access
tokens, Tokens (classic), Generate new token, tick only the `gist` scope.

## Installing on an iPhone

Open the game's page in Safari, tap Share, then Add to Home Screen. Always
play from the home screen icon: Safari and the installed game keep separate
saves.
