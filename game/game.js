'use strict';
/* Starfall Defense - original offline tower defense. No network, no assets. */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const TILE = 40, COLS = 24, ROWS = 15, W = 960, H = 600, MAX_WAVE = 15;

const WAYPOINTS = [
  { x: -24, y: 100 }, { x: 780, y: 100 }, { x: 780, y: 460 },
  { x: 180, y: 460 }, { x: 180, y: 260 }, { x: 984, y: 260 }
];

function buildPathTiles() {
  const s = new Set();
  const add = (c, r) => s.add(c + ',' + r);
  for (let c = 0; c <= 19; c++) add(c, 2);
  for (let r = 2; r <= 11; r++) add(19, r);
  for (let c = 4; c <= 19; c++) add(c, 11);
  for (let r = 6; r <= 11; r++) add(4, r);
  for (let c = 4; c <= 23; c++) add(c, 6);
  return s;
}
const PATH_TILES = buildPathTiles();

const TOWER_TYPES = [
  { id: 'blaster', name: 'Blaster', icon: '🔫', key: '1', cost: 50, damage: 12, rate: 0.35, range: 112, projSpeed: 520, color: '#5b8cff', desc: 'Fast, cheap, reliable.' },
  { id: 'frost', name: 'Frost', icon: '❄️', key: '2', cost: 60, damage: 5, rate: 0.5, range: 104, projSpeed: 420, color: '#6be7ff', slowFactor: 0.5, slowDur: 1.6, desc: 'Slows enemies by 50%.' },
  { id: 'cannon', name: 'Cannon', icon: '💣', key: '3', cost: 100, damage: 36, rate: 1.25, range: 122, projSpeed: 380, color: '#ffb020', splash: 58, desc: 'Splash damage to groups.' },
  { id: 'sniper', name: 'Sniper', icon: '🎯', key: '4', cost: 120, damage: 95, rate: 1.8, range: 195, projSpeed: 900, color: '#ff5d73', desc: 'Huge damage, long range.' }
];
const ENEMY_TYPES = {
  grunt:  { hp: 55, speed: 54, reward: 9, score: 10, lives: 1, radius: 13, color: '#ff5d5d' },
  runner: { hp: 34, speed: 98, reward: 11, score: 15, lives: 1, radius: 10, color: '#ffb020' },
  brute:  { hp: 280, speed: 30, reward: 26, score: 40, lives: 2, radius: 17, color: '#b06bff' },
  boss:   { hp: 3400, speed: 25, reward: 300, score: 1000, lives: 5, radius: 24, color: '#ff2e88' }
};

// Deterministic decoration per tile (no flicker, no randomness at render time)
const decor = [];
for (let i = 0; i < COLS * ROWS; i++) {
  let seed = (i + 1) * 2654435761 % 4294967296;
  seed = (seed ^ (seed >>> 13)) * 1274126177 % 4294967296;
  decor.push(((seed >>> 8) % 1000) / 1000);
}

let state, gold, lives, score, kills, wave, enemies, towers, projectiles, particles, floaters;
let spawnQueue, spawnTimer, waveActive, placingId, selected, hover, paused, speedMul, soundOn, elapsed;
soundOn = true; speedMul = 1; paused = false;

function resetGame() {
  gold = 200; lives = 20; score = 0; kills = 0; wave = 0;
  enemies = []; towers = []; projectiles = []; particles = []; floaters = [];
  spawnQueue = []; spawnTimer = 0; waveActive = false;
  placingId = null; selected = null; hover = null; paused = false; speedMul = 1; elapsed = 0;
  document.getElementById('speedBtn').textContent = '⏩ Speed: 1×';
  syncUI();
}

function towerDamage(t) { return Math.round(t.def.damage * (1 + 0.6 * (t.level - 1))); }
function towerRange(t) { return t.def.range + (t.level - 1) * 12; }
function upgradeCost(t) { return Math.round(t.def.cost * 0.8 * t.level); }

function buildWave(n) {
  const q = [];
  const hpMul = 1 + (n - 1) * 0.30 + Math.max(0, n - 10) * 0.12;
  const grunts = 6 + n * 2;
  const runners = n >= 2 ? 2 + n : 0;
  const brutes = n >= 4 ? Math.floor((n - 2) * 0.9) : 0;
  for (let i = 0; i < grunts; i++) q.push({ type: 'grunt', hpMul });
  for (let i = 0; i < runners; i++) q.splice(Math.min(q.length, 4 + i * 3), 0, { type: 'runner', hpMul });
  for (let i = 0; i < brutes; i++) q.splice(Math.min(q.length, 6 + i * 5), 0, { type: 'brute', hpMul: hpMul * 1.05 });
  if (n === MAX_WAVE) { q.push({ type: 'brute', hpMul: hpMul * 1.2 }); q.push({ type: 'boss', hpMul: 1 }); }
  return q;
}

function spawnEnemy(spec) {
  const base = ENEMY_TYPES[spec.type];
  const hp = Math.round(base.hp * spec.hpMul);
  enemies.push({
    type: spec.type, x: WAYPOINTS[0].x, y: WAYPOINTS[0].y, wp: 1, progress: 0,
    hp, maxHp: hp, speed: base.speed, reward: base.reward, score: base.score,
    lives: base.lives, radius: base.radius, color: base.color, slowUntil: 0, slowFactor: 1, flash: 0
  });
}

function startWave() {
  if (state !== 'playing' || waveActive || wave >= MAX_WAVE) return;
  wave++; waveActive = true; spawnQueue = buildWave(wave); spawnTimer = 0.2;
  tone(520, 0.09, 'square', 0.05); setTimeout(() => tone(780, 0.1, 'square', 0.05), 90);
  syncUI();
}

function leak(e) {
  lives -= e.lives; floaters.push({ x: 920, y: e.y - 18, text: '-' + e.lives + ' ❤️', color: '#ff5d73', t: 0 });
  burst(e.x, e.y, '#ff5d73', 10); tone(140, 0.22, 'sawtooth', 0.08);
  if (lives <= 0) { lives = 0; endGame(false); }
}

function killEnemy(e) {
  gold += e.reward; score += e.score; kills++;
  floaters.push({ x: e.x, y: e.y - 18, text: '+' + e.reward + '💰', color: '#ffd34d', t: 0 });
  burst(e.x, e.y, e.color, e.type === 'boss' ? 40 : 12);
  tone(e.type === 'boss' ? 90 : 220, 0.12, 'triangle', 0.06);
}

function damageEnemy(e, dmg, source) {
  e.hp -= dmg; e.flash = 0.08;
  if (source && source.def.slowFactor) { e.slowFactor = source.def.slowFactor; e.slowUntil = elapsed + source.def.slowDur; }
  if (e.hp <= 0 && !e.dead) {
    e.dead = true; killEnemy(e);
    if (source && source.def.splash) {
      for (const o of enemies) {
        if (o !== e && !o.dead && dist(e, o) <= source.def.splash) { o.hp -= Math.round(dmg * 0.6); o.flash = 0.08; if (o.hp <= 0 && !o.dead) { o.dead = true; killEnemy(o); } }
      }
    }
  }
}

function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 110; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.45, color }); } }

// --- WebAudio: all sounds are synthesized locally, no audio files ---
let audioCtx = null;
function tone(freq, dur, type, vol) {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.04, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (err) { /* audio unavailable: game continues silently */ }
}

function update(dt) {
  elapsed += dt;
  if (waveActive && spawnQueue.length) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnEnemy(spawnQueue.shift()); spawnTimer = wave >= 10 ? 0.45 : 0.7; }
  }
  // Enemies
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    const slowed = elapsed < e.slowUntil;
    const sp = e.speed * (slowed ? e.slowFactor : 1);
    let move = sp * dt;
    while (move > 0 && e.wp < WAYPOINTS.length) {
      const target = WAYPOINTS[e.wp], dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= move) { e.x = target.x; e.y = target.y; e.progress += d; move -= d; e.wp++; }
      else { e.x += dx / d * move; e.y += dy / d * move; e.progress += move; move = 0; }
    }
    if (e.wp >= WAYPOINTS.length) { e.dead = true; e.leaked = true; leak(e); }
  }
  enemies = enemies.filter(e => !e.dead);
  // Towers
  for (const t of towers) {
    t.cooldown -= dt;
    let best = null, bestProg = -1;
    for (const e of enemies) if (dist(t, e) <= towerRange(t) && e.progress > bestProg) { best = e; bestProg = e.progress; }
    t.target = best;
    if (best) {
      t.angle = Math.atan2(best.y - t.y, best.x - t.x);
      if (t.cooldown <= 0) {
        t.cooldown = t.def.rate;
        projectiles.push({ x: t.x, y: t.y, target: best, speed: t.def.projSpeed, dmg: towerDamage(t), source: t, color: t.def.color });
        if (Math.random() < 0.35) tone(880 + Math.random() * 220, 0.04, 'square', 0.015);
      }
    }
  }
  // Projectiles
  for (const p of projectiles) {
    if (!p.target || p.target.dead || p.target.leaked) { p.done = true; continue; }
    const d = dist(p, p.target), step = p.speed * dt;
    if (d <= step + p.target.radius * 0.4) { damageEnemy(p.target, p.dmg, p.source); p.done = true; }
    else { p.x += (p.target.x - p.x) / d * step; p.y += (p.target.y - p.y) / d * step; }
  }
  projectiles = projectiles.filter(p => !p.done);
  for (const pt of particles) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; }
  particles = particles.filter(p => p.t < p.life);
  for (const f of floaters) { f.t += dt; f.y -= 28 * dt; }
  floaters = floaters.filter(f => f.t < 1.1);
  // Wave completion / victory
  if (waveActive && !spawnQueue.length && enemies.length === 0) {
    waveActive = false;
    const bonus = 20 + wave * 2; gold += bonus; score += wave * 25;
    if (wave >= MAX_WAVE) { score += lives * 50 + gold; endGame(true); return; }
    floaters.push({ x: 480, y: 300, text: 'Wave clear! +' + bonus + '💰 — press Space for next wave', color: '#39d98a', t: 0 });
    tone(660, 0.12, 'triangle', 0.06); setTimeout(() => tone(990, 0.16, 'triangle', 0.06), 120);
  }
  syncStats();
}

function endGame(won) {
  state = won ? 'win' : 'over'; waveActive = false;
  showOverlay(
    won ? '🏆 VICTORY!' : '💥 BASE OVERRUN',
    (won ? 'You held all 15 waves. The Starfall base is safe!' : 'The crawlers broke through on Wave ' + wave + '.') +
    '<br><br>⭐ Score: <b>' + score + '</b> &nbsp;·&nbsp; 🏆 Kills: <b>' + kills + '</b> &nbsp;·&nbsp; 🌊 Waves cleared: <b>' + (won ? MAX_WAVE : wave - (waveActive ? 1 : 0)) + '</b>',
    won ? '▶ &nbsp;Play Again' : '↻ &nbsp;Try Again'
  );
  tone(won ? 784 : 110, 0.35, 'triangle', 0.08);
  if (won) setTimeout(() => tone(1046, 0.4, 'triangle', 0.08), 180);
}

// --- Rendering ---
function draw() {
  ctx.clearRect(0, 0, W, H);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * TILE, y = r * TILE, isPath = PATH_TILES.has(c + ',' + r), d = decor[r * COLS + c];
    if (isPath) { ctx.fillStyle = '#8a6b45'; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x, y + (d * 24), TILE, 3); }
    else {
      ctx.fillStyle = (c + r) % 2 ? '#1d4a29' : '#215431';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      if (d > 0.55) ctx.fillRect(x + 6 + d * 20, y + 8 + d * 18, 3, 6);
      if (d > 0.82) { ctx.beginPath(); ctx.arc(x + 10 + d * 16, y + 26, 3, 0, 7); ctx.fill(); }
    }
  }
  // Spawn portal & base
  ctx.fillStyle = '#ff2e88'; ctx.beginPath(); ctx.arc(8, 100, 15, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('▼', 8, 105);
  ctx.fillStyle = '#5b8cff'; ctx.fillRect(928, 228, 32, 64);
  ctx.fillStyle = '#fff'; ctx.fillText('🏠', 944, 266);
  // Hover / placement preview
  if (hover && state === 'playing') {
    const { c, r } = hover, ok = canPlace(c, r) && placingId;
    if (placingId) {
      const def = TOWER_TYPES.find(t => t.id === placingId);
      ctx.fillStyle = gold >= def.cost ? 'rgba(57,217,138,0.35)' : 'rgba(255,93,115,0.35)';
      if (ok || gold < def.cost) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(c * TILE + 20, r * TILE + 20, def.range, 0, 7); ctx.stroke();
    }
  }
  if (selected) {
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.strokeRect(selected.col * TILE + 1, selected.row * TILE + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = 'rgba(255,211,77,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(selected.x, selected.y, towerRange(selected), 0, 7); ctx.stroke();
  }
  // Towers
  for (const t of towers) {
    ctx.fillStyle = '#26335f'; ctx.fillRect(t.col * TILE + 3, t.row * TILE + 3, TILE - 6, TILE - 6);
    ctx.strokeStyle = t.def.color; ctx.lineWidth = 2; ctx.strokeRect(t.col * TILE + 3, t.row * TILE + 3, TILE - 6, TILE - 6);
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle || 0);
    ctx.fillStyle = t.def.color; ctx.fillRect(0, -3, 17, 6); ctx.restore();
    ctx.font = '17px system-ui'; ctx.textAlign = 'center'; ctx.fillText(t.def.icon, t.x, t.y + 6);
    ctx.fillStyle = '#ffd34d';
    for (let i = 0; i < t.level; i++) ctx.fillRect(t.x - 10 + i * 8, t.y + 13, 6, 3);
  }
  // Enemies
  for (const e of enemies) {
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(e.x - e.radius * 0.3, e.y - e.radius * 0.3, e.radius * 0.35, 0, 7); ctx.fill();
    if (elapsed < e.slowUntil) { ctx.strokeStyle = '#6be7ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 3, 0, 7); ctx.stroke(); }
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(e.x - e.radius, e.y - e.radius - 10, w, 5);
    ctx.fillStyle = e.hp / e.maxHp > 0.35 ? '#39d98a' : '#ff5d73';
    ctx.fillRect(e.x - e.radius, e.y - e.radius - 10, w * Math.max(0, e.hp / e.maxHp), 5);
    if (e.type === 'boss') { ctx.font = '16px system-ui'; ctx.fillText('👑', e.x, e.y - e.radius - 14); }
  }
  // Projectiles, particles, floaters
  for (const p of projectiles) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); }
  for (const pt of particles) { ctx.globalAlpha = 1 - pt.t / pt.life; ctx.fillStyle = pt.color; ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4); }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
  for (const f of floaters) { ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
  ctx.globalAlpha = 1;
  if (state === 'playing' && !waveActive && wave < MAX_WAVE) {
    ctx.fillStyle = 'rgba(5,8,20,0.55)'; ctx.fillRect(300, 12, 360, 34);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui';
    ctx.fillText(wave === 0 ? 'Build towers, then press SPACE to start Wave 1' : 'Wave ' + wave + ' clear — press SPACE for Wave ' + (wave + 1), 480, 34);
  }
  if (paused && state === 'playing') {
    ctx.fillStyle = 'rgba(5,8,20,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px system-ui'; ctx.fillText('⏸ PAUSED — press P to resume', 480, 300);
  }
}

// --- UI ---
const $ = id => document.getElementById(id);
function syncStats() {
  $('gold').textContent = gold; $('lives').textContent = lives;
  $('wave').textContent = wave + ' / ' + MAX_WAVE; $('score').textContent = score;
  $('kills').textContent = kills;
  $('left').textContent = enemies.length + (spawnQueue ? spawnQueue.length : 0);
  $('startWaveBtn').disabled = state !== 'playing' || waveActive || wave >= MAX_WAVE;
  document.querySelectorAll('.tower-btn').forEach(b => { b.disabled = gold < Number(b.dataset.cost); });
  if (selected) updateSelectedBox();
}
function syncUI() { buildTowerButtons(); syncStats(); }
function buildTowerButtons() {
  const box = $('towers'); box.innerHTML = '';
  for (const def of TOWER_TYPES) {
    const b = document.createElement('button');
    b.className = 'tower-btn' + (placingId === def.id ? ' active' : '');
    b.dataset.cost = def.cost;
    b.innerHTML = '<span class="tname">' + def.icon + ' ' + def.name + ' [' + def.key + ']</span><br><span class="tcost">💰 ' + def.cost + '</span> · DMG ' + def.damage + ' · RNG ' + def.range + '<br><span class="tdesc">' + def.desc + '</span>';
    b.onclick = () => selectPlacing(def.id);
    box.appendChild(b);
  }
}
function selectPlacing(id) {
  placingId = placingId === id ? null : id; selected = null; $('selectedBox').classList.add('hidden');
  $('placeHint').textContent = placingId ? 'Placing: ' + TOWER_TYPES.find(t => t.id === id).name + ' — click a grass tile (Esc to cancel).' : 'Select a tower, then click a grass tile.';
  buildTowerButtons(); syncStats();
}
function canPlace(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS && !PATH_TILES.has(c + ',' + r) && !towers.some(t => t.col === c && t.row === r); }
function updateSelectedBox() {
  if (!selected) return;
  $('selTitle').textContent = selected.def.icon + ' ' + selected.def.name + ' — Lv ' + selected.level;
  const up = selected.level >= 3 ? 'Max level' : 'Upgrade: 💰 ' + upgradeCost(selected) + ' → DMG ' + Math.round(selected.def.damage * (1 + 0.6 * selected.level));
  $('selInfo').innerHTML = 'DMG ' + towerDamage(selected) + ' · Range ' + towerRange(selected) + ' · Rate ' + selected.def.rate + 's<br>' + up + '<br>Sell value: 💰 ' + Math.round(selected.totalInvested * 0.7);
  $('upgradeBtn').disabled = selected.level >= 3 || gold < upgradeCost(selected);
  $('upgradeBtn').textContent = selected.level >= 3 ? '⬆ Max Level' : '⬆ Upgrade (💰 ' + upgradeCost(selected) + ')';
}
function selectTower(t) {
  selected = t; placingId = null; buildTowerButtons();
  if (t) { $('selectedBox').classList.remove('hidden'); updateSelectedBox(); $('placeHint').textContent = t.def.name + ' selected.'; }
  else $('selectedBox').classList.add('hidden');
}

function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
  const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y, c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}
canvas.addEventListener('mousemove', e => { hover = canvasPos(e); });
canvas.addEventListener('mouseleave', () => { hover = null; });
canvas.addEventListener('click', e => {
  if (state !== 'playing') return;
  const { c, r } = canvasPos(e);
  if (placingId) {
    const def = TOWER_TYPES.find(t => t.id === placingId);
    if (!canPlace(c, r)) { $('placeHint').textContent = '❌ Cannot build there — path and occupied tiles are blocked.'; tone(160, 0.1, 'square', 0.05); return; }
    if (gold < def.cost) { $('placeHint').textContent = '❌ Not enough gold for ' + def.name + '.'; tone(160, 0.1, 'square', 0.05); return; }
    gold -= def.cost;
    const t = { col: c, row: r, x: c * TILE + 20, y: r * TILE + 20, def, level: 1, cooldown: 0, angle: -Math.PI / 2, totalInvested: def.cost, target: null };
    towers.push(t); tone(440, 0.07, 'triangle', 0.05); burst(t.x, t.y, def.color, 6);
    if (gold < def.cost) placingId = null;
    buildTowerButtons(); selectTower(t); syncStats(); return;
  }
  selectTower(towers.find(t => t.col === c && t.row === r) || null);
});

$('upgradeBtn').onclick = () => {
  if (!selected || selected.level >= 3 || gold < upgradeCost(selected)) return;
  gold -= upgradeCost(selected); selected.totalInvested += upgradeCost(selected); selected.level++;
  // note: cost for next level is computed from the new level by upgradeCost()
  tone(720, 0.1, 'triangle', 0.06); burst(selected.x, selected.y, '#ffd34d', 10); syncStats();
};
$('sellBtn').onclick = () => {
  if (!selected) return;
  gold += Math.round(selected.totalInvested * 0.7);
  towers = towers.filter(t => t !== selected); tone(300, 0.1, 'triangle', 0.05); selectTower(null); syncStats();
};
$('startWaveBtn').onclick = startWave;
$('pauseBtn').onclick = togglePause;
$('restartBtn').onclick = () => { resetGame(); state = 'playing'; hideOverlay(); };
$('speedBtn').onclick = () => { speedMul = speedMul === 1 ? 2 : 1; $('speedBtn').textContent = '⏩ Speed: ' + speedMul + '×'; };
$('soundBtn').onclick = toggleSound;
$('overlayBtn').onclick = () => { resetGame(); state = 'playing'; hideOverlay(); tone(600, 0.1, 'triangle', 0.05); };
function togglePause() { if (state === 'playing') { paused = !paused; $('pauseBtn').textContent = paused ? '▶ Resume (P)' : '⏸ Pause (P)'; } }
function toggleSound() { soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '🔊 Sound: On (M)' : '🔇 Sound: Off (M)'; }
function showOverlay(title, html, btn) { $('overlayTitle').innerHTML = title; $('overlayText').innerHTML = html; $('overlayBtn').innerHTML = btn; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (state === 'playing' && !paused) startWave(); }
  else if (e.key === 'p' || e.key === 'P') togglePause();
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.key === 'Escape') { placingId = null; selectTower(null); buildTowerButtons(); $('placeHint').textContent = 'Select a tower, then click a grass tile.'; }
  else if (['1', '2', '3', '4'].includes(e.key)) { const def = TOWER_TYPES.find(t => t.key === e.key); if (def) selectPlacing(def.id); }
});

// --- Main loop ---
let last = performance.now();
function loop(now) {
  const rawDt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'playing' && !paused) { let remaining = rawDt * speedMul; while (remaining > 0) { const step = Math.min(remaining, 0.033); update(step); remaining -= step; if (state !== 'playing') break; } }
  draw();
  requestAnimationFrame(loop);
}
resetGame(); state = 'menu';
requestAnimationFrame(loop);
