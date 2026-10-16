(function () {
window.startForestGame = function () {
const { createView, getEnemyHitRadius } = window.ForestRender;
const { initializeAudio, isAudioEnabled, playSound, setAudioEnabled } = window.ForestAudio;
const { separateOverlappingEnemies } = window.ForestCombat;

// ===== 設定 =====
const PLAYER_R = 14;
const BASE_SPEED = 170;
const BULLET_SPEED = 540;
// Keep all enemies active in gameplay, while the renderer culls distant models.
const MAX_ENEMIES = 1000;
const MAX_RECOVERIES = 80;
const MAX_PROJECTILES = 600;
const PROJECTILE_GRID_SIZE = 64;
const MAX_ENEMY_HIT_RADIUS = 48;
const SPAWN_DIST = 480;
const WAVE_ASSAULT_DURATION = 23;
const WAVE_REST_DURATION = 7;
const WAVE_CYCLE_DURATION = WAVE_ASSAULT_DURATION + WAVE_REST_DURATION;

const WEAPON_DEFS = {
  wand:  { name: '魔法の矢',   desc: '最も近い敵に矢を放つ', max: 5 },
  whip:  { name: '鞭',         desc: '向いている方向を薙ぎ払う', max: 5 },
  orbit: { name: '回転する刃', desc: '周囲を回る刃で斬る', max: 5 },
  aura:  { name: '聖なる結界', desc: '周囲の敵に継続ダメージ', max: 5 },
};

// 弾の種類（魔法の矢に付与される）
const MOD_DEFS = {
  pierce:  { name: '貫通弾', desc: '魔法の矢が敵を貫通（+1体）', max: 3 },
  homing:  { name: '追尾弾', desc: '魔法の矢が敵へ軌道修正', max: 3 },
  chain:   { name: '連鎖弾', desc: '命中後に近くの敵へ跳ぶ', max: 3 },
  explode: { name: '爆裂弾', desc: '命中地点に爆風を起こす', max: 3 },
};

const PASSIVE_DEFS = {
  hp:     { name: 'ハート',     desc: '最大HP +20（回復も）', max: 5 },
  speed:  { name: 'ブーツ',     desc: '移動速度 +10%', max: 5 },
  dmg:    { name: 'ほうれん草', desc: 'ダメージ +15%', max: 5 },
  cd:     { name: '砂時計',     desc: '全武器の間隔 -8%', max: 5 },
  rapid:  { name: '連射薬',     desc: '魔法の矢の間隔 -12%', max: 5 },
  multi:  { name: '多重弾',     desc: '魔法の矢の同時発射 +1', max: 3 },
  magnet: { name: '磁石',       desc: '回収範囲 +30%', max: 5 },
};

const KIND_DEFS = { weapon: WEAPON_DEFS, mod: MOD_DEFS, passive: PASSIVE_DEFS };
const KIND_LABEL = { weapon: '武器', mod: '弾', passive: '能力' };

// 各スキルのアクセントカラー（カード・チップ用）
const COLORS = {
  wand: '#ffe066', whip: '#f5f5f5', orbit: '#7ef0ff', aura: '#ffb347',
  pierce: '#ffe066', homing: '#c77dff', chain: '#5ff0ff', explode: '#ff8a3d',
  hp: '#ff6b8a', speed: '#7ef0a0', dmg: '#a3ff6b', cd: '#ffd27a',
  rapid: '#ffa6e0', multi: '#8ab4ff', magnet: '#5fd8ff',
};

const ENEMY_DEFS = {
  slime: { hp: 18, speed: 55, dmg: 8, xp: 1, color: '#6fd36f' },
  bat: { hp: 9, speed: 105, dmg: 6, xp: 1, color: '#b07cff' },
  skeleton: { hp: 32, speed: 72, dmg: 10, xp: 2, color: '#e8dfc7' },
  mushroom: { hp: 42, speed: 46, dmg: 12, xp: 3, color: '#ff8a55' },
  ghost: { hp: 34, speed: 86, dmg: 10, xp: 3, color: '#8be9ff' },
  ogre: { hp: 110, speed: 38, dmg: 18, xp: 5, color: '#e0664a' },
  armored: { hp: 200, speed: 30, dmg: 20, xp: 8, color: '#85bfff' },
  dragon: { hp: 260, speed: 62, dmg: 24, xp: 12, color: '#ff5c79' },
};

const RANKING_STORAGE_KEY = 'forest-survival-ranking-v1';
const RANKING_LIMIT = 20;

// ===== DOM =====
const hudEl = document.getElementById('hud');
const hpFill = document.getElementById('hp-fill');
const hpText = document.getElementById('hp-text');
const hpRow = hpText.closest('.hp-row');
const xpFill = document.getElementById('xp-fill');
const lvText = document.getElementById('lv-text');
const killText = document.getElementById('kill-text');
const timerEl = document.getElementById('timer');
const weaponListEl = document.getElementById('weapon-list');
const passiveListEl = document.getElementById('passive-list');
const menuEl = document.getElementById('menu');
const cardsEl = document.getElementById('cards');
const screenEl = document.getElementById('screen');
const padStatus = document.getElementById('pad-status');
const soundToggle = document.getElementById('sound-toggle');
const waveStatus = document.getElementById('wave-status');

// ===== 入力（ゲームパッド優先、キーボードも対応） =====
const heldKeys = new Set();
const pressedKeys = new Set();
const prevPad = { up: false, down: false, left: false, right: false, a: false, b: false, start: false };
let prevStickX = 0;

window.addEventListener('keydown', (e) => {
  initializeAudio(true);
  if (!heldKeys.has(e.code)) pressedKeys.add(e.code);
  heldKeys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => heldKeys.delete(e.code));
window.addEventListener('blur', () => heldKeys.clear());
window.addEventListener('pointerdown', () => initializeAudio(true));
window.addEventListener('pointerup', () => initializeAudio(true));
window.addEventListener('touchend', () => initializeAudio(true), { passive: true });
window.addEventListener('gamepadconnected', () => initializeAudio(true));

// 効果音は毎回ONで起動し、画面上のボタンでON/OFFを切り替えるだけにする。
function updateSoundToggle() {
  const enabled = isAudioEnabled();
  soundToggle.textContent = enabled ? '🔊 効果音 ON' : '🔇 効果音 OFF';
  soundToggle.setAttribute('aria-pressed', String(enabled));
}

soundToggle.addEventListener('click', () => {
  const enable = !isAudioEnabled();
  setAudioEnabled(enable);
  if (enable) {
    initializeAudio(true);
    // The toggle click is a browser-approved user gesture; give immediate feedback.
    playSound('select');
  }
  updateSoundToggle();
});
updateSoundToggle();

function getPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

function deadzone(v) {
  return Math.abs(v) < 0.2 ? 0 : v;
}

function pollInput() {
  const pad = getPad();
  const now = { up: false, down: false, left: false, right: false, a: false, b: false, start: false };
  let sx = 0;
  let sy = 0;

  if (pad) {
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    now.up = btn(12);
    now.down = btn(13);
    now.left = btn(14);
    now.right = btn(15);
    now.a = btn(0);
    now.b = btn(1);
    now.ranking = btn(3);
    now.start = btn(9);
    sx = deadzone(pad.axes[0]);
    sy = deadzone(pad.axes[1]);
    if (now.a || now.start) initializeAudio(true);
  }

  const isDown = (...codes) => codes.some((c) => heldKeys.has(c));
  const isPressed = (...codes) => codes.some((c) => pressedKeys.has(c));
  const edge = (name) => now[name] && !prevPad[name];

  // 移動ベクトル（スティック・十字ボタン・WASD/矢印）
  let mx = sx + (now.right ? 1 : 0) - (now.left ? 1 : 0);
  let my = sy + (now.down ? 1 : 0) - (now.up ? 1 : 0);
  mx += (isDown('KeyD', 'ArrowRight') ? 1 : 0) - (isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  my += (isDown('KeyS', 'ArrowDown') ? 1 : 0) - (isDown('KeyW', 'ArrowUp') ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }

  // メニュー移動（十字ボタン左右・スティックの倒し始めで1回だけ反応）
  let nav = 0;
  if (edge('left') || isPressed('ArrowLeft', 'KeyA')) nav = -1;
  if (edge('right') || isPressed('ArrowRight', 'KeyD')) nav = 1;
  if (sx <= -0.6 && prevStickX > -0.6) nav = -1;
  if (sx >= 0.6 && prevStickX < 0.6) nav = 1;

  const ranking = isPressed('KeyR') || (now.ranking && !prevPad.ranking);

  const input = {
    mx,
    my,
    nav,
    ok: edge('a') || isPressed('Enter', 'Space', 'KeyZ'),
    cancel: edge('b') || isPressed('KeyX', 'Backspace'),
    start: edge('start') || isPressed('Escape', 'KeyP'),
    ranking,
    pick: -1,
  };
  for (let i = 0; i < 3; i++) {
    if (isPressed('Digit' + (i + 1), 'Numpad' + (i + 1))) input.pick = i;
  }

  pressedKeys.clear();
  Object.assign(prevPad, now);
  prevStickX = sx;
  return input;
}

let lastPadName = null;
function updatePadStatus() {
  const pad = getPad();
  const name = pad ? pad.id : null;
  if (name === lastPadName) return;
  lastPadName = name;
  padStatus.textContent = name
    ? `ゲームパッド: ${name}`
    : 'ゲームパッド: 未接続（接続後、ボタンを1回押してください）';
  padStatus.classList.toggle('connected', !!name);
}

// ===== ゲーム状態 =====
let state = 'title'; // title | playing | paused | levelup | over
let run = null;
let menuOptions = [];
let menuCursor = 0;
let lastScreenState = null;
let hudKey = '';
let showingRanking = false;

const view = createView(document.getElementById('stage'));

function xpNeed(lv) {
  return Math.floor(5 + lv * lv * 1.6);
}

function loadRanking() {
  try {
    const stored = JSON.parse(localStorage.getItem(RANKING_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry) => entry && Number.isFinite(entry.time) && Number.isFinite(entry.level) && Number.isFinite(entry.kills))
      .sort((a, b) => b.time - a.time || b.level - a.level || b.kills - a.kills)
      .slice(0, RANKING_LIMIT);
  } catch {
    return [];
  }
}

function saveRunResult(result) {
  if (result.demo) return;
  const ranking = loadRanking();
  ranking.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: Math.max(0, Number(result.time) || 0),
    level: Math.max(1, Math.floor(Number(result.level) || 1)),
    kills: Math.max(0, Math.floor(Number(result.kills) || 0)),
    date: new Date().toISOString(),
  });
  ranking.sort((a, b) => b.time - a.time || b.level - a.level || b.kills - a.kills);
  try {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(ranking.slice(0, RANKING_LIMIT)));
  } catch {
    // Continue the run flow if browser storage is unavailable.
  }
}

function formatRankingDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function renderRanking() {
  const ranking = loadRanking();
  const rows = ranking.length
    ? ranking.map((entry, index) => `
        <tr>
          <td>${String(index + 1).padStart(2, '0')}</td>
          <td>${formatTime(entry.time)}</td>
          <td>Lv ${entry.level}</td>
          <td>${entry.kills}</td>
          <td>${formatRankingDate(entry.date)}</td>
        </tr>`).join('')
    : '<tr><td class="ranking-empty" colspan="5">まだ記録がありません。ゲームオーバーまで生き延びて記録を作ろう！</td></tr>';

  screenEl.innerHTML = `
    <section class="ranking-panel" role="dialog" aria-modal="true" aria-labelledby="ranking-title">
      <h1 id="ranking-title">SURVIVORS</h1>
      <p class="ranking-subtitle">ローカルランキング · 上位${RANKING_LIMIT}件（生存時間順）</p>
      <table class="ranking-table">
        <thead><tr><th>順位</th><th>生存時間</th><th>レベル</th><th>撃破</th><th>日付</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="ranking-actions"><button class="screen-button" type="button" data-ranking-close>タイトルへ戻る <span>パッド B ／ キーボード X・R</span></button></div>
    </section>`;
}

function closeRanking() {
  if (!showingRanking) return;
  showingRanking = false;
  lastScreenState = null;
}

function stats() {
  const ps = run.passive;
  return {
    speed: BASE_SPEED * (1 + 0.1 * ps.speed),
    dmg: 1 + 0.15 * ps.dmg,
    cd: 1 - 0.08 * ps.cd,
    rapid: 1 - 0.12 * ps.rapid,
    pickup: 60 * (1 + 0.3 * ps.magnet),
    maxHp: 100 + 20 * ps.hp,
  };
}

function newRun(demo = false) {
  showingRanking = false;
  lastScreenState = null;
  run = {
    demo,
    time: 0,
    kills: 0,
    level: 1,
    xp: 0,
    pendingLevels: 0,
    hurt: 0,
    spawnT: demo ? 0.35 : 1.8,
    waveNumber: 1,
    wavePhase: 'assault',
    surgeActive: false,
    events: [],
    player: { x: 0, y: 0, hp: 100, facing: { x: 1, y: 0 }, moving: false, invuln: 0 },
    passive: { hp: 0, speed: 0, dmg: 0, cd: 0, rapid: 0, multi: 0, magnet: 0 },
    mods: { pierce: 0, homing: 0, chain: 0, explode: 0 },
    weapons: [{ id: 'wand', lv: 1, t: 0, angle: 0 }],
    enemies: [],
    gems: [],
    recoveries: [],
    projs: [],
    effects: [],
    floaters: [],
  };
  run.events.push({ type: 'wave-start', wave: run.waveNumber, boss: false });
  state = demo ? 'title' : 'playing';
}

function goTitle() {
  showingRanking = false;
  newRun(true);
}

// ===== 更新 =====
function update(dt, inp) {
  if (state === 'title') {
    if (showingRanking) {
      if (inp.ranking || inp.cancel || inp.ok || inp.start) closeRanking();
    } else if (inp.ranking) {
      showingRanking = !showingRanking;
      lastScreenState = null;
    } else if (inp.ok || inp.start) {
      newRun();
    } else {
      if (!run || !run.demo) newRun(true);
      updatePlaying(dt, getDemoInput());
    }
  } else if (state === 'over') {
    if (inp.ok) newRun();
    else if (inp.cancel) goTitle();
  } else if (state === 'paused') {
    if (inp.start) state = 'playing';
    else if (inp.cancel) goTitle();
  } else if (state === 'levelup') {
    updateLevelUp(inp);
  } else if (state === 'playing') {
    updatePlaying(dt, inp);
  }
}

function updatePlaying(dt, inp) {
  if (inp.start && !run.demo) {
    state = 'paused';
    return;
  }

  const r = run;
  const p = r.player;
  const st = stats();

  r.time += dt;
  r.hurt = Math.max(0, r.hurt - dt);
  p.invuln -= dt;

  p.moving = !!(inp.mx || inp.my);
  if (p.moving) {
    p.x += inp.mx * st.speed * dt;
    p.y += inp.my * st.speed * dt;
    p.facing = { x: inp.mx, y: inp.my };
  }

  spawnEnemies(dt);
  for (const w of r.weapons) updateWeapon(w, dt, st);
  updateProjectiles(dt);
  updateEnemies(dt);
  updateGems(dt, st);
  updateRecoveries(dt, st);
  updateEffects(dt);

  if (p.hp <= 0) {
    if (r.demo) {
      newRun(true);
      return;
    }
    saveRunResult(r);
    state = 'over';
    return;
  }
  if (r.pendingLevels > 0) {
    if (r.demo) resolveDemoLevelUps();
    else startLevelUp();
  }
}

function getDemoInput() {
  const p = run.player;
  const angle = run.time * 0.48;
  const targetX = Math.cos(angle) * 120;
  const targetY = Math.sin(angle) * 90;
  let mx = -Math.sin(angle) * 0.55 + (targetX - p.x) / 120;
  let my = Math.cos(angle) * 0.42 + (targetY - p.y) / 90;
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  return { mx, my, start: false };
}

function resolveDemoLevelUps() {
  while (run.pendingLevels > 0) {
    const options = buildOptions();
    if (!options.length) {
      run.pendingLevels = 0;
      run.player.hp = Math.min(stats().maxHp, run.player.hp + 30);
      return;
    }
    applyOption(options[0]);
    run.pendingLevels--;
  }
}

function spawnEnemies(dt) {
  const r = run;

  const wave = Math.floor(r.time / WAVE_CYCLE_DURATION) + 1;
  const cycleTime = r.time % WAVE_CYCLE_DURATION;
  const phase = cycleTime < WAVE_ASSAULT_DURATION ? 'assault' : 'breather';
  const newWave = wave !== r.waveNumber;

  if (newWave) {
    r.waveNumber = wave;
    r.surgeActive = false;
    const boss = wave >= 4 && (wave - 4) % 4 === 0;
    r.events.push({ type: 'wave-start', wave, boss });
    r.spawnT = boss ? 1.1 : 1.8;
    if (boss) {
      spawnEnemy('dragon');
    }
  }

  if (phase !== r.wavePhase) {
    r.wavePhase = phase;
    if (phase === 'breather') r.events.push({ type: 'wave-rest', wave: r.waveNumber });
    else if (!newWave) r.events.push({ type: 'wave-start', wave: r.waveNumber, boss: false });
    if (phase === 'assault') r.spawnT = 1.8;
  }

  if (phase === 'breather') return;

  const phaseTime = cycleTime % 8;
  const surge = phaseTime >= 5.2 && phaseTime < 7.6;
  if (surge !== r.surgeActive) {
    r.surgeActive = surge;
    if (surge) r.events.push({ type: 'surge', wave: r.waveNumber });
  }

  r.spawnT -= dt;
  if (r.spawnT > 0) return;

  const progress = cycleTime / WAVE_ASSAULT_DURATION;
  const pressure = Math.min(1, (r.waveNumber - 1) * 0.13 + progress * 0.55);
  const interval = Math.max(0.42, 1.65 - pressure * 0.78);
  r.spawnT = interval * (surge ? 0.66 : 1.12) * (0.82 + Math.random() * 0.36);

  let count = 1 + Math.floor(Math.min(3, (r.waveNumber - 1) * 0.45));
  if (progress > 0.58) count++;
  if (surge) count += 1 + Math.floor(Math.random() * 2);
  else if (Math.random() < 0.18 + progress * 0.3) count++;
  count = Math.min(count, 7);

  const direction = Math.random() * Math.PI * 2;
  for (let i = 0; i < count && r.enemies.length < MAX_ENEMIES; i++) {
    const spread = (Math.random() - 0.5) * 0.72;
    spawnEnemy(pickEnemyType(), direction + spread);
  }
}

function pickEnemyType() {
  const t = run.time;
  const roll = Math.random();
  if (t > 150 && roll < 0.045) return 'dragon';
  if (t > 90 && roll < 0.13) return 'ghost';
  if (t > 75 && roll < 0.23) return 'armored';
  if (t > 45 && roll < 0.34) return 'mushroom';
  if (t > 60 && roll < 0.42) return 'ogre';
  if (t > 18 && roll < 0.55) return 'skeleton';
  if (t > 25 && roll < 0.65) return 'bat';
  return 'slime';
}

function spawnEnemy(type, angle = Math.random() * Math.PI * 2) {
  if (run.enemies.length >= MAX_ENEMIES) return;
  const def = ENEMY_DEFS[type];
  const p = run.player;
  const spawnRadius = run.demo
    ? 240 + (Math.random() - 0.5) * 72
    : SPAWN_DIST + (Math.random() - 0.5) * 64;
  run.enemies.push({
    type,
    x: p.x + Math.cos(angle) * spawnRadius,
    y: p.y + Math.sin(angle) * spawnRadius,
    hp: def.hp * (1 + run.time / 90),
    maxHp: def.hp * (1 + run.time / 90),
    armorHitT: 0,
    speed: def.speed,
    // 当たり判定半径は、描画モデルの外周をゲーム座標へ換算した値。
    r: getEnemyHitRadius(type),
    dmg: def.dmg,
    xp: def.xp,
    color: def.color,
    flash: 0,
    orbCd: 0,
    fireT: type === 'dragon' ? 1.1 + Math.random() * 0.6 : 0,
    dead: false,
  });
}

function fireDragonVolley(dragon, player) {
  const runProjectiles = run.projs;
  if (runProjectiles.length >= MAX_PROJECTILES) return;

  const aim = Math.atan2(player.y - dragon.y, player.x - dragon.x);
  const count = 2;
  const spread = 0.96;
  const speed = 170;
  const damage = Math.max(8, Math.round(dragon.dmg * 0.55));
  const available = Math.min(count, MAX_PROJECTILES - runProjectiles.length);

  for (let i = 0; i < available; i++) {
    const angle = count === 1 ? aim : aim - spread / 2 + (spread * i) / (count - 1);
    runProjectiles.push({
      x: dragon.x,
      y: dragon.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      dmg: damage,
      // 速度を落とした分、寿命を延ばして射程（約770px）を保つ。
      t: 4.5,
      r: 8,
      hostile: true,
      fire: true,
      owner: dragon,
      hit: new Set(),
      trail: [],
      pierce: 0,
      homing: 0,
      chain: 0,
      explode: 0,
    });
  }
  run.events.push({ type: 'dragon-breath', x: dragon.x, y: dragon.y, angle: aim });
}

function nearestEnemy(x, y, maxDist, exclude = null) {
  let best = null;
  let bestDist = maxDist;
  for (const e of run.enemies) {
    if (e.dead || (exclude && exclude.has(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

function damageEnemy(e, amount) {
  if (e.dead) return;
  e.hp -= amount;
  e.flash = 0.08;
  if (e.type === 'armored' && e.armorHitT <= 0) {
    e.armorHitT = 0.14;
    run.events.push({ type: 'armor-hit', x: e.x, y: e.y });
  }
  if (run.floaters.length < 150) {
    run.floaters.push({ x: e.x, y: e.y - e.r, text: String(Math.ceil(amount)), color: '#ffffff', t: 0.6 });
  }
  if (e.hp <= 0) {
    e.dead = true;
    run.kills++;
    run.gems.push({ x: e.x, y: e.y, v: e.xp });
    run.events.push({ type: 'kill', x: e.x, y: e.y, color: ENEMY_DEFS[e.type].color, enemyType: e.type });
    if (e.type === 'armored') {
      if (run.recoveries.length >= MAX_RECOVERIES) run.recoveries.shift();
      run.recoveries.push({ x: e.x, y: e.y, amount: 30, age: 0 });
      run.events.push({ type: 'heal-drop', x: e.x, y: e.y });
    }
  }
}

function normAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function auraRadius(w) {
  return 60 + w.lv * 12;
}

function updateWeapon(w, dt, st) {
  const r = run;
  const p = r.player;

  if (w.id === 'orbit') {
    w.angle += (2.4 + 0.1 * w.lv) * dt;
    const n = 1 + w.lv;
    const radius = 55 + w.lv * 4;
    const dmg = (6 + w.lv * 2) * st.dmg;
    for (let i = 0; i < n; i++) {
      const a = w.angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * radius;
      const oy = p.y + Math.sin(a) * radius;
      for (const e of r.enemies) {
        if (e.dead || e.orbCd > 0) continue;
        if (Math.hypot(e.x - ox, e.y - oy) < e.r + 7) {
          damageEnemy(e, dmg);
          r.events.push({ type: 'orbit-hit', x: e.x, y: e.y });
          e.orbCd = 0.4;
        }
      }
    }
    return;
  }

  if (w.id === 'aura') {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = 0.25;
    const radius = auraRadius(w);
    const dmg = (3 + w.lv * 1.5) * st.dmg;
    if (r.enemies.some((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < radius + e.r)) {
      r.events.push({ type: 'aura', x: p.x, y: p.y, radius });
    }
    for (const e of r.enemies) {
      if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < radius + e.r) damageEnemy(e, dmg);
    }
    return;
  }

  w.t -= dt;
  if (w.t > 0) return;

  if (w.id === 'wand') {
    const target = nearestEnemy(p.x, p.y, 600);
    if (!target) return;
    // 連射薬・砂時計で間隔が短くなる
    w.t = 0.9 * st.cd * st.rapid;
    const n = Math.ceil(w.lv / 2) + r.passive.multi;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const dmg = (10 + w.lv * 3) * st.dmg;
    for (let i = 0; i < n; i++) {
      fireBullet(base + (i - (n - 1) / 2) * 0.18, dmg);
    }
  } else if (w.id === 'whip') {
    w.t = 1.1 * st.cd;
    const range = 70 + w.lv * 10;
    const half = 0.9;
    const a = Math.atan2(p.facing.y, p.facing.x);
    const dmg = (12 + w.lv * 4) * st.dmg;
    r.effects.push({ type: 'whip', x: p.x, y: p.y, angle: a, range, half, t: 0.15, max: 0.15 });
    r.events.push({ type: 'whip', x: p.x, y: p.y, angle: a, range });
    for (const e of r.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      const diff = normAngle(Math.atan2(dy, dx) - a);
       if (Math.abs(diff) <= half || d < e.r + 12) {
         damageEnemy(e, dmg);
         r.events.push({ type: 'slash-hit', x: e.x, y: e.y, angle: a });
       }
    }
  }
}

function fireBullet(angle, dmg) {
  const p = run.player;
  const m = run.mods;
  run.projs.push({
    x: p.x,
    y: p.y,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    dmg,
    t: 1.6,
    pierce: m.pierce,
    homing: m.homing,
    chain: m.chain,
    explode: m.explode,
    hit: new Set(),
    trail: [],
  });
  run.events.push({ type: 'attack', x: p.x, y: p.y, angle });
}

function steerBullet(b, dt) {
  const target = nearestEnemy(b.x, b.y, 380, b.hit);
  if (!target) return;
  const speed = Math.hypot(b.vx, b.vy);
  const cur = Math.atan2(b.vy, b.vx);
  const want = Math.atan2(target.y - b.y, target.x - b.x);
  const maxTurn = (2 + b.homing * 2) * dt;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, normAngle(want - cur)));
  b.vx = Math.cos(cur + turn) * speed;
  b.vy = Math.sin(cur + turn) * speed;
}

function updateProjectiles(dt) {
  const r = run;
  const grid = new Map();
  for (const enemy of r.enemies) {
    if (enemy.dead) continue;
    const cellX = Math.floor(enemy.x / PROJECTILE_GRID_SIZE);
    const cellY = Math.floor(enemy.y / PROJECTILE_GRID_SIZE);
    const key = `${cellX},${cellY}`;
    let cell = grid.get(key);
    if (!cell) grid.set(key, (cell = []));
    cell.push(enemy);
  }

  for (const b of r.projs) {
    if (!b.hostile && b.homing > 0) steerBullet(b, dt);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.t -= dt;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 12) b.trail.shift();
    const collisionRadius = MAX_ENEMY_HIT_RADIUS + (b.r || 4);
    const minCellX = Math.floor((b.x - collisionRadius) / PROJECTILE_GRID_SIZE);
    const maxCellX = Math.floor((b.x + collisionRadius) / PROJECTILE_GRID_SIZE);
    const minCellY = Math.floor((b.y - collisionRadius) / PROJECTILE_GRID_SIZE);
    const maxCellY = Math.floor((b.y + collisionRadius) / PROJECTILE_GRID_SIZE);
    for (let cellX = minCellX; cellX <= maxCellX && b.t > 0; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY && b.t > 0; cellY++) {
        const cell = grid.get(`${cellX},${cellY}`);
        if (!cell) continue;
        for (const e of cell) {
          if (e.dead || e === b.owner || b.t <= 0 || b.hit.has(e)) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) >= e.r + (b.r || 4)) continue;
          if (b.hostile) {
            b.hit.add(e);
            damageEnemy(e, b.dmg);
            r.events.push({ type: 'fire-hit', x: e.x, y: e.y, enemyType: e.type });
            b.t = 0;
            break;
          }
          onBulletHit(b, e);
        }
      }
    }

    if (b.hostile) {
      if (b.t > 0 && Math.hypot(r.player.x - b.x, r.player.y - b.y) < PLAYER_R + b.r && r.player.invuln <= 0) {
        r.player.hp -= b.dmg;
        r.player.invuln = 0.5;
        r.hurt = 0.3;
        r.events.push({ type: 'hurt', x: r.player.x, y: r.player.y });
        if (r.floaters.length < 150) {
          r.floaters.push({ x: r.player.x, y: r.player.y - PLAYER_R, text: String(b.dmg), color: '#ff6b6b', t: 0.6 });
        }
        b.t = 0;
      }
      continue;
    }
  }
  r.projs = r.projs.filter((b) => b.t > 0);
}

function onBulletHit(b, e) {
  b.hit.add(e);
  damageEnemy(e, b.dmg);
  run.events.push({ type: 'hit', x: e.x, y: e.y, bullet: b, enemyType: e.type });

  if (b.explode > 0) explodeAt(e.x, e.y, b.explode, b.dmg * 0.5, e);

  if (b.chain > 0) {
    const next = nearestEnemy(e.x, e.y, 220, b.hit);
    if (next) {
      b.chain--;
      const speed = Math.hypot(b.vx, b.vy);
      const a = Math.atan2(next.y - e.y, next.x - e.x);
      b.vx = Math.cos(a) * speed;
      b.vy = Math.sin(a) * speed;
      b.x = e.x;
      b.y = e.y;
      run.events.push({ type: 'chain', x: e.x, y: e.y, tx: next.x, ty: next.y });
      return;
    }
  }

  if (b.pierce > 0) {
    b.pierce--;
    return;
  }
  b.t = 0;
}

function explodeAt(x, y, lv, dmg, except) {
  const radius = 50 + lv * 15;
  for (const e of run.enemies) {
    if (e.dead || e === except) continue;
    if (Math.hypot(e.x - x, e.y - y) < radius + e.r) damageEnemy(e, dmg);
  }
  run.events.push({ type: 'explode', x, y, radius });
}

function updateEnemies(dt) {
  const r = run;
  const p = r.player;
  for (const e of r.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    e.flash -= dt;
    e.armorHitT -= dt;
    e.orbCd -= dt;
    if (e.type === 'dragon') {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        fireDragonVolley(e, p);
        e.fireT = 1.5 + Math.random() * 0.45;
      }
    }
  }

  separateOverlappingEnemies(r.enemies);

  for (const e of r.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);

    if (d < e.r + PLAYER_R && p.invuln <= 0) {
      p.hp -= e.dmg;
      p.invuln = 0.5;
      r.hurt = 0.3;
      r.events.push({ type: 'hurt', x: p.x, y: p.y });
      if (r.floaters.length < 150) {
        r.floaters.push({ x: p.x, y: p.y - PLAYER_R, text: String(e.dmg), color: '#ff6b6b', t: 0.6 });
      }
    }
  }
  r.enemies = r.enemies.filter((e) => !e.dead);
}

function updateGems(dt, st) {
  const r = run;
  const p = r.player;
  for (const gem of r.gems) {
    const dx = p.x - gem.x;
    const dy = p.y - gem.y;
    const d = Math.hypot(dx, dy);
    if (d < st.pickup) {
      gem.x += (dx / d) * 420 * dt;
      gem.y += (dy / d) * 420 * dt;
    }
    if (d < PLAYER_R + 6) {
      gem.dead = true;
      r.events.push({ type: 'xp', x: gem.x, y: gem.y });
      collectXp(gem.v);
    }
  }
  r.gems = r.gems.filter((gem) => !gem.dead);
}

function updateRecoveries(dt, st) {
  const r = run;
  const p = r.player;
  const maxHp = st.maxHp;

  for (const item of r.recoveries) {
    item.age += dt;
    const dx = p.x - item.x;
    const dy = p.y - item.y;
    const d = Math.hypot(dx, dy);

    // Full-health players keep the pickup on the ground until it is useful.
    if (p.hp >= maxHp) continue;
    if (d < st.pickup) {
      const distance = Math.max(d, 0.001);
      const pull = 340 * dt;
      item.x += (dx / distance) * Math.min(pull, d);
      item.y += (dy / distance) * Math.min(pull, d);
    }
    if (d < PLAYER_R + 10) {
      item.dead = true;
      const healed = Math.min(item.amount, maxHp - p.hp);
      p.hp += healed;
      r.events.push({ type: 'heal', x: item.x, y: item.y, amount: healed });
      if (r.floaters.length < 150) {
        r.floaters.push({ x: p.x, y: p.y - PLAYER_R, text: `+${Math.ceil(healed)} HP`, color: '#7effae', t: 0.9 });
      }
    }
  }
  r.recoveries = r.recoveries.filter((item) => !item.dead);
}

function collectXp(v) {
  const r = run;
  r.xp += v;
  while (r.xp >= xpNeed(r.level)) {
    r.xp -= xpNeed(r.level);
    r.level++;
    r.pendingLevels++;
    r.events.push({ type: 'levelup', level: r.level });
  }
}

function updateEffects(dt) {
  const r = run;
  for (const ef of r.effects) ef.t -= dt;
  r.effects = r.effects.filter((ef) => ef.t > 0);
  for (const f of r.floaters) {
    f.t -= dt;
    f.y -= 30 * dt;
  }
  r.floaters = r.floaters.filter((f) => f.t > 0);
}

// ===== レベルアップ =====
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function currentLevel(kind, id) {
  if (kind === 'weapon') {
    const w = run.weapons.find((x) => x.id === id);
    return w ? w.lv : 0;
  }
  if (kind === 'mod') return run.mods[id];
  return run.passive[id];
}

function buildOptions() {
  const pool = [];
  for (const kind of Object.keys(KIND_DEFS)) {
    const defs = KIND_DEFS[kind];
    for (const id of Object.keys(defs)) {
      const lv = currentLevel(kind, id);
      if (lv < defs[id].max) pool.push({ kind, id, lv });
    }
  }
  return shuffle(pool).slice(0, 3);
}

function startLevelUp() {
  menuOptions = buildOptions();
  if (menuOptions.length === 0) {
    // 全部上限に達している場合は回復して続行
    run.pendingLevels = 0;
    run.player.hp = Math.min(stats().maxHp, run.player.hp + 30);
    state = 'playing';
    return;
  }
  menuCursor = 0;
  state = 'levelup';
  renderMenu();
}

function applyOption(opt) {
  run.events.push({ type: 'select' });
  if (opt.kind === 'weapon') {
    const w = run.weapons.find((x) => x.id === opt.id);
    if (w) w.lv++;
    else run.weapons.push({ id: opt.id, lv: 1, t: 0, angle: 0 });
  } else if (opt.kind === 'mod') {
    run.mods[opt.id]++;
  } else {
    run.passive[opt.id]++;
    if (opt.id === 'hp') {
      run.player.hp = Math.min(stats().maxHp, run.player.hp + 20);
    }
  }
}

function chooseOption(idx) {
  applyOption(menuOptions[idx]);
  run.pendingLevels--;
  if (run.pendingLevels > 0) startLevelUp();
  else state = 'playing';
}

function updateLevelUp(inp) {
  const n = menuOptions.length;
  if (inp.nav) {
    menuCursor = (menuCursor + inp.nav + n) % n;
    renderMenu();
  }
  if (inp.pick >= 0 && inp.pick < n) chooseOption(inp.pick);
  else if (inp.ok) chooseOption(menuCursor);
}

cardsEl.addEventListener('click', (ev) => {
  const card = ev.target.closest('.card');
  if (!card || state !== 'levelup') return;
  chooseOption(Number(card.dataset.idx));
});

// ===== UI =====
function formatTime(sec) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function renderMenu() {
  cardsEl.innerHTML = menuOptions.map((opt, i) => {
    const def = KIND_DEFS[opt.kind][opt.id];
    const status = opt.lv === 0 ? 'NEW!' : `Lv${opt.lv} → Lv${opt.lv + 1}`;
    return `
      <button class="card ${opt.kind} ${i === menuCursor ? 'selected' : ''}" data-idx="${i}" style="--c:${COLORS[opt.id]}">
        <span class="card-top"><span class="tag">${KIND_LABEL[opt.kind]}</span><span class="key">${i + 1}</span></span>
        <span class="name">${def.name}</span>
        <span class="desc">${def.desc}</span>
        <span class="status">${status}</span>
      </button>`;
  }).join('');
}

function updateHud() {
  const r = run;
  const st = stats();
  const hp = Math.max(0, r.player.hp);
  hpRow.classList.toggle('injured', hp < st.maxHp);
  hpFill.style.width = `${(hp / st.maxHp) * 100}%`;
  hpText.textContent = `${Math.ceil(hp)} / ${st.maxHp}`;
  xpFill.style.width = `${(r.xp / xpNeed(r.level)) * 100}%`;
  lvText.textContent = `Lv ${r.level}`;
  killText.textContent = `撃破 ${r.kills}`;
  timerEl.textContent = formatTime(r.time);
  const wave = Math.floor(r.time / WAVE_CYCLE_DURATION) + 1;
  const assault = r.time % WAVE_CYCLE_DURATION < WAVE_ASSAULT_DURATION;
  waveStatus.textContent = `WAVE ${wave} · ${assault ? 'RUSH' : 'BREATHER'} · 敵 ${r.enemies.length.toLocaleString('ja-JP')}`;
  waveStatus.classList.toggle('resting', !assault);

  const key = JSON.stringify([r.weapons.map((w) => [w.id, w.lv]), r.mods, r.passive]);
  if (key !== hudKey) {
    hudKey = key;
    weaponListEl.innerHTML = r.weapons.map((w) =>
      `<div class="chip" style="--c:${COLORS[w.id]}"><i></i>${WEAPON_DEFS[w.id].name} <b>Lv${w.lv}</b></div>`).join('');
    const mods = Object.keys(MOD_DEFS).filter((id) => r.mods[id] > 0)
      .map((id) => ({ id, name: MOD_DEFS[id].name, lv: r.mods[id] }));
    const passives = Object.keys(PASSIVE_DEFS).filter((id) => r.passive[id] > 0)
      .map((id) => ({ id, name: PASSIVE_DEFS[id].name, lv: r.passive[id] }));
    passiveListEl.innerHTML = [...mods, ...passives].map((c) =>
      `<div class="chip" style="--c:${COLORS[c.id]}"><i></i>${c.name} <b>Lv${c.lv}</b></div>`).join('');
  }
}

function screenHtml() {
  if (state === 'title') {
    return `
      <div class="title">
        <h1>魔物の森サバイバル</h1>
        <p class="sub">3D VAMPIRE-LIKE SHOOTER</p>
        <p class="demo-label"><span class="demo-live-dot"></span><span id="demo-status">LIVE DEMO</span><span class="demo-stats" id="demo-stats"></span></p>
        <ul class="controls">
          <li>左スティック / 十字ボタン：移動（キーボード：WASD・矢印）</li>
          <li>武器は自動で攻撃。レベルアップで武器・弾・能力を強化</li>
          <li>重装兵はとても頑丈。倒すと回復ハートを落とす</li>
          <li>【パッド】A：決定　Start：ポーズ　B：戻る　Y：ランキング</li>
          <li>【キーボード】Enter：決定　Esc / P：ポーズ　X：戻る　R：ランキング</li>
        </ul>
        <button class="screen-button" type="button" data-ranking-open>ランキングを見る <span>パッド Y ／ キーボード R</span></button>
        <p class="blink">Aボタン / Enter でスタート</p>
      </div>`;
  }
  if (state === 'paused') {
    return `
      <div class="title">
        <h1 class="small">PAUSE</h1>
        <p class="controls">Startボタン：再開　Bボタン：タイトルへ</p>
      </div>`;
  }
  if (state === 'over') {
    return `
      <div class="title">
        <h1 class="over">GAME OVER</h1>
        <div class="stats">
          <p>生存時間 <b>${formatTime(run.time)}</b></p>
          <p>到達レベル <b>${run.level}</b></p>
          <p>撃破数 <b>${run.kills}</b></p>
        </div>
        <p class="controls">Aボタン：もう一度　Bボタン：タイトルへ</p>
      </div>`;
  }
  return '';
}

function syncUi() {
  hudEl.classList.toggle('hidden', !run || state === 'title');
  menuEl.classList.toggle('hidden', state !== 'levelup');
  const screenOn = state === 'title' || state === 'paused' || state === 'over';
  const titleDemo = state === 'title' && !!run?.demo;
  document.body.classList.toggle('title-demo', titleDemo);
  screenEl.classList.toggle('hidden', !screenOn);
  if (state !== lastScreenState) {
    lastScreenState = state;
    if (screenOn) {
      if (state === 'title' && showingRanking) renderRanking();
      else screenEl.innerHTML = screenHtml();
    }
  }
  screenEl.classList.toggle('ranking-open', state === 'title' && showingRanking);
  if (titleDemo) {
    const demoStatusEl = document.getElementById('demo-status');
    const demoStatsEl = document.getElementById('demo-stats');
    if (demoStatusEl) demoStatusEl.textContent = 'LIVE DEMO';
    if (demoStatsEl) {
      demoStatsEl.textContent = `${formatTime(run.time)}　·　撃破 ${run.kills}　·　敵 ${run.enemies.length.toLocaleString('ja-JP')}`;
    }
  }
  if (run && state !== 'title') updateHud();
}

screenEl.addEventListener('click', (event) => {
  if (event.target.closest('[data-ranking-open]')) {
    showingRanking = true;
    lastScreenState = null;
  } else if (event.target.closest('[data-ranking-close]')) {
    closeRanking();
  }
});

// ===== メインループ =====
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  try {
    updatePadStatus();
    update(dt, pollInput());
    syncUi();
    view.render(run, now / 1000, dt);
  } catch (error) {
    console.error('[Game loop error; continuing next frame]', error);
  } finally {
    // Keep scheduling frames after a recoverable rendering or UI exception.
    requestAnimationFrame(loop);
  }
}
requestAnimationFrame(loop);
};
})();
