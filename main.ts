// Starfall Defense — make.fun "best game" (best-game-01) entry program.
//
// The game itself is the static site in game/ (index.html + style.css +
// game.js): plain files a desktop browser plays fully offline, no build
// step, no network request, no library. This program is the hand-in: it
// copies game/ and screenshots/ into the output directory and writes
// /output/dossier.json with buildDossier from the vendored make.fun
// library, byte for byte as the scorer rebuilds it.
//
// Run it the way the grader does (MAKEFUN_OUTPUT_DIR stands in for
// /output anywhere else):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (then open localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's published caps for this bounty (reference/gate.json): the
// dossier call below enforces them while it writes, and the pre-flight
// pass here refuses early, with a readable reason, an entry the scorer
// would refuse anyway.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function treeStats(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      const sub = treeStats(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

// Pre-flight: the entrypoint and the screenshots the gate will count.
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing: the game has no entry page');
}
const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort()
  : [];
if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
  throw new Error(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > CAPS.screenshots.max_bytes) {
    throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
}
const gameStats = treeStats(gameDir);
if (gameStats.files > CAPS.game_max_files || gameStats.bytes > CAPS.game_max_bytes) {
  throw new Error(
    `game/ is ${gameStats.files} files / ${gameStats.bytes} bytes, over the gate caps`,
  );
}

// Hand-in: copy the two trees, then let the vendored library describe
// exactly what was copied.
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

console.log(
  `Starfall Defense handed in: ${gameStats.files} game files ` +
    `(${gameStats.bytes} bytes), ${shots.length} screenshots, dossier.json written to ${out}`,
);
