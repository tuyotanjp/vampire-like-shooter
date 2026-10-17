(function () {
window.initializeForestRender = function () {
const { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.ForestThree;
const { playSound } = window.ForestAudio;
const { getLevelUpIntensity } = window.ForestEffects;

// ゲーム座標(px)からワールド座標への変換係数
const S = 0.1;
const CHUNK = 40;
const TAU = Math.PI * 2;
const PARTICLE_MAX = 900;
const MAX_TRANSIENTS = 140;
const MAX_RECOVERIES = 80;
const MAX_TRANSIENTS_PER_FRAME = 18;
const MAX_GEMS = 1000;
const MOTE_N = 180;
const HERO_SCALE = 0.6;
// 敵の見た目の身長。円形当たり判定の半径は各モデルの実際の外周から求める。
const ENEMY_SIZE = 2.8 * HERO_SCALE;
const DRAGON_SIZE_MULTIPLIER = 3;
const ENEMY_HIT_RADIUS_LOCAL = new Map();
const ENEMY_HIT_RADIUS_PX = new Map();

const BULLET_COLORS = {
  plain: 0xfff4c2,
  pierce: 0xffe066,
  homing: 0xc77dff,
  chain: 0x5ff0ff,
  explode: 0xff8a3d,
  fire: 0xff4d1f,
};

const normAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (a, b, c) => {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ===== 共有マテリアル・ジオメトリ =====
const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });
const basic = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, ...opts });
const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
};

function makeHeartGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.38);
  shape.bezierCurveTo(-0.18, -0.2, -0.62, 0.12, -0.52, 0.43);
  shape.bezierCurveTo(-0.45, 0.68, -0.12, 0.68, 0, 0.4);
  shape.bezierCurveTo(0.12, 0.68, 0.45, 0.68, 0.52, 0.43);
  shape.bezierCurveTo(0.62, 0.12, 0.18, -0.2, 0, -0.38);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 8 });
}

const M = {
  robe: std(0x2f6fd6, { roughness: 0.45 }),
  robeDark: std(0x1d3f8a),
  gold: std(0xf2c14e, { metalness: 0.8, roughness: 0.3, emissive: 0x3a2600, emissiveIntensity: 0.4 }),
  skin: std(0xf3d1b0),
  hood: std(0x1f3a73, { roughness: 0.5 }),
  silver: std(0xdfe6f0, { metalness: 0.5, roughness: 0.3 }),
  scarf: std(0xe0485a, { roughness: 0.5 }),
  boots: std(0x1a1a28),
  staff: std(0x6b4a2b),
  cape: new THREE.MeshStandardMaterial({ color: 0x5b2a86, roughness: 0.7, side: THREE.DoubleSide }),
  glow: basic(0x7ef0ff),
  slime: std(0x5fd35f, { roughness: 0.2, emissive: 0x133d16, emissiveIntensity: 0.6 }),
  bone: std(0xe8dfc7, { roughness: 0.8 }),
  fungus: std(0xe45d49, { roughness: 0.5 }),
  fungusStem: std(0xf2d5a0, { roughness: 0.8 }),
  ghost: new THREE.MeshStandardMaterial({ color: 0x8be9ff, roughness: 0.25, transparent: true, opacity: 0.72, emissive: 0x174b6b, emissiveIntensity: 0.7 }),
  dragon: std(0x9f315c, { roughness: 0.42, emissive: 0x3a1028, emissiveIntensity: 0.35 }),
  dragonBelly: std(0xf0a65a, { roughness: 0.65 }),
  bat: std(0x6b3fb0, { emissive: 0x2a1450 }),
  wing: new THREE.MeshStandardMaterial({
    color: 0x8a5fd0, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
  }),
  ogre: std(0xc2543a),
  ogreHead: std(0xd9785a),
  horn: std(0xf0e6cc, { roughness: 0.4 }),
  stone: std(0x4a4256, { roughness: 0.95 }),
  armor: std(0x527ba7, { metalness: 0.78, roughness: 0.26, emissive: 0x102744, emissiveIntensity: 0.35 }),
  armorDark: std(0x263c58, { metalness: 0.62, roughness: 0.38 }),
  armorGold: std(0xffd26a, { metalness: 0.82, roughness: 0.22, emissive: 0x3d2100, emissiveIntensity: 0.4 }),
  heal: std(0xff496e, { roughness: 0.24, emissive: 0xa40736, emissiveIntensity: 1.25 }),
  healGlow: basic(0x7effb2),
  red: basic(0xff3344),
  white: basic(0xffffff),
  black: basic(0x111111),
  orb: basic(0xd9f2ff),
  gem: std(0x5fd8ff, { emissive: 0x3ab8ff, emissiveIntensity: 1.5, roughness: 0.2 }),
  trunk: std(0x4a2f1c),
  leaf: std(0x1f5a3a, { roughness: 0.9 }),
  leaf2: std(0x2a6e46, { roughness: 0.9 }),
};

const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  eye: new THREE.SphereGeometry(0.2, 10, 8),
  pupil: new THREE.SphereGeometry(0.1, 8, 6),
  wing: new THREE.PlaneGeometry(1.8, 0.9),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(0.2, 0.7, 8),
  orb: new THREE.SphereGeometry(0.2, 10, 8),
  gem: new THREE.OctahedronGeometry(0.18),
  heart: makeHeartGeometry(),
  trunk: new THREE.CylinderGeometry(0.12, 0.18, 1, 8),
  foliage: new THREE.ConeGeometry(0.9, 2.2, 8),
  bush: new THREE.SphereGeometry(0.55, 10, 8),
  rock: new THREE.DodecahedronGeometry(0.4),
};

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// 炎の形（しずく型・先端が少し揺れる）を描いたテクスチャ。外側の赤→橙→黄→白の順に芯が熱くなる。
function makeFlameTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const baseY = 118;

  const flamePath = (halfWidth, tipY, lean) => {
    const height = baseY - tipY;
    const cx = size / 2;
    g.beginPath();
    g.moveTo(cx + lean, tipY);
    g.bezierCurveTo(
      cx + halfWidth * 0.25 + lean * 0.4, tipY + height * 0.3,
      cx + halfWidth * 1.05, baseY - height * 0.5,
      cx + halfWidth * 0.72, baseY - height * 0.16,
    );
    g.bezierCurveTo(
      cx + halfWidth * 0.5, baseY + 2,
      cx - halfWidth * 0.5, baseY + 2,
      cx - halfWidth * 0.72, baseY - height * 0.16,
    );
    g.bezierCurveTo(
      cx - halfWidth * 1.05, baseY - height * 0.5,
      cx - halfWidth * 0.25 + lean * 0.4, tipY + height * 0.3,
      cx + lean, tipY,
    );
    g.closePath();
  };

  const layer = (halfWidth, tipY, lean, stops) => {
    const grad = g.createLinearGradient(0, tipY, 0, baseY);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    g.fillStyle = grad;
    flamePath(halfWidth, tipY, lean);
    g.fill();
  };

  g.globalCompositeOperation = 'lighter';
  // 外炎（赤〜橙）
  layer(34, 4, 9, [
    [0, 'rgba(255,40,0,0)'], [0.22, 'rgba(255,60,10,0.8)'],
    [0.6, 'rgba(255,120,15,0.95)'], [1, 'rgba(255,170,40,0.9)'],
  ]);
  // 中炎（橙〜黄）
  layer(23, 30, 5, [
    [0, 'rgba(255,150,20,0)'], [0.3, 'rgba(255,170,30,0.8)'],
    [1, 'rgba(255,225,100,1)'],
  ]);
  // 芯（白〜淡黄）
  layer(12, 66, 2, [
    [0, 'rgba(255,240,170,0)'], [0.4, 'rgba(255,245,190,0.85)'],
    [1, 'rgba(255,255,240,1)'],
  ]);
  return new THREE.CanvasTexture(c);
}

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3d5a3a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 20 + Math.random() * 40;
    const dark = Math.random() < 0.5;
    // タイルの端で切れないよう、四隅へずらして描く
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        const cx = x + ox;
        const cy = y + oy;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, dark ? 'rgba(10,20,10,0.35)' : 'rgba(90,120,70,0.25)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `hsla(${100 + Math.random() * 40}, ${30 + Math.random() * 30}%, ${24 + Math.random() * 18}%, 0.45)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(100, 100);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===== 敵のリグ（見た目の部品） =====
function measureEnemyRadius(root, anim, phase) {
  // 羽・手足・盾など見た目の部品を含め、頭上のHP表示だけを除外する。
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh && !object.userData.excludeFromHitbox && object.geometry.attributes.position) {
      meshes.push(object);
    }
  });

  const vertex = new THREE.Vector3();
  let radius = 0;
  // アニメーションの1周期を走査し、羽ばたきや揺れも外周に含める。
  for (let frame = 0; frame < 128; frame++) {
    anim((frame / 128) * TAU, phase);
    root.updateMatrixWorld(true);
    for (const object of meshes) {
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        vertex.set(positions.getX(i), positions.getY(i), positions.getZ(i));
        vertex.applyMatrix4(object.matrixWorld);
        radius = Math.max(radius, Math.hypot(vertex.x, vertex.z));
      }
    }
  }

  anim(0, phase);
  root.updateMatrixWorld(true);
  // 微小な頂点間の隙間・浮動小数点誤差を吸収する。
  return radius * 1.02;
}

function rig(root, float, bodies, height, anim, type) {
  const phase = Math.random() * TAU;
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });

  let hitRadius = ENEMY_HIT_RADIUS_LOCAL.get(type);
  if (hitRadius === undefined) {
    hitRadius = measureEnemyRadius(root, anim, phase);
    ENEMY_HIT_RADIUS_LOCAL.set(type, hitRadius);
  }

  return { root, float, bodies, height, anim, phase, hitRadius };
}

function enemyVisualScale(type, height) {
  const sizeMultiplier = type === 'dragon' ? DRAGON_SIZE_MULTIPLIER : 1;
  return (ENEMY_SIZE * sizeMultiplier) / height;
}

function makeSlime() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const body = mesh(G.sphere, M.slime, 0, 0.75, 0);
  body.scale.set(1, 0.75, 1);
  float.add(body);
  for (const sx of [-1, 1]) {
    float.add(mesh(G.eye, M.white, sx * 0.36, 1.0, 0.8));
    float.add(mesh(G.pupil, M.black, sx * 0.36, 1.0, 1.0));
  }
  return rig(root, float, [{ mesh: body, base: M.slime }], 1.5, (t, ph) => {
    const s = Math.sin(t * 6 + ph);
    body.scale.set(1 + s * 0.05, 0.75 + s * 0.06, 1 + s * 0.05);
    body.position.y = body.scale.y;
  }, 'slime');
}

function makeBat() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const body = mesh(G.sphere, M.bat, 0, 1.0, 0);
  body.scale.setScalar(0.6);
  float.add(body);
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.3, 1.0, 0);
    pivot.add(mesh(G.wing, M.wing, sx * 0.9, 0, 0));
    float.add(pivot);
    wings.push(pivot);
    const eye = mesh(G.eye, M.red, sx * 0.22, 1.1, 0.5);
    eye.scale.setScalar(0.5);
    float.add(eye);
  }
  return rig(root, float, [{ mesh: body, base: M.bat }], 1.4, (t, ph) => {
    const flap = Math.sin(t * 16 + ph) * 0.8;
    wings[0].rotation.z = flap;
    wings[1].rotation.z = -flap;
    float.position.y = 0.4 + Math.sin(t * 5 + ph) * 0.25;
  }, 'bat');
}

function makeOgre() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const body = mesh(G.box, M.ogre, 0, 0.9, 0);
  body.scale.set(1.6, 1.6, 1.3);
  float.add(body);
  const head = mesh(G.sphere, M.ogreHead, 0, 2.2, 0.05);
  head.scale.setScalar(0.6);
  float.add(head);
  for (const sx of [-1, 1]) {
    const horn = mesh(G.cone, M.horn, sx * 0.35, 2.75, 0);
    horn.rotation.z = -sx * 0.35;
    float.add(horn);
    const eye = mesh(G.eye, M.red, sx * 0.22, 2.3, 0.5);
    eye.scale.setScalar(0.6);
    float.add(eye);
    const foot = mesh(G.box, M.stone, sx * 0.45, 0.15, 0.1);
    foot.scale.set(0.5, 0.3, 0.7);
    float.add(foot);
  }
  return rig(root, float, [
    { mesh: body, base: M.ogre },
    { mesh: head, base: M.ogreHead },
  ], 2.8, (t, ph) => {
    float.position.y = Math.abs(Math.sin(t * 6 + ph)) * 0.12;
    body.rotation.z = Math.sin(t * 6 + ph) * 0.04;
  }, 'ogre');
}

function makeArmored() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);

  const body = mesh(G.box, M.armorDark, 0, 1.12, 0);
  body.scale.set(1.12, 1.34, 0.82);
  float.add(body);
  const chest = mesh(G.box, M.armor, 0, 1.48, 0.28);
  chest.scale.set(1.2, 0.78, 0.44);
  chest.rotation.x = -0.12;
  float.add(chest);
  const chestTrim = mesh(G.box, M.armorGold, 0, 1.43, 0.515);
  chestTrim.scale.set(0.72, 0.09, 0.035);
  float.add(chestTrim);

  const helmet = mesh(G.sphere, M.armor, 0, 2.48, 0.04);
  helmet.scale.set(0.69, 0.65, 0.62);
  float.add(helmet);
  const visor = mesh(G.box, M.armorDark, 0, 2.36, 0.56);
  visor.scale.set(0.58, 0.14, 0.12);
  float.add(visor);
  const crest = mesh(G.cone, M.armorGold, 0, 3.02, -0.03);
  crest.scale.set(1.05, 1.35, 1.05);
  float.add(crest);

  const shield = new THREE.Group();
  shield.position.set(-0.94, 1.2, 0.12);
  const shieldFace = mesh(G.box, M.armor, 0, 0.05, 0);
  shieldFace.scale.set(0.82, 1.18, 0.19);
  shieldFace.rotation.z = -0.13;
  shield.add(shieldFace);
  const shieldBoss = mesh(G.sphere, M.armorGold, 0, 0.1, 0.13);
  shieldBoss.scale.set(0.22, 0.28, 0.11);
  shield.add(shieldBoss);
  const shieldStripe = mesh(G.box, M.armorDark, 0, 0.05, 0.115);
  shieldStripe.scale.set(0.1, 0.9, 0.045);
  shield.add(shieldStripe);
  float.add(shield);

  const pauldrons = [];
  for (const sx of [-1, 1]) {
    const pauldron = mesh(G.sphere, M.armorGold, sx * 0.67, 1.94, 0);
    pauldron.scale.set(0.42, 0.34, 0.46);
    float.add(pauldron);
    pauldrons.push(pauldron);
    const arm = mesh(G.box, M.armorDark, sx * 0.77, 1.16, 0.02);
    arm.scale.set(0.29, 0.86, 0.36);
    arm.rotation.z = -sx * 0.12;
    float.add(arm);
    const leg = mesh(G.box, M.armorDark, sx * 0.3, 0.37, 0);
    leg.scale.set(0.42, 0.68, 0.48);
    float.add(leg);
    const greave = mesh(G.box, M.armor, sx * 0.3, 0.38, 0.24);
    greave.scale.set(0.32, 0.45, 0.16);
    float.add(greave);
  }

  const barBack = mesh(G.box, M.armorDark, 0, 3.27, 0.1);
  barBack.scale.set(1.65, 0.16, 0.08);
  barBack.userData.excludeFromHitbox = true;
  float.add(barBack);
  const healthFill = mesh(G.box, M.heal, 0, 3.28, 0.15);
  healthFill.scale.set(1.48, 0.085, 0.045);
  healthFill.userData.excludeFromHitbox = true;
  float.add(healthFill);
  const goldPip = mesh(G.box, M.armorGold, 0, 3.43, 0.12);
  goldPip.scale.set(0.32, 0.06, 0.06);
  goldPip.userData.excludeFromHitbox = true;
  float.add(goldPip);

  const view = rig(root, float, [
    { mesh: body, base: M.armorDark },
    { mesh: chest, base: M.armor },
    { mesh: helmet, base: M.armor },
    { mesh: shieldFace, base: M.armor },
    { mesh: shieldBoss, base: M.armorGold },
    ...pauldrons.map((part) => ({ mesh: part, base: M.armorGold })),
  ], 3.55, (t, ph) => {
    float.position.y = Math.abs(Math.sin(t * 4 + ph)) * 0.035;
    shield.rotation.z = Math.sin(t * 2.1 + ph) * 0.035;
  }, 'armored');
  view.healthFill = healthFill;
  view.healthFillBaseWidth = 1.48;
  return view;
}

function makeSkeleton() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const body = mesh(G.box, M.bone, 0, 1.05, 0);
  body.scale.set(0.72, 0.95, 0.42);
  float.add(body);
  const skull = mesh(G.sphere, M.bone, 0, 2.0, 0.05);
  skull.scale.set(0.72, 0.68, 0.65);
  float.add(skull);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = mesh(G.eye, M.red, sx * 0.23, 2.08, 0.57);
    eyes.push(eye);
    float.add(eye);
    const arm = mesh(G.box, M.bone, sx * 0.58, 1.1, 0);
    arm.scale.set(0.2, 0.9, 0.22);
    arm.rotation.z = sx * -0.18;
    float.add(arm);
    const leg = mesh(G.box, M.bone, sx * 0.22, 0.32, 0);
    leg.scale.set(0.22, 0.65, 0.24);
    float.add(leg);
  }
  return rig(root, float, [{ mesh: body, base: M.bone }, { mesh: skull, base: M.bone }], 2.5, (t, ph) => {
    float.position.y = Math.abs(Math.sin(t * 7 + ph)) * 0.09;
    eyes.forEach((eye) => { eye.material = M.red; });
  }, 'skeleton');
}

function makeMushroom() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const stem = mesh(G.sphere, M.fungusStem, 0, 0.72, 0);
  stem.scale.set(0.66, 0.8, 0.58);
  float.add(stem);
  const cap = mesh(G.sphere, M.fungus, 0, 1.48, 0);
  cap.scale.set(1.0, 0.52, 0.95);
  float.add(cap);
  const spots = [];
  for (const [x, z, size] of [[-0.42, 0.53, 0.17], [0.36, 0.61, 0.13], [0.05, 0.83, 0.11]]) {
    const spot = mesh(G.sphere, M.horn, x, 1.59, z);
    spot.scale.setScalar(size);
    float.add(spot);
    spots.push(spot);
  }
  for (const sx of [-1, 1]) {
    float.add(mesh(G.eye, M.black, sx * 0.22, 0.87, 0.5));
  }
  return rig(root, float, [{ mesh: stem, base: M.fungusStem }, { mesh: cap, base: M.fungus }], 2.0, (t, ph) => {
    float.position.y = Math.sin(t * 3 + ph) * 0.08;
    cap.rotation.z = Math.sin(t * 2 + ph) * 0.06;
  }, 'mushroom');
}

function makeGhost() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const body = mesh(G.sphere, M.ghost, 0, 1.15, 0);
  body.scale.set(0.82, 1.05, 0.72);
  float.add(body);
  const tail = [];
  for (let i = 0; i < 3; i++) {
    const point = mesh(G.sphere, M.ghost, (i - 1) * 0.48, 0.35, 0);
    point.scale.set(0.3, 0.42, 0.34);
    float.add(point);
    tail.push(point);
  }
  for (const sx of [-1, 1]) {
    const eye = mesh(G.eye, M.bat, sx * 0.25, 1.4, 0.62);
    eye.scale.set(0.65, 0.9, 0.65);
    float.add(eye);
  }
  return rig(root, float, [{ mesh: body, base: M.ghost }, ...tail.map((point) => ({ mesh: point, base: M.ghost }))], 2.2, (t, ph) => {
    float.position.y = 0.25 + Math.sin(t * 3.5 + ph) * 0.28;
    tail.forEach((point, i) => { point.position.y = 0.42 + Math.sin(t * 4 + ph + i) * 0.1; });
  }, 'ghost');
}

function makeDragon() {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const body = mesh(G.sphere, M.dragon, 0, 1.35, 0);
  body.scale.set(0.86, 0.9, 1.15);
  float.add(body);
  const belly = mesh(G.sphere, M.dragonBelly, 0, 1.2, 0.58);
  belly.scale.set(0.55, 0.66, 0.65);
  float.add(belly);
  const head = mesh(G.sphere, M.dragon, 0, 2.2, 0.72);
  head.scale.set(0.64, 0.57, 0.72);
  float.add(head);
  const snout = mesh(G.sphere, M.dragonBelly, 0, 2.0, 1.25);
  snout.scale.set(0.4, 0.28, 0.48);
  float.add(snout);
  const wings = [];
  for (const sx of [-1, 1]) {
    const horn = mesh(G.cone, M.horn, sx * 0.42, 2.62, 0.68);
    horn.rotation.z = -sx * 0.5;
    float.add(horn);
    const eye = mesh(G.eye, M.red, sx * 0.36, 2.28, 1.18);
    float.add(eye);
    const wing = new THREE.Group();
    wing.position.set(sx * 0.55, 1.72, -0.25);
    const membrane = mesh(G.wing, M.dragon, sx * 0.7, 0, -0.05);
    membrane.scale.set(1.25, 1.15, 1);
    wing.add(membrane);
    float.add(wing);
    wings.push(wing);
  }
  const tail = mesh(G.cone, M.dragon, 0, 1.05, -1.2);
  tail.rotation.x = Math.PI / 2;
  tail.scale.set(1.1, 2.0, 1.1);
  float.add(tail);
  return rig(root, float, [{ mesh: body, base: M.dragon }, { mesh: belly, base: M.dragonBelly }, { mesh: head, base: M.dragon }], 3.1, (t, ph) => {
    float.position.y = Math.sin(t * 4 + ph) * 0.12;
    wings[0].rotation.z = Math.sin(t * 8 + ph) * 0.42;
    wings[1].rotation.z = -Math.sin(t * 8 + ph) * 0.42;
    tail.rotation.y = Math.sin(t * 3 + ph) * 0.25;
  }, 'dragon');
}

function getEnemyHitRadius(type) {
  let radius = ENEMY_HIT_RADIUS_PX.get(type);
  if (radius !== undefined) return radius;

  const makeEnemy = ENEMY_FACTORY[type];
  if (!makeEnemy) return 0;

  const view = makeEnemy();
  radius = Math.ceil(view.hitRadius * enemyVisualScale(type, view.height) / S);
  ENEMY_HIT_RADIUS_PX.set(type, radius);
  return radius;
}

const ENEMY_FACTORY = {
  slime: makeSlime,
  bat: makeBat,
  skeleton: makeSkeleton,
  mushroom: makeMushroom,
  ghost: makeGhost,
  ogre: makeOgre,
  armored: makeArmored,
  dragon: makeDragon,
};

// ===== ヒーロー（魔法使いの少女）=====
function makeHero(glowTex) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // マント（風になびくように頂点を毎フレーム動かす）
  const capeGeo = new THREE.PlaneGeometry(0.9, 1.4, 3, 8);
  const cape = new THREE.Mesh(capeGeo, M.cape);
  cape.position.set(0, 1.3, -0.36);
  body.add(cape);
  const capeBase = capeGeo.attributes.position.array.slice();

  // ローブ（胴体）と金の装飾
  body.add(mesh(new THREE.CylinderGeometry(0.42, 0.72, 1.5, 18), M.robe, 0, 1.0, 0));
  const hem = mesh(new THREE.TorusGeometry(0.72, 0.04, 8, 24), M.gold, 0, 0.26, 0);
  hem.rotation.x = Math.PI / 2;
  body.add(hem);
  const collar = mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 20), M.gold, 0, 1.72, 0);
  collar.rotation.x = Math.PI / 2;
  body.add(collar);
  const belt = mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 20), M.gold, 0, 0.95, 0);
  belt.rotation.x = Math.PI / 2;
  body.add(belt);
  body.add(mesh(new THREE.OctahedronGeometry(0.1), M.gem, 0, 1.35, 0.46));

  // 頭・フード・髪
  const head = new THREE.Group();
  head.position.y = 2.1;
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.4, 18, 14), M.skin));
  head.add(mesh(new THREE.SphereGeometry(0.5, 18, 14), M.hood, 0, 0.06, -0.25));
  const tip = mesh(new THREE.ConeGeometry(0.16, 0.6, 10), M.hood, 0, 0.45, -0.55);
  tip.rotation.x = -0.5;
  head.add(tip);
  for (const sx of [-1, 1]) {
    const strand = mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.6, 6), M.silver, sx * 0.3, -0.2, -0.3);
    strand.rotation.x = 0.3;
    head.add(strand);
    head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), M.gem, sx * 0.14, 0.0, 0.37));
  }

  // マフラー（尾は揺れる）
  body.add(mesh(new THREE.TorusGeometry(0.46, 0.1, 8, 20), M.scarf, 0, 1.78, 0).rotateX(Math.PI / 2));
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0.2, 1.8, -0.2);
  tailPivot.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.7), M.scarf, 0, -0.04, -0.4));
  body.add(tailPivot);

  // 腕（右手は杖を持つ）
  const armL = new THREE.Group();
  armL.position.set(-0.52, 1.8, 0);
  armL.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 1.0, 10), M.robe, 0, -0.5, 0));
  armL.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), M.skin, 0, -1.05, 0.05));
  body.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.52, 1.8, 0);
  armR.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 1.0, 10), M.robe, 0, -0.5, 0));
  armR.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), M.skin, 0, -1.05, 0.05));
  const staff = new THREE.Group();
  staff.position.set(0, -1.05, 0.12);
  staff.rotation.z = 0.08;
  staff.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 8), M.staff, 0, 1.3, 0));
  const staffOrb = mesh(new THREE.SphereGeometry(0.2, 16, 12), M.glow, 0, 2.75, 0);
  staff.add(staffOrb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x7ef0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.setScalar(1.6);
  halo.position.set(0, 2.75, 0);
  staff.add(halo);
  armR.add(staff);
  body.add(armR);

  // 脚
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.2, 0.9, 0);
    pivot.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), M.robeDark, 0, -0.35, 0));
    pivot.add(mesh(new THREE.BoxGeometry(0.26, 0.16, 0.4), M.boots, 0, -0.78, 0.05));
    root.add(pivot);
    legs.push(pivot);
  }

  // 足元のオーラ（結界の範囲表示）
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0x7ef0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  aura.visible = false;
  root.add(aura);

  root.scale.setScalar(HERO_SCALE);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });

  return { root, body, cape, capeGeo, capeBase, tailPivot, armL, armR, legs, staffOrb, halo, aura };
}

function animateHero(h, now, moving, speedMul) {
  const walk = moving ? Math.sin(now * 12) : 0;
  h.legs[0].rotation.x = walk * 0.7;
  h.legs[1].rotation.x = -walk * 0.7;
  h.armL.rotation.x = -walk * 0.4;
  h.armR.rotation.x = -0.4 + Math.sin(now * 2) * 0.05 + walk * 0.1;
  h.body.position.y = Math.abs(walk) * 0.08 + Math.sin(now * 2) * 0.02;
  h.tailPivot.rotation.x = 0.3 + Math.sin(now * 5) * 0.1 + (moving ? 0.3 : 0);
  h.staffOrb.scale.setScalar(1 + Math.sin(now * 6) * 0.1);

  // マントの揺れ：下端ほど大きく波打つ
  const attr = h.capeGeo.attributes.position;
  const amp = moving ? 1.4 : 0.5;
  for (let i = 0; i < attr.count; i++) {
    const y = h.capeBase[i * 3 + 1];
    const v = (0.7 - y) / 1.4;
    const z = -0.12 * v * amp - 0.06 * v * Math.sin(now * 6 - v * 5) * speedMul;
    attr.setZ(i, z);
  }
  attr.needsUpdate = true;
  h.capeGeo.computeVertexNormals();
}

// ===== 地面の装飾（木・水晶・岩）をチャンク単位で生成 =====
function makeDecorChunk(ci, cj) {
  const group = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const x = (ci + hash(ci, cj, k * 4 + 1)) * CHUNK;
    const z = (cj + hash(ci, cj, k * 4 + 2)) * CHUNK;
    if (Math.hypot(x, z) < 8) continue;
    const kind = hash(ci, cj, k * 4 + 3);
    const s = 0.8 + hash(ci, cj, k * 4 + 4) * 0.6;
    let obj;
    if (kind < 0.55) {
      obj = new THREE.Group();
      obj.add(mesh(G.trunk, M.trunk, 0, 0.5, 0));
      obj.add(mesh(G.foliage, M.leaf, 0, 1.9, 0));
      const top = mesh(G.foliage, M.leaf2, 0, 2.9, 0);
      top.scale.setScalar(0.7);
      obj.add(top);
    } else if (kind < 0.9) {
      // 光らない茂み（アイテムと見間違えないように発光させない）
      obj = new THREE.Group();
      obj.add(mesh(G.bush, M.leaf2, 0, 0.35, 0));
      const side = mesh(G.bush, M.leaf, 0.45, 0.25, 0.2);
      side.scale.setScalar(0.7);
      obj.add(side);
    } else {
      obj = mesh(G.rock, M.stone, 0, 0.2, 0);
    }
    obj.position.set(x, 0, z);
    obj.scale.multiplyScalar(s);
    obj.rotation.y = hash(ci, cj, k * 4 + 6) * TAU;
    group.add(obj);
  }
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return group;
}

// ===== 描画本体 =====
function createView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  const glRenderer = gl.getParameter(gl.RENDERER) || '';
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(glRenderer);
  renderer.setPixelRatio(softwareRenderer ? 0.75 : Math.min(window.devicePixelRatio, 1.15));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120c1c);
  scene.fog = new THREE.FogExp2(0x1a1030, 0.0065);

  const getCameraFov = () => window.innerWidth <= 700 && window.innerHeight > window.innerWidth ? 48 : 40;
  const camera = new THREE.PerspectiveCamera(getCameraFov(), window.innerWidth / window.innerHeight, 0.5, 800);
  const camPos = new THREE.Vector3(0, 30, 24);
  const shakeOffset = new THREE.Vector3();
  camera.position.copy(camPos);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.5, 0.55,
  );
  bloomPass.enabled = !softwareRenderer;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('WebGL context lost; waiting for browser restoration.');
  });

  // ライト
  scene.add(new THREE.HemisphereLight(0x9a7cff, 0x1b2a1a, 0.9));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.8);
  sun.castShadow = false;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const glowLight = new THREE.PointLight(0x7ef0ff, 4, 14, 1.6);
  scene.add(glowLight);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  scene.add(ground);

  // 舞い散る光の粒
  const moteBase = new Float32Array(MOTE_N * 3);
  for (let i = 0; i < MOTE_N; i++) {
    moteBase[i * 3] = (Math.random() - 0.5) * 80;
    moteBase[i * 3 + 1] = 0.5 + Math.random() * 4.5;
    moteBase[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  const motePos = new Float32Array(MOTE_N * 3);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xb8a2ff, size: 0.14, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.frustumCulled = false;
  scene.add(motes);

  // パーティクル（ポイントスプライト）
  const pPos = new Float32Array(PARTICLE_MAX * 3);
  const pCol = new Float32Array(PARTICLE_MAX * 3);
  const pBase = new Float32Array(PARTICLE_MAX * 3);
  const pVel = new Float32Array(PARTICLE_MAX * 3);
  const pLife = new Float32Array(PARTICLE_MAX);
  const pMax = new Float32Array(PARTICLE_MAX);
  let pHead = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  particles.frustumCulled = false;
  scene.add(particles);

  // 一時的なエフェクト（リング・雷光線）
  const transients = [];
  let transientBudget = MAX_TRANSIENTS_PER_FRAME;

  const glowTex = makeGlowTexture();
  const flameTex = makeFlameTexture();
  const decorMap = new Map();

  const hero = makeHero(glowTex);
  scene.add(hero.root);
  let heroYaw = 0;

  // 敵・弾・武器エフェクトの画面上の対応表
  const enemyViews = new Map();
  const bulletViews = new Map();
  const whipViews = new Map();
  const orbPool = [];
  const recoveryViews = new Map();
  const floaterEls = new Map();
  const damageLayer = document.getElementById('damage-layer');
  const enemyHealthLayer = document.getElementById('enemy-health-layer');
  const enemyHealthEls = new Map();
  const combatFlash = document.getElementById('combat-flash');
  const waveBanner = document.getElementById('wave-banner');
  const tmpV = new THREE.Vector3();

  // 宝石（InstancedMesh）
  const gemMesh = new THREE.InstancedMesh(G.gem, M.gem, MAX_GEMS);
  gemMesh.frustumCulled = false;
  scene.add(gemMesh);
  const recoveryMesh = new THREE.InstancedMesh(G.heart, M.heal, MAX_RECOVERIES);
  recoveryMesh.frustumCulled = false;
  scene.add(recoveryMesh);
  const recoveryGlows = Array.from({ length: MAX_RECOVERIES }, (_, i) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x73ffad, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, opacity: 0.9,
    }));
    glow.scale.set(0.8, 0.8, 1);
    scene.add(glow);
    return glow;
  });
  const dummy = new THREE.Object3D();

  // 今フレームの基準位置（各 update 関数から参照）
  let fx = 0;
  let fz = 0;
  let ft = 0;
  let fPlayer = null;
  let hitShake = 0;
  let flashAnimation = null;

  function screenFlash(color, strength = 0.3, duration = 220) {
    combatFlash.style.setProperty('--flash-color', color);
    flashAnimation?.cancel();
    flashAnimation = combatFlash.animate(
      [{ opacity: 0 }, { opacity: strength, offset: 0.16 }, { opacity: 0 }],
      { duration, easing: 'ease-out' },
    );
  }

  function showBanner(text, { boss = false, duration = 2300 } = {}) {
    waveBanner.textContent = text;
    waveBanner.classList.toggle('boss', boss);
    waveBanner.style.setProperty('--banner-duration', `${duration}ms`);
    waveBanner.classList.remove('show');
    void waveBanner.offsetWidth;
    waveBanner.classList.add('show');
  }

  function bulletColor(b) {
    if (b.fire) return BULLET_COLORS.fire;
    if (b.fire) return BULLET_COLORS.fire;
    if (b.explode > 0) return BULLET_COLORS.explode;
    if (b.homing > 0) return BULLET_COLORS.homing;
    if (b.chain > 0) return BULLET_COLORS.chain;
    if (b.pierce > 0) return BULLET_COLORS.pierce;
    return BULLET_COLORS.plain;
  }

  function burst(x, z, color, count, speed, life, height = 0.8) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = pHead;
      pHead = (pHead + 1) % PARTICLE_MAX;
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = height + Math.random() * 0.3;
      pPos[i * 3 + 2] = z;
      pVel[i * 3] = Math.cos(a) * s;
      pVel[i * 3 + 1] = speed * (0.3 + Math.random() * 0.6);
      pVel[i * 3 + 2] = Math.sin(a) * s;
      pBase[i * 3] = c.r;
      pBase[i * 3 + 1] = c.g;
      pBase[i * 3 + 2] = c.b;
      pLife[i] = life;
      pMax[i] = life;
    }
  }

  function spawnSparks(x, z, color, count, radius, life, direction = null, spread = TAU) {
    if (transientBudget <= 0) return;
    const positions = new Float32Array(count * 2 * 3);
    for (let i = 0; i < count; i++) {
      const angle = direction === null
        ? Math.random() * TAU
        : direction - spread / 2 + spread * (i / Math.max(1, count - 1)) + (Math.random() - 0.5) * 0.12;
      const length = radius * (0.35 + Math.random() * 0.75);
      const j = i * 6;
      positions[j] = Math.cos(angle) * 0.08;
      positions[j + 1] = 0.72 + Math.random() * 0.6;
      positions[j + 2] = Math.sin(angle) * 0.08;
      positions[j + 3] = Math.cos(angle) * length;
      positions[j + 4] = 0.72 + Math.random() * 0.8;
      positions[j + 5] = Math.sin(angle) * length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const streaks = new THREE.LineSegments(geo, material);
    streaks.position.set(x, 0, z);
    addTransient(streaks, life, (p) => {
      material.opacity = (1 - p) * (1 - p);
      streaks.scale.setScalar(0.72 + p * 0.8);
    });
  }

  function updateParticles(dt) {
    for (let i = 0; i < PARTICLE_MAX; i++) {
      if (pLife[i] <= 0) {
        pCol[i * 3] = 0;
        pCol[i * 3 + 1] = 0;
        pCol[i * 3 + 2] = 0;
        continue;
      }
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 9 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      const k = Math.max(0, pLife[i] / pMax[i]);
      pCol[i * 3] = pBase[i * 3] * k;
      pCol[i * 3 + 1] = pBase[i * 3 + 1] * k;
      pCol[i * 3 + 2] = pBase[i * 3 + 2] * k;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  function addTransient(obj, life, onUpdate) {
    if (transientBudget <= 0) {
      obj.geometry.dispose();
      obj.material.dispose();
      return;
    }
    if (transients.length >= MAX_TRANSIENTS) {
      const oldest = transients.shift();
      scene.remove(oldest.obj);
      oldest.obj.geometry.dispose();
      oldest.obj.material.dispose();
    }
    transientBudget--;
    scene.add(obj);
    transients.push({ obj, life, max: life, onUpdate });
  }

  function updateTransients(dt) {
    for (let i = transients.length - 1; i >= 0; i--) {
      const tr = transients[i];
      tr.life -= dt;
      tr.onUpdate(1 - Math.max(0, tr.life / tr.max));
      if (tr.life <= 0) {
        scene.remove(tr.obj);
        tr.obj.geometry.dispose();
        tr.obj.material.dispose();
        transients.splice(i, 1);
      }
    }
  }

  function spawnRing(x, z, color, r0, r1, life) {
    if (transientBudget <= 0) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.06, 64),
      new THREE.MeshBasicMaterial({
        color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.13, z);
    addTransient(ring, life, (p) => {
      ring.scale.setScalar(r0 + (r1 - r0) * p);
      ring.material.opacity = 1 - p;
    });
  }

  function spawnLevelBeam(x, z, color, height, life) {
    if (transientBudget <= 0) return;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 1.1, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.62, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    );
    beam.position.set(x, height * 0.5, z);
    addTransient(beam, life, (p) => {
      beam.material.opacity = 0.62 * (1 - p) * Math.min(1, p * 8 + 0.25);
      beam.scale.set(1 + p * 0.8, 1, 1 + p * 0.8);
    });
  }

  function spawnChainLine(ax, az, bx, bz) {
    if (transientBudget <= 0) return;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ax, 1.1, az),
      new THREE.Vector3(bx, 1.1, bz),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: BULLET_COLORS.chain, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    addTransient(line, 0.15, (p) => {
      line.material.opacity = 1 - p;
    });
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case 'whip': {
        playSound('attack');
        const x = ev.x * S;
        const z = ev.y * S;
        const radius = ev.range * S;
        spawnSparks(x, z, 0xffedac, 30, radius * 0.8, 0.3, ev.angle, 2.2);
        spawnRing(x, z, 0xffa640, 0.1, radius * 0.82, 0.3);
        screenFlash('rgba(255, 185, 66, 0.38)', 0.13, 170);
        break;
      }
      case 'attack': {
        playSound('attack');
        const x = ev.x * S;
        const z = ev.y * S;
        const color = 0xffef9a;
        burst(x, z, color, 30, 5.2, 0.4, 1.35);
        burst(x, z, 0xffffff, 10, 3.3, 0.22, 1.7);
        spawnRing(x, z, color, 0.04, 1.4, 0.24);
        spawnSparks(x, z, 0xffffff, 14, 1.45, 0.23, ev.angle, 1.35);
        screenFlash('rgba(255, 224, 120, 0.3)', 0.1, 120);
        break;
      }
      case 'dragon-breath': {
        const x = ev.x * S;
        const z = ev.y * S;
        playSound('explode');
        burst(x, z, 0xff4b16, 34, 6.2, 0.65, 1.05);
        burst(x, z, 0xffd34f, 18, 3.8, 0.42, 1.15);
        spawnSparks(x, z, 0xffe6a3, 14, 2.1, 0.24, ev.angle, 1.5);
        break;
      }
      case 'fire-hit': {
        burst(ev.x * S, ev.y * S, 0xff6a2e, 10, 2.6, 0.24, 0.7);
        spawnSparks(ev.x * S, ev.y * S, 0xffd06a, 5, 1.2, 0.14);
        break;
      }
      case 'dragon-breath': {
        const x = ev.x * S;
        const z = ev.y * S;
        playSound('explode');
        burst(x, z, 0xff4818, 48, 8.5, 0.82, 1.1);
        burst(x, z, 0xffbd42, 24, 4.2, 0.55, 1.2);
        spawnSparks(x, z, 0xffefaa, 22, 2.8, 0.32, ev.angle, 2.1);
        spawnRing(x, z, 0xff6b22, 0.06, 2.7, 0.36);
        break;
      }
      case 'fire-hit':
        burst(ev.x * S, ev.y * S, 0xff4c1e, 12, 3.1, 0.27, 0.75);
        spawnSparks(ev.x * S, ev.y * S, 0xffd76b, 7, 1.2, 0.18);
        break;
      case 'orbit-hit':
        burst(ev.x * S, ev.y * S, 0x8af4ff, 19, 5.1, 0.38, 1.1);
        spawnRing(ev.x * S, ev.y * S, 0x67eaff, 0.06, 1.35, 0.2);
        spawnSparks(ev.x * S, ev.y * S, 0xc7fbff, 8, 1.1, 0.16);
        spawnRing(ev.x * S, ev.y * S, 0xffffff, 0.04, 0.8, 0.14);
        break;
      case 'aura': {
        const radius = ev.radius * S;
        const color = 0xffb952;
        spawnRing(ev.x * S, ev.y * S, color, radius * 0.86, radius * 1.1, 0.24);
        spawnRing(ev.x * S, ev.y * S, 0xffeea1, radius * 0.96, radius * 1.04, 0.19);
        burst(ev.x * S, ev.y * S, color, 14, 3.4, 0.3, 1.35);
        break;
      }
      case 'slash-hit':
        burst(ev.x * S, ev.y * S, 0xfff1bd, 18, 5.4, 0.32, 1.3);
        spawnSparks(ev.x * S, ev.y * S, 0xffffff, 12, 1.65, 0.18, ev.angle, 2.1);
        spawnRing(ev.x * S, ev.y * S, 0xffb347, 0.04, 1.55, 0.2);
        break;
      case 'kill':
        playSound('kill');
        {
          const x = ev.x * S;
          const z = ev.y * S;
          const armored = ev.enemyType === 'armored';
          const elite = ev.enemyType === 'dragon' || ev.enemyType === 'ogre' || armored;
          burst(x, z, ev.color, elite ? 48 : 22, elite ? 8 : 5, elite ? 0.9 : 0.65, elite ? 1.1 : 0.8);
          burst(x, z, 0xfff2bf, elite ? 16 : 7, elite ? 5 : 3.5, 0.42, 1.05);
          spawnRing(x, z, ev.color, 0.12, elite ? 3.8 : 1.9, elite ? 0.62 : 0.38);
          spawnSparks(x, z, ev.color, elite ? 22 : 11, elite ? 3 : 1.8, 0.3);
          if (armored) {
            burst(x, z, 0xb7e4ff, 30, 7.5, 0.58, 1.45);
            spawnSparks(x, z, 0xffd26a, 18, 3.2, 0.25);
          }
          if (elite) {
            const flash = ev.enemyType === 'dragon' ? 'rgba(255, 56, 96, 0.68)' : armored ? 'rgba(126, 194, 255, 0.48)' : 'rgba(255, 132, 66, 0.5)';
            screenFlash(flash, armored ? 0.22 : 0.28, 300);
            hitShake = Math.max(hitShake, ev.enemyType === 'dragon' ? 0.85 : armored ? 0.55 : 0.45);
          }
        }
        break;
      case 'hit':
        playSound('hit');
        {
          const x = ev.x * S;
          const z = ev.y * S;
          const color = bulletColor(ev.bullet);
          const elite = ev.enemyType === 'dragon' || ev.enemyType === 'ogre' || ev.enemyType === 'armored';
          burst(x, z, color, elite ? 34 : 22, elite ? 7.4 : 5.8, 0.48, 1.12);
          burst(x, z, 0xffffff, elite ? 20 : 12, 4.2, 0.28, 1.35);
          spawnRing(x, z, color, 0.05, elite ? 2.3 : 1.55, elite ? 0.3 : 0.22);
          spawnRing(x, z, 0xffffff, 0.04, elite ? 1.3 : 0.88, 0.18);
          spawnSparks(x, z, 0xfff0b4, elite ? 15 : 10, elite ? 1.9 : 1.35, 0.19);
        }
        break;
      case 'armor-hit':
        playSound('armor');
        burst(ev.x * S, ev.y * S, 0x92d5ff, 8, 3.8, 0.24, 1.3);
        spawnSparks(ev.x * S, ev.y * S, 0xffdc7a, 6, 0.95, 0.16);
        break;
      case 'xp':
        playSound('xp');
        burst(ev.x * S, ev.y * S, 0x70eaff, 7, 2.8, 0.5, 0.7);
        break;
      case 'heal-drop':
        playSound('heal');
        burst(ev.x * S, ev.y * S, 0x74ffac, 20, 5, 0.75, 1.1);
        spawnRing(ev.x * S, ev.y * S, 0x7effb2, 0.08, 2.5, 0.65);
        break;
      case 'heal':
        playSound('heal');
        burst(ev.x * S, ev.y * S, 0x7effae, 28, 5.5, 0.82, 1.25);
        spawnRing(ev.x * S, ev.y * S, 0x7effae, 0.1, 2.7, 0.52);
        screenFlash('rgba(90, 255, 160, 0.52)', 0.25, 260);
        break;
      case 'hurt':
        playSound('hurt');
        screenFlash('rgba(255, 34, 72, 0.58)', 0.38, 260);
        hitShake = Math.max(hitShake, 0.72);
        if (ev.x !== undefined) spawnRing(ev.x * S, ev.y * S, 0xff4768, 0.12, 1.25, 0.32);
        break;
      case 'select':
        playSound('select');
        burst(fx, fz, 0xffd84d, 13, 4, 0.48, 1.5);
        break;
      case 'explode':
        playSound('explode');
        screenFlash('rgba(255, 112, 35, 0.48)', 0.2, 190);
        hitShake = Math.max(hitShake, 0.24);
        spawnRing(ev.x * S, ev.y * S, BULLET_COLORS.explode, 0.12, ev.radius * S * 1.45, 0.54);
        spawnRing(ev.x * S, ev.y * S, 0xffedab, 0.08, ev.radius * S * 0.92, 0.34);
        burst(ev.x * S, ev.y * S, BULLET_COLORS.explode, 42, 9, 0.72, 0.95);
        burst(ev.x * S, ev.y * S, 0xffe6a1, 18, 5.5, 0.44, 1.4);
        spawnSparks(ev.x * S, ev.y * S, 0xffc26b, 18, ev.radius * S, 0.26);
        break;
      case 'chain':
        spawnChainLine(ev.x * S, ev.y * S, ev.tx * S, ev.ty * S);
        burst(ev.tx * S, ev.ty * S, BULLET_COLORS.chain, 12, 4.5, 0.3, 1.1);
        spawnSparks(ev.x * S, ev.y * S, BULLET_COLORS.chain, 7, 1.2, 0.18);
        break;
      case 'levelup':
        playSound('levelup');
        {
          const level = Math.max(1, ev.level || 1);
          const effect = getLevelUpIntensity(level);
          const color = new THREE.Color().setHSL(effect.hue, 0.92, 0.62);
          const colorHex = color.getHex();
          screenFlash(`hsla(${Math.round(effect.hue * 360)}, 100%, 66%, 0.55)`, effect.flashStrength, effect.flashDuration);
          hitShake = Math.max(hitShake, effect.shake);
          spawnRing(fx, fz, colorHex, 0.18, effect.ringRadius, effect.ringLife);
          spawnRing(fx, fz, 0xffffff, 0.12, effect.ringRadius * 0.68, effect.secondaryRingLife);
          burst(fx, fz, colorHex, effect.outerCount, 8 + effect.power * 1.8, effect.outerLife, 1.2);
          burst(fx, fz, 0xffffff, effect.innerCount, 4.5 + effect.power, effect.innerLife, 1.8);
          spawnSparks(fx, fz, colorHex, effect.sparkCount, effect.sparkRadius, effect.sparkLife);
          if (effect.beam) {
            spawnLevelBeam(fx, fz, colorHex, effect.beamHeight, effect.beamLife);
          }
          if (effect.mastery) {
            spawnRing(fx, fz, 0xfff0b0, 0.08, effect.masteryRingScale, Math.min(1.35, 0.62 + level * 0.02));
            burst(fx, fz, 0xffd28a, effect.masteryCount, 7 + effect.power, effect.masteryLife, 2.2);
          }
          if (effect.ultimate) {
            spawnLevelBeam(fx, fz, 0xfff2bc, effect.ultimateBeamHeight, 1.8);
            screenFlash('rgba(255, 241, 190, 0.65)', effect.ultimateFlashStrength, 520);
          }
        }
        break;
      case 'wave-start':
        playSound(ev.boss ? 'boss' : 'wave');
        showBanner(ev.boss ? `BOSS WAVE ${ev.wave}` : `WAVE ${ev.wave}`, { boss: ev.boss, duration: ev.boss ? 3200 : 2200 });
        spawnRing(fx, fz, ev.boss ? 0xff4267 : 0xffd84d, 0.2, ev.boss ? 11 : 7, 0.75);
        burst(fx, fz, ev.boss ? 0xff4267 : 0xffd84d, ev.boss ? 42 : 20, ev.boss ? 7 : 4.5, 0.75, 0.9);
        screenFlash(ev.boss ? 'rgba(255, 48, 87, 0.62)' : 'rgba(255, 203, 61, 0.36)', ev.boss ? 0.34 : 0.16, ev.boss ? 360 : 240);
        hitShake = Math.max(hitShake, ev.boss ? 0.82 : 0.2);
        break;
      case 'wave-rest':
        playSound('select');
        showBanner('SPAWN BREAK', { duration: 1900 });
        break;
      case 'surge':
        playSound('wave');
        showBanner('ENEMY SURGE!', { duration: 1150 });
        burst(fx, fz, 0xff7857, 14, 4, 0.48, 1);
        break;
      default:
        break;
    }
  }

  // ----- 敵 -----
  function createEnemy(e) {
    const v = ENEMY_FACTORY[e.type]();
    v.enemy = e;
    scene.add(v.root);
    const bar = document.createElement('div');
    bar.className = 'enemy-health';
    const fill = document.createElement('div');
    fill.className = 'enemy-health-fill';
    bar.appendChild(fill);
    enemyHealthLayer.appendChild(bar);
    enemyHealthEls.set(e, bar);
    v.healthBar = bar;
    v.healthBarFill = fill;
    return v;
  }
  function updateEnemy(v, e) {
    const target = fPlayer || { x: 0, y: 0 };
    v.root.position.set(e.x * S, 0, e.y * S);
    v.root.rotation.y = Math.atan2(target.x - e.x, target.y - e.y);
    v.root.scale.setScalar(enemyVisualScale(e.type, v.height));
    v.anim(ft, v.phase);
    const flashing = e.flash > 0;
    for (const b of v.bodies) b.mesh.material = flashing ? M.white : b.base;
    const ratio = Math.max(0, Math.min(1, e.hp / (e.maxHp || e.hp || 1)));
    v.healthBarFill.style.width = `${ratio * 100}%`;
    v.healthBarFill.style.background = ratio < 0.3
      ? 'linear-gradient(90deg, #ff4f6d, #ff9b83)'
      : ratio < 0.6
        ? 'linear-gradient(90deg, #ffc14d, #ffe59a)'
        : 'linear-gradient(90deg, #79ed9a, #d6ffac)';
    tmpV.set(e.x * S, v.height * enemyVisualScale(e.type, v.height) + 0.38, e.y * S).project(camera);
    const screenX = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
    const onScreen = tmpV.z > -1 && tmpV.z < 1 && screenX > -40 && screenX < window.innerWidth + 40
      && screenY > -20 && screenY < window.innerHeight + 20;
    v.healthBar.style.display = onScreen ? '' : 'none';
    v.healthBar.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%)`;
    if (v.healthFill) {
      v.healthFill.visible = false;
    }
  }
  function disposeEnemy(v) {
    scene.remove(v.root);
    v.healthBar.remove();
    enemyHealthEls.delete(v.enemy);
  }

  const MAX_RENDERED_ENEMIES = 140;
  function getVisibleEnemies(enemies, centerX, centerY) {
    if (enemies.length <= MAX_RENDERED_ENEMIES) return enemies;
    const sorted = enemies.slice().sort((a, b) => {
      const da = Math.hypot(a.x - centerX, a.y - centerY) - (a.type === 'dragon' ? 2000 : 0);
      const db = Math.hypot(b.x - centerX, b.y - centerY) - (b.type === 'dragon' ? 2000 : 0);
      return da - db;
    });
    return sorted.slice(0, MAX_RENDERED_ENEMIES);
  }

  function hideUnrenderedEnemyHealthBars(renderedEnemies) {
    const rendered = new Set(renderedEnemies);
    for (const [enemy, bar] of enemyHealthEls) {
      if (!rendered.has(enemy)) bar.style.display = 'none';
    }
  }

  const MAX_ENEMY_MODELS = 140;
  function chooseVisibleEnemies(enemies, centerX, centerY) {
    const visible = enemies.filter((enemy) => !enemy.dead);
    if (visible.length <= MAX_ENEMY_MODELS) return visible;

    visible.sort((a, b) => {
      const aDragon = a.type === 'dragon' ? -1e9 : 0;
      const bDragon = b.type === 'dragon' ? -1e9 : 0;
      const da = Math.hypot(a.x - centerX, a.y - centerY) + aDragon;
      const db = Math.hypot(b.x - centerX, b.y - centerY) + bDragon;
      return da - db;
    });
    return visible.slice(0, MAX_ENEMY_MODELS);
  }

  function removeUnrenderedEnemyBars(renderedEnemies) {
    const rendered = new Set(renderedEnemies);
    for (const [enemy, bar] of enemyHealthEls) {
      if (!rendered.has(enemy)) bar.style.display = 'none';
    }
  }

  // ----- ドラゴンの炎 -----
  // 炎の形のスプライトを、揺らめく本体と尾（軌跡に沿って小さく暗くなる）として並べる。
  const FIRE_TAIL_COUNT = 6;
  function createFireBullet() {
    const mats = [];
    const makeSprite = (map, color, opacity) => {
      const mat = new THREE.SpriteMaterial({
        map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity,
      });
      mats.push(mat);
      return new THREE.Sprite(mat);
    };

    const root = new THREE.Group();
    const halo = makeSprite(glowTex, 0xff3c0a, 0.5);
    root.add(halo);
    const tail = [];
    for (let k = 0; k < FIRE_TAIL_COUNT; k++) {
      const sprite = makeSprite(flameTex, 0xff7a2a, 0.4);
      sprite.center.set(0.5, 0.12);
      root.add(sprite);
      tail.push(sprite);
    }
    // 本体は少し橙に寄せ、加算合成とBloomで白飛びしないようにする
    const body = makeSprite(flameTex, 0xffb060, 0.9);
    body.center.set(0.5, 0.12);
    root.add(body);
    scene.add(root);
    return { fire: true, root, halo, tail, body, mats, geos: [], phase: Math.random() * TAU };
  }
  function updateFireBullet(v, b) {
    v.root.position.set(b.x * S, 1.1, b.y * S);
    const t = ft * 26 + v.phase;
    const flicker = 1 + Math.sin(t) * 0.12 + Math.sin(t * 1.9 + 1.3) * 0.08;

    v.halo.scale.setScalar(3.2 * flicker);
    v.halo.material.opacity = 0.34 + Math.sin(t * 0.8) * 0.1;

    v.body.position.y = -0.25;
    v.body.scale.set(2.5 * (2 - flicker), 3.5 * flicker, 1);
    v.body.material.rotation = Math.sin(t * 0.9) * 0.2;

    const n = b.trail.length;
    for (let k = 0; k < v.tail.length; k++) {
      const sprite = v.tail[k];
      const idx = n - 1 - (k + 1) * 2;
      if (idx < 0) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      const fade = 1 - k / v.tail.length;
      const wobble = 1 + Math.sin(t * 1.3 + k * 1.7) * 0.14;
      sprite.position.set(
        (b.trail[idx].x - b.x) * S,
        -0.25 + k * 0.1,
        (b.trail[idx].y - b.y) * S,
      );
      sprite.scale.set(2.1 * fade * (2 - wobble) + 0.3, 2.9 * fade * wobble + 0.3, 1);
      // 後ろにいくほど赤く、薄くなる
      sprite.material.color.setRGB(1, 0.18 + 0.4 * fade, 0.04 + 0.16 * fade * fade);
      sprite.material.opacity = 0.42 * fade;
      sprite.material.rotation = Math.sin(t * 0.9 + k) * 0.25;
    }
  }

  // ----- 弾 -----
  function createBullet(b) {
    if (b.fire) return createFireBullet();
    const color = bulletColor(b);
    const coreGeo = new THREE.SphereGeometry(b.fire ? 0.64 : b.explode > 0 ? 0.38 : 0.27, 12, 10);
    const coreMat = basic(b.fire ? 0xffbd52 : b.explode > 0 ? 0xfff4cc : 0xffffff);
    const core = new THREE.Mesh(coreGeo, coreMat);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(b.fire ? 3.8 : b.explode > 0 ? 2.8 : 2.1);
    const outerGlowMat = new THREE.SpriteMaterial({
      map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: b.fire ? 0.82 : 0.64,
    });
    const outerGlow = new THREE.Sprite(outerGlowMat);
    const glowSize = b.fire ? 5.4 : b.explode > 0 ? 4.2 : 3.1;
    outerGlow.scale.set(glowSize, glowSize, 1);
    const trailPos = new Float32Array(13 * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const ribbonPos = new Float32Array(13 * 2 * 3);
    const ribbonIndex = [];
    for (let i = 0; i < 12; i++) {
      const a = i * 2;
      ribbonIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3));
    ribbonGeo.setIndex(ribbonIndex);
    const ribbonMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: b.fire ? 0.9 : 0.72, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbon.frustumCulled = false;
    const trailMat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.frustumCulled = false;
    const root = new THREE.Group();
    root.add(outerGlow, ribbon, core, glow, trail);
    scene.add(root);
    return { root, trail, trailPos, trailGeo, ribbonPos, ribbonGeo, ribbon, glow, outerGlow, mats: [coreMat, glowMat, outerGlowMat, ribbonMat, trailMat], geos: [coreGeo, trailGeo, ribbonGeo] };
  }
  function updateBullet(v, b) {
    if (v.fire) {
      updateFireBullet(v, b);
      return;
    }
    v.root.position.set(b.x * S, 1.1, b.y * S);
    const pulse = 1 + Math.sin(ft * 32 + b.x * 0.04) * 0.16;
    v.glow.scale.setScalar((b.fire ? 3.8 : b.explode > 0 ? 2.8 : 2.1) * pulse);
    v.outerGlow.material.opacity = 0.52 + Math.sin(ft * 24 + b.y * 0.03) * 0.16;
    v.outerGlow.scale.setScalar((b.fire ? 5.4 : b.explode > 0 ? 4.2 : 3.1) * pulse);
    const n = b.trail.length;
    for (let i = 0; i < n; i++) {
      const before = b.trail[Math.max(0, i - 1)];
      const after = b.trail[Math.min(n - 1, i + 1)];
      let dx = after.x - before.x;
      let dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const width = (0.32 - (i / Math.max(1, n - 1)) * 0.25) * S;
      const px = (-dy / length) * width;
      const pz = (dx / length) * width;
      const rx = (b.trail[i].x - b.x) * S;
      const rz = (b.trail[i].y - b.y) * S;
      const j = i * 6;
      v.ribbonPos[j] = rx + px;
      v.ribbonPos[j + 1] = 0;
      v.ribbonPos[j + 2] = rz + pz;
      v.ribbonPos[j + 3] = rx - px;
      v.ribbonPos[j + 4] = 0;
      v.ribbonPos[j + 5] = rz - pz;
    }
    v.ribbonGeo.attributes.position.needsUpdate = true;
    v.ribbonGeo.setDrawRange(0, Math.max(0, n - 1) * 6);
    for (let i = 0; i < n; i++) {
      v.trailPos[i * 3] = (b.trail[i].x - b.x) * S;
      v.trailPos[i * 3 + 1] = 0;
      v.trailPos[i * 3 + 2] = (b.trail[i].y - b.y) * S;
    }
    v.trailPos[n * 3] = 0;
    v.trailPos[n * 3 + 1] = 0;
    v.trailPos[n * 3 + 2] = 0;
    v.trailGeo.attributes.position.needsUpdate = true;
    v.trailGeo.setDrawRange(0, n + 1);
    v.trail.material.opacity = 0.48 + Math.min(n / 13, 1) * 0.5;
  }
  function disposeBullet(v) {
    scene.remove(v.root);
    v.mats.forEach((m) => m.dispose());
    v.geos.forEach((g) => g.dispose());
  }

  // ----- 鞭の軌跡 -----
  function createWhip(ef) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc85a, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const geo = new THREE.CircleGeometry(1, 44, -ef.half, ef.half * 2);
    const sector = new THREE.Mesh(geo, mat);
    sector.rotation.x = -Math.PI / 2;
    const edgeGeo = new THREE.BufferGeometry();
    const edgePoints = [];
    for (let i = 0; i <= 30; i++) {
      const angle = -ef.half + (ef.half * 2 * i) / 30;
      edgePoints.push(new THREE.Vector3(Math.cos(angle), 0.045, Math.sin(angle)));
    }
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xfff0ac, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    edgeGeo.setFromPoints(edgePoints);
    const edge = new THREE.Line(edgeGeo, edgeMat);
    const innerRingGeo = new THREE.RingGeometry(0.92, 1, 40);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.055;
    group.add(sector, edge, innerRing);
    group.position.set(ef.x * S, 0.1, ef.y * S);
    group.rotation.y = -ef.angle;
    group.scale.setScalar(ef.range * S);
    scene.add(group);
    return { group, mat, geo, edge, edgeMat, edgeGeo, innerRing, innerRingMat, innerRingGeo };
  }
  function updateWhip(v, ef) {
    const progress = 1 - ef.t / ef.max;
    const fade = Math.max(0, 1 - progress);
    v.mat.opacity = 0.9 * fade;
    v.edgeMat.opacity = fade;
    v.innerRingMat.opacity = fade * 0.9;
    v.group.scale.setScalar(ef.range * S * (0.76 + progress * 0.38));
  }
  function disposeWhip(v) {
    scene.remove(v.group);
    v.mat.dispose();
    v.geo.dispose();
    v.edgeMat.dispose();
    v.edgeGeo.dispose();
    v.innerRingMat.dispose();
    v.innerRingGeo.dispose();
  }

  function sync(map, items, create, update, dispose) {
    const alive = new Set(items);
    for (const [key, view] of map) {
      if (!alive.has(key)) {
        dispose(view);
        map.delete(key);
      }
    }
    for (const item of items) {
      let view = map.get(item);
      if (!view) {
        view = create(item);
        map.set(item, view);
      }
      update(view, item);
    }
  }

  // ----- ダメージ数値（DOM）-----
  function updateFloaters(run) {
    const list = run ? run.floaters : [];
    const alive = new Set(list);
    for (const [f, el] of floaterEls) {
      if (!alive.has(f)) {
        el.remove();
        floaterEls.delete(f);
      }
    }
    for (const f of list) {
      let el = floaterEls.get(f);
      if (!el) {
        el = document.createElement('div');
        el.className = 'dmg';
        el.textContent = f.text;
        el.style.color = f.color;
        damageLayer.appendChild(el);
        floaterEls.set(f, el);
      }
      tmpV.set(f.x * S, 2.4, f.y * S).project(camera);
      el.style.display = tmpV.z > 1 ? 'none' : '';
      const x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  function ensureDecor(px, pz) {
    const cx = Math.floor(px / CHUNK);
    const cz = Math.floor(pz / CHUNK);
    for (let i = cx - 3; i <= cx + 3; i++) {
      for (let j = cz - 3; j <= cz + 3; j++) {
        const key = `${i},${j}`;
        if (!decorMap.has(key)) {
          const group = makeDecorChunk(i, j);
          scene.add(group);
          decorMap.set(key, { i, j, group });
        }
      }
    }
    for (const [key, c] of decorMap) {
      if (Math.abs(c.i - cx) > 4 || Math.abs(c.j - cz) > 4) {
        scene.remove(c.group);
        decorMap.delete(key);
      }
    }
  }

  const wrap = (v, c) => ((((v - c + 40) % 80) + 80) % 80) - 40 + c;

  function render(run, now, dt) {
    transientBudget = MAX_TRANSIENTS_PER_FRAME;
    ft = now;
    fPlayer = run ? run.player : null;
    fx = fPlayer ? fPlayer.x * S : 0;
    fz = fPlayer ? fPlayer.y * S : 0;

    // イベント（撃破・命中など）を演出に変換
    if (run) {
      for (const ev of run.events) handleEvent(ev);
      run.events.length = 0;
    }

    // ヒーロー
    const moving = fPlayer ? fPlayer.moving : false;
    const targetYaw = fPlayer ? Math.atan2(fPlayer.facing.x, fPlayer.facing.y) : now * 0.5;
    heroYaw += normAngle(targetYaw - heroYaw) * (1 - Math.exp(-dt * 12));
    hero.root.position.set(fx, 0, fz);
    hero.root.rotation.y = heroYaw;
    hero.root.visible = !(fPlayer && fPlayer.invuln > 0 && Math.floor(now * 12) % 2 === 0);
    animateHero(hero, now, moving, moving ? 1 : 0.3);

    const aura = run && run.weapons.find((w) => w.id === 'aura');
    hero.aura.visible = !!aura;
    if (aura) {
      hero.aura.scale.setScalar(((60 + aura.lv * 12) * S) / HERO_SCALE);
      hero.aura.material.opacity = 0.45 + Math.sin(now * 4) * 0.15;
    }

    // 回転する刃
    const orbit = run && run.weapons.find((w) => w.id === 'orbit');
    const orbCount = orbit ? 1 + orbit.lv : 0;
    const orbR = orbit ? (55 + orbit.lv * 4) * S : 0;
    while (orbPool.length < orbCount) {
      const o = mesh(G.orb, M.orb);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xd9f2ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      sprite.scale.setScalar(0.9);
      o.add(sprite);
      scene.add(o);
      orbPool.push(o);
    }
    orbPool.forEach((o, i) => {
      o.visible = i < orbCount;
      if (o.visible) {
        const a = orbit.angle + (TAU * i) / orbCount;
        o.position.set(fx + Math.cos(a) * orbR, 1.0, fz + Math.sin(a) * orbR);
      }
    });

    // 敵・弾・鞭
    const activeEnemies = run ? run.enemies : [];
    const renderEnemies = getVisibleEnemies(activeEnemies, run ? run.player.x : 0, run ? run.player.y : 0);
    hideUnrenderedEnemyHealthBars(renderEnemies);
    sync(enemyViews, renderEnemies, createEnemy, updateEnemy, disposeEnemy);
    sync(bulletViews, run ? run.projs : [], createBullet, updateBullet, disposeBullet);
    sync(whipViews, run ? run.effects.filter((ef) => ef.type === 'whip') : [], createWhip, updateWhip, disposeWhip);

    // HP回復ハート
    const recoveries = run ? run.recoveries : [];
    const recoveryCount = Math.min(recoveries.length, recoveryGlows.length);
    for (let i = 0; i < recoveryCount; i++) {
      const item = recoveries[i];
      const bob = Math.sin(now * 4.8 + item.age * 2) * 0.1;
      dummy.position.set(item.x * S, 0.78 + bob, item.y * S);
      dummy.rotation.set(0, now * 1.15 + item.age, 0);
      dummy.scale.setScalar(1.45);
      dummy.updateMatrix();
      recoveryMesh.setMatrixAt(i, dummy.matrix);
      recoveryGlows[i].visible = true;
      recoveryGlows[i].position.set(item.x * S, 0.83 + bob, item.y * S);
      const pulse = 0.9 + Math.sin(now * 6 + i) * 0.15;
      recoveryGlows[i].scale.set(0.85 * pulse, 0.85 * pulse, 1);
      recoveryGlows[i].material.opacity = 0.7 + Math.sin(now * 4 + i) * 0.18;
    }
    recoveryMesh.count = recoveryCount;
    recoveryMesh.instanceMatrix.needsUpdate = true;
    for (let i = recoveryCount; i < recoveryGlows.length; i++) recoveryGlows[i].visible = false;

    // XPジェム
    const gems = run ? run.gems : [];
    const gemCount = Math.min(gems.length, MAX_GEMS);
    for (let i = 0; i < gemCount; i++) {
      const g = gems[i];
      dummy.position.set(g.x * S, 0.5 + Math.sin(now * 4 + i) * 0.08, g.y * S);
      dummy.rotation.set(0, now * 2 + i, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      gemMesh.setMatrixAt(i, dummy.matrix);
    }
    gemMesh.count = gemCount;
    gemMesh.instanceMatrix.needsUpdate = true;

    // 地面の装飾・光の粒
    ensureDecor(fx, fz);
    for (let i = 0; i < MOTE_N; i++) {
      motePos[i * 3] = wrap(moteBase[i * 3], fx);
      motePos[i * 3 + 1] = moteBase[i * 3 + 1] + Math.sin(now * 0.8 + i) * 0.3;
      motePos[i * 3 + 2] = wrap(moteBase[i * 3 + 2], fz);
    }
    moteGeo.attributes.position.needsUpdate = true;

    // 光源
    sun.position.set(fx - 25, 60, fz + 15);
    sun.target.position.set(fx, 0, fz);
    sun.target.updateMatrixWorld();
        glowLight.position.set(fx, 2.5, fz);

    // 演出の更新
    updateParticles(dt);
    updateTransients(dt);
    updateFloaters(run);

    // カメラ（追従＋被弾時の揺れ）
    if (run) {
      camPos.lerp(new THREE.Vector3(fx, 30, fz + 24), 1 - Math.exp(-dt * 6));
    } else {
      const a = now * 0.15;
      camPos.lerp(new THREE.Vector3(Math.sin(a) * 34, 20, Math.cos(a) * 34), 1 - Math.exp(-dt * 3));
    }
    const shake = (run ? run.hurt * 0.5 : 0) + hitShake;
    hitShake = Math.max(0, hitShake - dt * 2.8);
    shakeOffset.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
    camera.position.copy(camPos).add(shakeOffset);
    camera.lookAt(run ? fx : 0, run ? 0.5 : 1.8, run ? fz : 0);

    composer.render(dt);
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = getCameraFov();
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  return { render };
}

window.ForestRender = { createView, getEnemyHitRadius };
};
})();
