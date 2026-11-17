# makefun-best-game

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/woodhntr1-gif/makefun-best-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/woodhntr1-gif/makefun-best-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Starfall Defense** — an original tower-defense game that runs 100% offline in a desktop browser. Alien crawlers march down a serpentine road toward your base; build towers on the grass, stop all **15 waves** (including the Wave 15 Overlord boss), and don't let 20 enemies through. Four tower types with distinct roles (Blaster, Frost, Cannon, Sniper), three upgrade levels each, selling, pause and 2× speed, synthesized sound effects with no audio files, and a full loop: title screen → 15 hand-tuned waves → victory or defeat screen with score, kills and waves cleared → one-click restart. No server, no downloads, no external fonts, images, libraries or trackers — every file it loads lives in `game/`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. (Opening `game/index.html` directly from disk works too — the game needs no server and no network.)

---

<sub>Entered on [make.fun](https://make.fun/?ref=rez34v58&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

## How to play

1. Pick a tower from the panel (or press `1`–`4`), then click a grass tile to build it. Towers cannot go on the road or on another tower.
2. Press **Start Wave** (or `Space`) to send the next wave. Kills earn gold and score.
3. Click any built tower to **Upgrade** it (max Level 3: more damage and range) or **Sell** it for 70% of what you invested.
4. Between waves, rebuild freely — the next wave only starts when you say so.

| Key | Tower  | Cost | Role |
|-----|--------|------|------|
| 1   | Blaster | 50  | Fast, cheap, reliable single-target damage |
| 2   | Frost   | 60  | Low damage, slows enemies by 50% |
| 3   | Cannon  | 100 | Slow firing, splash damage to groups |
| 4   | Sniper  | 120 | Very long range, very high single-shot damage |

Enemies: **Crawler** (balanced grunt), **Runner** (Wave 2+, fast and fragile), **Brute** (Wave 4+, slow and very tough, costs 2 lives if it leaks), **Overlord** (Wave 15 boss, costs 5 lives if it leaks).

Controls: mouse to select / place / upgrade / sell · `1`–`4` select tower type · `Space` start wave · `P` pause · `Esc` cancel / deselect · `M` mute · speed button toggles 1× / 2×.

Scoring: kills (boss = 1,000), a per-wave clear bonus, and on victory a bonus of 50 per remaining life plus unspent gold.

## Repository layout

| Path | What it is |
|------|------------|
| `game/index.html` | The game page: board canvas, HUD, control panel, overlays |
| `game/game.js` | All game logic, Canvas rendering and Web Audio sound |
| `game/style.css` | All styling (system fonts only) |
| `screenshots/` | Screenshots of the game itself: start, play, battle, end |
| `main.ts` | The entry program: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored library |
| `serve.ts` | A tiny local static server for playing the game (development convenience) |
| `vendor/makefun-game.ts` | The make.fun kit's dossier library, unchanged |

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Starfall Defense is an original work created for this bounty: all code, art (drawn at runtime with Canvas) and sound (synthesized with Web Audio) were made for this game. MIT licensed — see `LICENSE`.
