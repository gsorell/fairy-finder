import React, { useEffect, useRef, useState } from "react";
import { isMuted, primeAudio, sfxApex, sfxBonk, sfxHurt, sfxJump, sfxLand, sfxMenuMove, toggleMute } from "./audioWireRunner";

// Wire Runner — first playable version
// Side-scrolling endless runner. Jump from wire to wire.
// Hit the pole apex on the way up for a big boost (Excitebike-style).

const GAME_W = 960;
const GAME_H = 540;

const GROUND_Y = 470;
const PLAYER_OFFSET_X = 220; // player rendered ~1/4 from screen left

const BASE_SPEED = 3.4;
const MIN_VX = 3.2;           // her natural running pace — never crawls
const MAX_VX = 10;            // sag can't accelerate her past this
const SLOPE_ACCEL = 0.10;     // gentler slope effect
const WIRE_FRICTION = 0.9996; // basically energy-conserving
const GRAVITY = 0.62;           // full gravity on descent / after release
const APEX_HANG_GRAVITY = 0.05; // gravity while button held at top of arc
const APEX_HANG_VY = 3.2;       // |vy| threshold where hang activates
const JUMP_VY = -11.5;
const JUMP_CUT = 0.45;
const APEX_VY_BONUS = -3.0;   // extra upward kick when jumping near a pole top
const APEX_VX_BONUS = 2.5;    // extra forward kick on apex jump
const APEX_WINDOW_X = 44;     // distance from a pole top that counts as apex
const AIR_DRAG = 0.994;
const COYOTE_FRAMES = 7;
const JUMP_BUFFER_FRAMES = 7;
const MISSING_WIRE_CHANCE = 0.28; // % of wires that are gaps (when allowed)
const MIN_RUN_AFTER_GAP = 3;      // min consecutive present wires before another gap
const MAX_JUMPABLE_GAP_DX = 360;  // hard cap: no gap wider than this
const MAX_GAP_UPHILL_DY = 50;     // if next wire is too much higher, force wire present
const SAFE_WIRES_AT_START = 4;
const PLAYER_W = 16;
const PLAYER_H = 28;

// Obstacles
const PERCH_CHANCE = 0.28;          // chance each present wire gets a perched obstacle
const FLYER_INTERVAL = 1600;        // world-x gap between flying obstacle spawns
const FLYER_VX = -4.0;              // flyers move leftward in world space
const TRANSFORMER_CHANCE = 0.12;    // chance a pole gets a sparking transformer
const TRANSFORMER_CYCLE = 110;      // total frames per spark cycle
const TRANSFORMER_ON = 36;          // frames the arc is active per cycle
const STARTING_LIVES = 3;
const HIT_INV_FRAMES = 75;
const HIT_SLOW_FRAMES = 24;
const HIT_SLOW_FACTOR = 0.5;
const TRICK_FRAMES = 26;

const HIGHSCORE_KEY = "wire-runner-best";
const CHARACTER_KEY = "fairy-finder-character";

const CHARACTERS = [
  { id: "big", name: "Big Sis", skin: "#f4d4b0", hair: "#2b1810", top: "#7dd3fc", trim: "#bae6fd", legs: "#f4d4b0", shoes: "#f8fafc", accessory: "flower" },
  { id: "lil", name: "Lil Sis", skin: "#f8e0c0", hair: "#8b3a1f", top: "#fbcfe8", trim: "#fda4af", legs: "#f8e0c0", shoes: "#f8fafc", accessory: "ribbons" },
  { id: "dad", name: "Dad", skin: "#e8c4a0", hair: "#1f2937", top: "#0ea5e9", trim: "#0284c7", legs: "#27364a", shoes: "#1f2937", accessory: "sunglasses" },
  { id: "mom", name: "Mom", skin: "#e8c4a0", hair: "#5b3920", top: "#fef3c7", trim: "#fde68a", legs: "#1e3a5f", shoes: "#1f2937", accessory: "earrings" },
];

function loadBest() {
  try {
    const v = parseInt(localStorage.getItem(HIGHSCORE_KEY), 10);
    if (Number.isInteger(v) && v >= 0) return v;
  } catch {}
  return 0;
}

function saveBest(v) {
  try { localStorage.setItem(HIGHSCORE_KEY, String(Math.floor(v))); } catch {}
}

function loadCharacterIndex() {
  try {
    const v = parseInt(localStorage.getItem(CHARACTER_KEY), 10);
    if (Number.isInteger(v) && v >= 0 && v < CHARACTERS.length) return v;
  } catch {}
  return 0;
}

function saveCharacterIndex(i) {
  try { localStorage.setItem(CHARACTER_KEY, String(i)); } catch {}
}

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Wires now sag between two poles. Each wire = { a, b, sag } where a,b are
// pole indices in the poles array. Pole = { x, y } where y is the pole top.
function genNextPole(prev) {
  const dx = rand(280, 480);
  const dy = rand(-90, 90);
  return { x: prev.x + dx, y: clamp(prev.y + dy, 230, 380) };
}

function genSag(pa, pb) {
  // Deeper sag for longer / similar-height spans; shallower when poles differ a lot.
  const span = pb.x - pa.x;
  const heightDiff = Math.abs(pb.y - pa.y);
  const base = span * 0.22;
  return clamp(base - heightDiff * 0.3, 35, 110);
}

function isGapJumpable(pa, pb) {
  const span = pb.x - pa.x;
  const uphill = Math.max(0, pa.y - pb.y);
  if (uphill > MAX_GAP_UPHILL_DY) return false;
  return span <= MAX_JUMPABLE_GAP_DX;
}

function makeInitialPoles() {
  const poles = [{ x: 100, y: 320 }];
  while (poles[poles.length - 1].x < 2200) {
    poles.push(genNextPole(poles[poles.length - 1]));
  }
  return poles;
}

function makeWiresFromPoles(poles) {
  const wires = [];
  let runLength = SAFE_WIRES_AT_START; // treat safe start as an established run
  for (let i = 0; i < poles.length - 1; i++) {
    const canGap = i >= SAFE_WIRES_AT_START && runLength >= MIN_RUN_AFTER_GAP;
    const gapIsJumpable = isGapJumpable(poles[i], poles[i + 1]);
    const wantsGap = canGap && Math.random() < MISSING_WIRE_CHANCE;
    const present = !(wantsGap && gapIsJumpable);
    runLength = present ? runLength + 1 : 0;
    wires.push({ a: i, b: i + 1, sag: genSag(poles[i], poles[i + 1]), present });
  }
  return wires;
}

// --- Obstacle generation ---------------------------------------------------

function genPerchedObstacle(pa, pb, sag) {
  if (Math.random() >= PERCH_CHANCE) return null;
  const t = rand(0.2, 0.8);
  const wx = pa.x + t * (pb.x - pa.x);
  const wy = wireYAt(pa, pb, sag, wx);
  const variant = Math.random() < 0.5 ? "squirrel" : "bird";
  return { type: "perch", wx, wy, w: variant === "squirrel" ? 14 : 10, h: 14, variant };
}

function genTransformerObstacle(pole) {
  if (Math.random() >= TRANSFORMER_CHANCE) return null;
  return { type: "transformer", wx: pole.x, wy: pole.y, timer: Math.floor(rand(0, TRANSFORMER_CYCLE)) };
}

function spawnFlyer(wx) {
  const roll = Math.random();
  const variant = roll < 0.2 ? "plane" : (roll < 0.55 ? "car" : "birds");
  const isPlane = variant === "plane";
  const isCar = variant === "car";
  const carColors = ["#ef4444", "#0ea5e9", "#f59e0b", "#22c55e", "#a855f7", "#e5e7eb", "#111827"];
  return {
    type: "flyer",
    variant,
    x: wx,
    y: isPlane ? rand(140, 260) : (isCar ? rand(GROUND_Y + 4, GROUND_Y + 14) : rand(200, 355)),
    vx: FLYER_VX * (isPlane ? 0.65 : (isCar ? 0.9 : 1)) * rand(0.85, 1.15),
    w: isPlane ? 96 : (isCar ? 60 : 54),
    h: isPlane ? 22 : (isCar ? 16 : 18),
    phase: Math.floor(rand(0, 60)),
    color: isCar ? carColors[Math.floor(rand(0, carColors.length))] : null,
  };
}

function genInitialObstacles(wires, poles) {
  const obs = [];
  for (let i = SAFE_WIRES_AT_START + 1; i < wires.length; i++) {
    if (!wires[i].present) continue;
    const o = genPerchedObstacle(poles[wires[i].a], poles[wires[i].b], wires[i].sag);
    if (o) obs.push(o);
  }
  for (let i = SAFE_WIRES_AT_START + 1; i < poles.length; i++) {
    const o = genTransformerObstacle(poles[i]);
    if (o) obs.push(o);
  }
  return obs;
}

// y-position on a wire at world x
function wireYAt(pa, pb, sag, x) {
  if (x < pa.x || x > pb.x) return null;
  const t = (x - pa.x) / (pb.x - pa.x);
  return (1 - t) * pa.y + t * pb.y + 4 * sag * t * (1 - t);
}

// dy/dx along the wire at world x
function wireSlopeAt(pa, pb, sag, x) {
  const dxw = pb.x - pa.x;
  if (dxw === 0) return 0;
  const t = (x - pa.x) / dxw;
  return (pb.y - pa.y) / dxw + (4 * sag * (1 - 2 * t)) / dxw;
}

function isStandalonePole(game, poleIdx) {
  const leftWire = poleIdx - 1 >= 0 ? game.wires[poleIdx - 1] : null;
  const rightWire = poleIdx < game.wires.length ? game.wires[poleIdx] : null;
  const hasLeftWire = !!leftWire && !!leftWire.present;
  const hasRightWire = !!rightWire && !!rightWire.present;
  return !hasLeftWire && !hasRightWire;
}

function makeGame(mode = "title", selectedCharacter = loadCharacterIndex()) {
  const poles = makeInitialPoles();
  const wires = makeWiresFromPoles(poles);
  const startWire = wires[0];
  const startY = wireYAt(poles[startWire.a], poles[startWire.b], startWire.sag, 100 + 20);
  return {
    mode,
    poles,
    wires,
    player: {
      x: 100 + 20,
      y: startY - PLAYER_H,
      vx: BASE_SPEED,
      vy: 0,
      onWire: true,
      currentWireIdx: 0,
      onFlyerIdx: -1,
      trickTimer: 0,
      trickSpin: 0,
      trickSpinRate: 0,
      trickStyle: "spin",
      pendingTrickStyle: null,
      pendingTrickIntensity: 1,
    },
    cameraX: 0,
    score: 0,
    best: loadBest(),
    lives: STARTING_LIVES,
    hitInv: 0,
    hitSlowTimer: 0,
    selectedCharacter,
    muted: isMuted(),
    prevJump: false,
    prevLeft: false,
    prevRight: false,
    prevOne: false,
    prevTwo: false,
    prevThree: false,
    prevFour: false,
    prevMute: false,
    jumpHeld: false,
    coyote: 0,
    jumpBuffer: 0,
    apexFlashTimer: 0,
    apexFlashPoleIdx: -1,
    wireRunLength: SAFE_WIRES_AT_START,
    obstacles: genInitialObstacles(wires, poles),
    lastFlyerX: 1200,
    particles: makeParticlePool(),
  };
}

// --- Particles -------------------------------------------------------------

function makeParticlePool(size = 60) {
  const pool = [];
  for (let i = 0; i < size; i++) pool.push({ active: false });
  return pool;
}

function emitParticles(pool, x, y, count, opts) {
  let emitted = 0;
  for (let i = 0; i < pool.length && emitted < count; i++) {
    const p = pool[i];
    if (p.active) continue;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * (opts.spread || 0);
    p.y = y + (Math.random() - 0.5) * (opts.spread || 0);
    const angle = opts.angleMin + Math.random() * (opts.angleMax - opts.angleMin);
    const speed = opts.speedMin + Math.random() * (opts.speedMax - opts.speedMin);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = p.maxLife = opts.life || 30;
    p.color = Array.isArray(opts.colors)
      ? opts.colors[Math.floor(Math.random() * opts.colors.length)]
      : (opts.color || "#fff");
    p.size = opts.size || 2;
    p.gravity = opts.gravity ?? 0.05;
    p.shrink = opts.shrink ? 1 : 0;
    emitted++;
  }
}

function updateParticles(pool) {
  for (const p of pool) {
    if (!p.active) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.life--;
    if (p.life <= 0) p.active = false;
  }
}

function drawParticles(ctx, pool) {
  for (const p of pool) {
    if (!p.active) continue;
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const size = p.shrink ? p.size * alpha : p.size;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Drawing helpers --------------------------------------------------------

function drawText(ctx, text, x, y, size = 18, color = "white", align = "left") {
  ctx.save();
  ctx.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,.6)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawSky(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
  grad.addColorStop(0, "#f5b85c");
  grad.addColorStop(0.5, "#f78a8a");
  grad.addColorStop(1, "#7c3aed");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // sun
  ctx.fillStyle = "rgba(255, 220, 140, 0.85)";
  ctx.beginPath();
  ctx.arc(720, 180, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 240, 200, 0.4)";
  ctx.beginPath();
  ctx.arc(720, 180, 90, 0, Math.PI * 2);
  ctx.fill();
}

function drawDistantHills(ctx, cameraX) {
  ctx.save();
  ctx.translate(-cameraX * 0.2, 0);
  ctx.fillStyle = "#5b3a82";
  ctx.beginPath();
  ctx.moveTo(-200, GAME_H);
  for (let x = -200; x <= GAME_W * 4; x += 60) {
    const h = 130 + Math.sin(x * 0.0042) * 60 + Math.sin(x * 0.018 + 1.3) * 25;
    ctx.lineTo(x, GAME_H - h - 60);
  }
  ctx.lineTo(GAME_W * 4, GAME_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawNearHills(ctx, cameraX) {
  ctx.save();
  ctx.translate(-cameraX * 0.45, 0);
  ctx.fillStyle = "#3b1c5c";
  ctx.beginPath();
  ctx.moveTo(-200, GAME_H);
  for (let x = -200; x <= GAME_W * 4; x += 50) {
    const h = 80 + Math.sin(x * 0.008 + 0.7) * 40 + Math.sin(x * 0.025) * 18;
    ctx.lineTo(x, GAME_H - h - 30);
  }
  ctx.lineTo(GAME_W * 4, GAME_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoad(ctx, cameraX, frame) {
  // road body
  ctx.fillStyle = "#1a1530";
  ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);

  // dashed centerline
  ctx.fillStyle = "#fde68a";
  const dashLen = 30;
  const gap = 30;
  const period = dashLen + gap;
  const startOffset = -((cameraX * 0.95) % period);
  for (let x = startOffset; x < GAME_W + period; x += period) {
    ctx.fillRect(x, GROUND_Y + 22, dashLen, 4);
  }

  // edge curbs
  ctx.fillStyle = "#0b0820";
  ctx.fillRect(0, GROUND_Y, GAME_W, 4);
}

function drawWire(ctx, pa, pb, sag) {
  // Drop shadow line (faint, behind)
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y + 2);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = pa.x + t * (pb.x - pa.x);
    const y = (1 - t) * pa.y + t * pb.y + 4 * sag * t * (1 - t) + 2;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Main wire
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = pa.x + t * (pb.x - pa.x);
    const y = (1 - t) * pa.y + t * pb.y + 4 * sag * t * (1 - t);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawFrayedStub(ctx, pole, dir) {
  // dir = +1 means stub points right (this pole is the LEFT side of the gap)
  // dir = -1 means stub points left (this pole is the RIGHT side of the gap)
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pole.x, pole.y);
  ctx.lineTo(pole.x + dir * 18, pole.y + 6);
  ctx.stroke();
  // a few short loose strands at the tip
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(pole.x + dir * 18, pole.y + 6);
    ctx.lineTo(pole.x + dir * (22 + i), pole.y + 6 + i * 3);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawPole(ctx, pole, isApexFlashing) {
  const px = pole.x;
  const topY = pole.y;
  const baseY = GROUND_Y;

  // apex glow ring
  if (isApexFlashing) {
    const grad = ctx.createRadialGradient(px, topY, 5, px, topY, 50);
    grad.addColorStop(0, "rgba(250, 204, 21, 0.75)");
    grad.addColorStop(1, "rgba(250, 204, 21, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, topY, 50, 0, Math.PI * 2);
    ctx.fill();
  }

  // shaft
  ctx.fillStyle = "#3d2614";
  ctx.fillRect(px - 4, topY, 8, baseY - topY);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(px - 4, topY, 2, baseY - topY);

  // crossbar (just below wire so wire reads as topmost)
  ctx.fillStyle = "#3d2614";
  ctx.fillRect(px - 24, topY + 3, 48, 4);

  // glass insulators rising up to support the wire
  ctx.fillStyle = "#10b981";
  ctx.beginPath(); ctx.arc(px - 14, topY + 2, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + 14, topY + 2, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath(); ctx.arc(px - 15, topY + 1, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + 13, topY + 1, 1.1, 0, Math.PI * 2); ctx.fill();
}

// --- Obstacle draw functions -----------------------------------------------

  function drawPerchedBird(ctx, obs) {
    const { wx, wy } = obs;
    // tail
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.moveTo(wx - 4, wy - 4);
    ctx.lineTo(wx - 10, wy - 2);
    ctx.lineTo(wx - 4, wy - 7);
    ctx.fill();
    // body
    ctx.beginPath(); ctx.ellipse(wx, wy - 5, 4.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(wx + 3, wy - 9, 3, 0, Math.PI * 2); ctx.fill();
    // beak
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(wx + 5, wy - 10, 4, 2);
    // eye
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(wx + 3.5, wy - 9.5, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(wx + 4, wy - 9.5, 0.6, 0, Math.PI * 2); ctx.fill();
    // feet
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(wx - 1, wy - 2); ctx.lineTo(wx - 2, wy + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx + 1, wy - 2); ctx.lineTo(wx + 2, wy + 2); ctx.stroke();
  }

  function drawPerchedSquirrel(ctx, obs) {
    const { wx, wy } = obs;
    // bushy tail arcing behind
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(wx - 4, wy - 8, 8, Math.PI * 0.1, -Math.PI * 0.5, true);
    ctx.stroke();
    ctx.lineCap = "butt";
    // body
    ctx.fillStyle = "#92400e";
    ctx.fillRect(wx - 4, wy - 11, 10, 9);
    // head
    ctx.beginPath(); ctx.arc(wx + 2, wy - 13, 5, 0, Math.PI * 2); ctx.fill();
    // ears
    ctx.beginPath(); ctx.arc(wx - 1, wy - 17, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(wx + 4, wy - 17, 2.5, 0, Math.PI * 2); ctx.fill();
    // eye
    ctx.fillStyle = "#0f172a";
    ctx.beginPath(); ctx.arc(wx + 3, wy - 13, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(wx + 3.5, wy - 13.5, 0.6, 0, Math.PI * 2); ctx.fill();
    // nose
    ctx.fillStyle = "#fb7185";
    ctx.beginPath(); ctx.arc(wx + 5.5, wy - 11.5, 1, 0, Math.PI * 2); ctx.fill();
  }

  function drawFlyingBirds(ctx, obs) {
    const wing = Math.sin(obs.phase * 0.18) * 5;
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    // 3 birds in loose V formation
    const birds = [[obs.x + obs.w * 0.5, obs.y + obs.h * 0.5], [obs.x + obs.w * 0.2, obs.y + obs.h * 0.3], [obs.x + obs.w * 0.8, obs.y + obs.h * 0.3]];
    for (const [bx, by] of birds) {
      ctx.beginPath(); ctx.ellipse(bx, by, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + 5, by - 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - 5, by);
      ctx.quadraticCurveTo(bx - 10, by - 4 + wing, bx - 16, by - 1 + wing);
      ctx.moveTo(bx + 10, by - 1);
      ctx.quadraticCurveTo(bx + 16, by - 5 + wing, bx + 22, by - 1 + wing);
      ctx.stroke();
    }
  }

  function drawPlane(ctx, obs) {
    const { x, y, w, h } = obs;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    ctx.save();
    // fuselage
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.47, cy);
    ctx.quadraticCurveTo(cx + w * 0.38, cy - h * 0.35, cx, cy - h * 0.35);
    ctx.quadraticCurveTo(cx - w * 0.45, cy - h * 0.2, cx - w * 0.47, cy + h * 0.1);
    ctx.quadraticCurveTo(cx - w * 0.2, cy + h * 0.3, cx + w * 0.47, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1; ctx.stroke();
    // cockpit window
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.25, cy - h * 0.15, w * 0.1, h * 0.18, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // main wing
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.05, cy + h * 0.1);
    ctx.lineTo(cx + w * 0.12, cy - h * 0.05);
    ctx.lineTo(cx - w * 0.05, cy - h * 0.3);
    ctx.lineTo(cx - w * 0.38, cy + h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#94a3b8"; ctx.stroke();
    // tail fin
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.32, cy - h * 0.05);
    ctx.lineTo(cx - w * 0.42, cy - h * 0.55);
    ctx.lineTo(cx - w * 0.18, cy - h * 0.05);
    ctx.closePath();
    ctx.fill();
    // propeller disc
    ctx.fillStyle = "rgba(100,120,150,0.45)";
    ctx.beginPath();
    ctx.arc(cx + w * 0.47, cy - h * 0.05, h * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCar(ctx, obs) {
    const { x, y, w, h, phase } = obs;
    const body = obs.color || "#ef4444";

    ctx.save();

    // shadow on asphalt
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h + 2, w * 0.36, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // lower body
    ctx.fillStyle = body;
    ctx.fillRect(x + 3, y + h * 0.35, w - 6, h * 0.5);

    // cabin
    ctx.beginPath();
    ctx.moveTo(x + w * 0.24, y + h * 0.35);
    ctx.lineTo(x + w * 0.4, y + h * 0.08);
    ctx.lineTo(x + w * 0.72, y + h * 0.08);
    ctx.lineTo(x + w * 0.86, y + h * 0.35);
    ctx.closePath();
    ctx.fill();

    // windows
    ctx.fillStyle = "#93c5fd";
    ctx.fillRect(x + w * 0.43, y + h * 0.12, w * 0.12, h * 0.16);
    ctx.fillRect(x + w * 0.58, y + h * 0.12, w * 0.12, h * 0.16);

    // wheel spin hint
    const spin = Math.sin((phase || 0) * 0.45);
    ctx.fillStyle = "#111827";
    ctx.beginPath(); ctx.arc(x + w * 0.28, y + h * 0.86, h * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.73, y + h * 0.86, h * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.28 - 3, y + h * 0.86);
    ctx.lineTo(x + w * 0.28 + 3, y + h * 0.86 + spin);
    ctx.moveTo(x + w * 0.73 - 3, y + h * 0.86);
    ctx.lineTo(x + w * 0.73 + 3, y + h * 0.86 - spin);
    ctx.stroke();

    ctx.restore();
  }

  function drawTransformer(ctx, obs) {
    const { wx, wy } = obs;
    const sparking = obs.timer < TRANSFORMER_ON;
    // box mounted on pole
    ctx.fillStyle = "#475569";
    ctx.fillRect(wx + 6, wy + 8, 16, 18);
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(wx + 8, wy + 10, 6, 7);
    ctx.fillStyle = "#334155";
    for (let i = 0; i < 3; i++) ctx.fillRect(wx + 7 + i * 5, wy + 24, 4, 3);
    // connection wires to crossbar
    ctx.strokeStyle = "#475569"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(wx + 10, wy + 8); ctx.lineTo(wx - 14, wy + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx + 18, wy + 8); ctx.lineTo(wx + 14, wy + 2); ctx.stroke();
    if (sparking) {
      ctx.save();
      ctx.strokeStyle = "#fef08a";
      ctx.lineWidth = 1.8;
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 8;
      // jagged arcs
      ctx.beginPath();
      ctx.moveTo(wx + 14, wy + 8);
      ctx.lineTo(wx + 10, wy + 2);
      ctx.lineTo(wx + 16, wy - 3);
      ctx.lineTo(wx + 11, wy - 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx + 14, wy + 8);
      ctx.lineTo(wx + 19, wy + 1);
      ctx.lineTo(wx + 14, wy - 5);
      ctx.stroke();
      // glow halo
      ctx.fillStyle = "rgba(253,224,71,0.18)";
      ctx.beginPath();
      ctx.arc(wx + 14, wy, 22 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

function drawPlayer(ctx, player, frame, mode, character = CHARACTERS[0], invFrames = 0) {
  if (invFrames > 0 && Math.floor(frame / 4) % 2 === 0) return;
  const cx = player.x + PLAYER_W / 2;
  const onWire = player.onWire;
  const trickActive = mode === "playing" && !onWire && (player.trickTimer || 0) > 0;
  const stepFrame = Math.floor(frame / 4) % 4;
  const stride = onWire ? [0, 1, 0, -1][stepFrame] * 3 : 0;

  ctx.save();
  ctx.translate(cx, player.y);

  if (trickActive) {
    if (player.trickStyle === "tilt") {
      ctx.rotate(Math.sin((player.trickSpin || 0) * 0.65) * 0.55);
    } else {
      ctx.rotate(player.trickSpin || 0);
    }
  }

  // shadow on wire
  if (onWire) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, PLAYER_H + 2, 8, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const isDad = character.id === "dad";
  const isMom = character.id === "mom";
  const isLil = character.id === "lil";

  // legs
  ctx.fillStyle = character.legs;
  if (isDad || isMom) {
    ctx.fillRect(-5, 17, 4, 10);
    ctx.fillRect(1, 17, 4, 10);
  } else {
    ctx.fillRect(-5, 18, 4, 9);
    ctx.fillRect(1, 18, 4, 9);
  }
  if (onWire) {
    ctx.fillRect(-5 + stride, isDad || isMom ? 17 : 18, 4, isDad || isMom ? 10 : 9);
    ctx.fillRect(1 - stride, isDad || isMom ? 17 : 18, 4, isDad || isMom ? 10 : 9);
  } else if (mode === "playing") {
    ctx.fillRect(-4, 16, 8, 7);
  }

  // shoes
  ctx.fillStyle = character.shoes;
  ctx.fillRect(-6, 26, 5, 2);
  ctx.fillRect(1, 26, 5, 2);

  // torso by character
  ctx.fillStyle = character.top;
  if (isDad) {
    ctx.fillRect(-8, 8, 16, 11); // broad shirt
  } else if (isMom) {
    ctx.fillRect(-7, 8, 14, 10);
    ctx.fillRect(-8, 17, 16, 2);
  } else if (isLil) {
    ctx.fillRect(-8, 9, 16, 10); // puffier dress
  } else {
    ctx.fillRect(-7, 8, 14, 11);
  }
  ctx.fillStyle = character.trim;
  ctx.fillRect(-8, 17, 16, 2);

  // arms
  ctx.fillStyle = character.skin;
  if (onWire) {
    ctx.fillRect(-9, 9, 3, 6);
    ctx.fillRect(6, 9, 3, 6);
  } else {
    ctx.fillRect(-9, 6, 3, 5);
    ctx.fillRect(6, 6, 3, 5);
  }

  // head
  ctx.fillStyle = character.skin;
  ctx.fillRect(-5, isLil ? -1 : 0, 10, isLil ? 10 : 9);

  // hair base
  ctx.fillStyle = character.hair;
  if (isDad) {
    ctx.fillRect(-7, 1, 14, 5);
    ctx.fillRect(-6, 8, 12, 2); // beard line
  } else if (isMom) {
    ctx.fillRect(-8, 1, 16, 6);
    ctx.fillRect(-8, 4, 2, 5);
    ctx.fillRect(6, 4, 2, 5);
  } else if (isLil) {
    ctx.fillRect(-7, 1, 14, 6);
    ctx.fillRect(-10, 3, 3, 5); // pigtails
    ctx.fillRect(7, 3, 3, 5);
  } else {
    ctx.fillRect(-7, 1, 14, 6);
    ctx.fillRect(-9, 3, 3, 6); // ponytail
  }
  ctx.fillRect(-5, 1, 10, 2); // bangs

  if (character.accessory === "flower") {
    ctx.fillStyle = "#ec4899";
    ctx.fillRect(-7, 2, 2, 2);
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(-6, 3, 1, 1);
  } else if (character.accessory === "ribbons") {
    ctx.fillStyle = "#ec4899";
    ctx.fillRect(-10, 3, 2, 1);
    ctx.fillRect(8, 3, 2, 1);
  } else if (character.accessory === "sunglasses") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(-4, 4, 3, 2);
    ctx.fillRect(1, 4, 3, 2);
    ctx.fillRect(-1, 4, 2, 1);
  } else if (character.accessory === "earrings") {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-6, 7, 1, 1);
    ctx.fillRect(5, 7, 1, 1);
  }

  // eyes
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-3, 4, 1.5, 2);
  ctx.fillRect(2, 4, 1.5, 2);

  // smile
  ctx.fillStyle = "#9f1239";
  ctx.fillRect(-1, 7, 3, 1);

  ctx.restore();
}

function drawCharacterPreview(ctx, character, cx, topY, frame, selected) {
  if (selected) {
    const grad = ctx.createRadialGradient(cx, topY + 24, 4, cx, topY + 24, 55);
    grad.addColorStop(0, "rgba(250,204,21,0.5)");
    grad.addColorStop(1, "rgba(250,204,21,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 56, topY - 25, 112, 92);
  }
  const fakeP = { x: cx - PLAYER_W / 2, y: topY, onWire: true };
  drawPlayer(ctx, fakeP, frame, "title", character);
}

function drawScene(ctx, game, frame) {
  const selectedCharacter = CHARACTERS[game.selectedCharacter] ?? CHARACTERS[0];
  ctx.clearRect(0, 0, GAME_W, GAME_H);

  drawSky(ctx);
  drawDistantHills(ctx, game.cameraX);
  drawNearHills(ctx, game.cameraX);

  // World layer
  ctx.save();
  ctx.translate(-game.cameraX, 0);

  // Wires (curved between poles); missing ones leave a visible gap
  for (const w of game.wires) {
    if (!w.present) {
      drawFrayedStub(ctx, game.poles[w.a], 1);
      drawFrayedStub(ctx, game.poles[w.b], -1);
      continue;
    }
    drawWire(ctx, game.poles[w.a], game.poles[w.b], w.sag);
  }
  // Poles (drawn over wires so the crossbar/insulators read clearly)
  for (let i = 0; i < game.poles.length; i++) {
    const flashing = game.apexFlashTimer > 0 && i === game.apexFlashPoleIdx;
    drawPole(ctx, game.poles[i], flashing);
  }

  drawPlayer(ctx, game.player, frame, game.mode, selectedCharacter, game.hitInv);

  // Obstacles drawn over player so they visually occlude when passing behind
  for (const obs of game.obstacles) {
    if (obs.type === 'perch') {
      if (obs.variant === 'squirrel') drawPerchedSquirrel(ctx, obs);
      else drawPerchedBird(ctx, obs);
    } else if (obs.type === 'flyer') {
      if (obs.variant === 'car') continue;
      if (obs.variant === 'plane') drawPlane(ctx, obs);
      else drawFlyingBirds(ctx, obs);
    } else if (obs.type === 'transformer') {
      drawTransformer(ctx, obs);
    }
  }

  drawParticles(ctx, game.particles);

  ctx.restore();

  // Road in front of background but behind HUD
  drawRoad(ctx, game.cameraX, frame);

  // Road traffic cars: drawn after road, projected from world coordinates.
  for (const obs of game.obstacles) {
    if (obs.type !== 'flyer' || obs.variant !== 'car') continue;
    drawCar(ctx, { ...obs, x: obs.x - game.cameraX });
  }

  // HUD
  drawText(ctx, `${Math.floor(game.score)}m`, 30, 50, 32, "#fef3c7");
  drawText(ctx, `Best: ${Math.floor(game.best)}m`, 30, 78, 16, "#bfdbfe");
  drawText(ctx, `Lives: ${game.lives}`, 30, 104, 16, "#fca5a5");
  drawText(ctx, game.muted ? "M: Sound Off" : "M: Sound On", GAME_W - 24, 44, 16, "#cbd5e1", "right");

  if (game.mode === "title") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawText(ctx, "WIRE RUNNER", GAME_W / 2, 132, 60, "#fde68a", "center");
    drawText(ctx, "Choose your runner", GAME_W / 2, 178, 24, "#bfdbfe", "center");

    const spacing = 170;
    const startX = GAME_W / 2 - (spacing * (CHARACTERS.length - 1)) / 2;
    for (let i = 0; i < CHARACTERS.length; i++) {
      const cx = startX + i * spacing;
      drawCharacterPreview(ctx, CHARACTERS[i], cx, 210, frame, i === game.selectedCharacter);
      drawText(ctx, CHARACTERS[i].name, cx, 285, 18, i === game.selectedCharacter ? "#facc15" : "#e2e8f0", "center");
      drawText(ctx, `${i + 1}`, cx, 306, 14, "#94a3b8", "center");
    }

    drawText(ctx, "Arrow keys or A/D to choose | 1-4 quick select", GAME_W / 2, 350, 18, "#cbd5e1", "center");
    drawText(ctx, game.muted ? "Press M to unmute" : "Press M to mute", GAME_W / 2, 372, 17, "#cbd5e1", "center");
    drawText(ctx, "Press SPACE to start", GAME_W / 2, 408, 26, "#86efac", "center");
    drawText(ctx, "ESC: Back to Game Select", GAME_W / 2, 442, 16, "#64748b", "center");
  }

  if (game.mode === "gameover") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawText(ctx, "WIPEOUT!", GAME_W / 2, 200, 56, "#fb7185", "center");
    drawText(ctx, `Distance: ${Math.floor(game.score)}m`, GAME_W / 2, 260, 28, "white", "center");
    drawText(ctx, `Best: ${Math.floor(game.best)}m`, GAME_W / 2, 300, 22, "#bfdbfe", "center");
    drawText(ctx, "Press SPACE to retry", GAME_W / 2, 380, 24, "#86efac", "center");
    drawText(ctx, "ESC: Back to Game Select", GAME_W / 2, 414, 16, "#64748b", "center");
  }
}

// --- React component --------------------------------------------------------

export default function WireRunner({ onBack }) {
  const canvasRef = useRef(null);
  const keys = useRef({});
  const gameRef = useRef(makeGame());
  const [, force] = useState(0);
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  useEffect(() => {
    const down = (e) => {
      const key = e.key.toLowerCase();
      primeAudio();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) e.preventDefault();
      if (e.repeat) return;
      if (key === "escape") {
        const g = gameRef.current;
        if (g.mode === "title" || g.mode === "gameover") {
          onBackRef.current?.();
          return;
        }
      }
      keys.current[key] = true;
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    let raf;

    const startRun = () => {
      const selected = gameRef.current.selectedCharacter ?? loadCharacterIndex();
      gameRef.current = makeGame("playing", selected);
    };

    const tick = () => {
      frame++;
      const g = gameRef.current;
      const k = keys.current;

      const jumpDown = !!(k[" "] || k["space"] || k["arrowup"] || k["w"]);
      const jumpPressed = jumpDown && !g.prevJump;
      g.prevJump = jumpDown;

      const leftDown = !!(k["arrowleft"] || k["a"]);
      const rightDown = !!(k["arrowright"] || k["d"]);
      const leftPressed = leftDown && !g.prevLeft;
      const rightPressed = rightDown && !g.prevRight;
      g.prevLeft = leftDown;
      g.prevRight = rightDown;

      const onePressed = !!k["1"] && !g.prevOne;
      const twoPressed = !!k["2"] && !g.prevTwo;
      const threePressed = !!k["3"] && !g.prevThree;
      const fourPressed = !!k["4"] && !g.prevFour;
      const mutePressed = !!k["m"] && !g.prevMute;
      g.prevOne = !!k["1"];
      g.prevTwo = !!k["2"];
      g.prevThree = !!k["3"];
      g.prevFour = !!k["4"];
      g.prevMute = !!k["m"];

      if (mutePressed) g.muted = toggleMute();

      if (g.mode === "title") {
        const prevSelectedCharacter = g.selectedCharacter;
        let changed = false;
        if (leftPressed) {
          g.selectedCharacter = (g.selectedCharacter - 1 + CHARACTERS.length) % CHARACTERS.length;
          changed = true;
        }
        if (rightPressed) {
          g.selectedCharacter = (g.selectedCharacter + 1) % CHARACTERS.length;
          changed = true;
        }
        if (onePressed) { g.selectedCharacter = 0; changed = true; }
        if (twoPressed) { g.selectedCharacter = Math.min(1, CHARACTERS.length - 1); changed = true; }
        if (threePressed) { g.selectedCharacter = Math.min(2, CHARACTERS.length - 1); changed = true; }
        if (fourPressed) { g.selectedCharacter = Math.min(3, CHARACTERS.length - 1); changed = true; }
        if (changed && g.selectedCharacter !== prevSelectedCharacter) {
          sfxMenuMove();
          saveCharacterIndex(g.selectedCharacter);
        }
      }

      if ((g.mode === "title" || g.mode === "gameover") && jumpPressed) {
        startRun();
      }

      if (g.mode === "playing") {
        const p = g.player;
        const simSpeed = g.hitSlowTimer > 0 ? HIT_SLOW_FACTOR : 1;

        const startTrick = (style = "spin", intensity = 1) => {
          p.trickTimer = Math.max(p.trickTimer, TRICK_FRAMES);
          p.trickStyle = style;
          p.trickSpin = 0;
          const dir = Math.random() < 0.5 ? -1 : 1;
          p.trickSpinRate = (style === "tilt" ? 0.24 : 0.38) * dir * intensity;
        };

        const queueTrick = (style = "spin", intensity = 1) => {
          p.pendingTrickStyle = style;
          p.pendingTrickIntensity = intensity;
        };

        if (g.hitInv > 0) g.hitInv--;
        if (g.hitSlowTimer > 0) g.hitSlowTimer--;
        if (!p.onWire && p.trickTimer > 0) {
          p.trickTimer--;
          p.trickSpin += p.trickSpinRate * simSpeed;
          // Once airborne velocity reaches the apex, fire queued trick.
        } else if (!p.onWire && p.trickTimer <= 0 && p.pendingTrickStyle && Math.abs(p.vy) <= 0.8) {
          startTrick(p.pendingTrickStyle, p.pendingTrickIntensity || 1);
          p.pendingTrickStyle = null;
          p.pendingTrickIntensity = 1;
        } else if (p.onWire && p.trickTimer > 0) {
          p.trickTimer = 0;
          p.trickSpin = 0;
          p.trickSpinRate = 0;
          p.pendingTrickStyle = null;
          p.pendingTrickIntensity = 1;
        } else if (p.onWire && p.pendingTrickStyle) {
          p.pendingTrickStyle = null;
          p.pendingTrickIntensity = 1;
        }

        const doWipeout = (reason = "hit") => {
          if (g.mode !== "playing") return;

          const finishRun = () => {
            g.mode = "gameover";
            const scored = Math.floor(g.score);
            if (scored > g.best) { g.best = scored; saveBest(scored); }
            force(n => n + 1);
          };

          if (reason === "fall") {
            sfxHurt();
            finishRun();
            return;
          }

          if (g.hitInv > 0) return;

          g.lives -= 1;
          sfxHurt();
          if (g.lives <= 0) {
            finishRun();
            return;
          }

          // Bonk behavior: keep exact position, grant invulnerability, and
          // briefly slow the simulation for impact feedback.
          g.hitInv = HIT_INV_FRAMES;
          g.hitSlowTimer = HIT_SLOW_FRAMES;
          emitParticles(g.particles, p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, 10, {
            angleMin: -Math.PI, angleMax: 0,
            speedMin: 0.8, speedMax: 2.8,
            life: 24, colors: ["#fda4af", "#ffffff", "#fecaca"],
            size: 2.0, gravity: 0.05, shrink: true,
          });
        };

        // Variable jump: releasing early cuts upward velocity for a shorter arc.
        // While held at the apex the player hangs; releasing snaps to full gravity.
        if (g.jumpHeld && !jumpDown && p.vy < 0) {
          p.vy *= JUMP_CUT;
          g.jumpHeld = false;
        }
        if (!g.jumpHeld || p.vy > 0) g.jumpHeld = false;

        // Buffer the most recent jump press for a few frames
        if (jumpPressed) g.jumpBuffer = JUMP_BUFFER_FRAMES;

        // --- Update obstacles: move flyers, tick transformers, recycle ------
        for (let oi = g.obstacles.length - 1; oi >= 0; oi--) {
          const obs = g.obstacles[oi];
          if (obs.type === 'flyer') {
            obs.x += obs.vx * simSpeed;
            obs.phase++;
            if (obs.x + obs.w < g.cameraX - 200) {
              g.obstacles.splice(oi, 1);
              if (p.onFlyerIdx === oi) p.onFlyerIdx = -1;
              else if (p.onFlyerIdx > oi) p.onFlyerIdx--;
            }
          } else if (obs.type === 'transformer') {
            obs.timer = (obs.timer + simSpeed) % TRANSFORMER_CYCLE;
            if (obs.wx < g.cameraX - 300) g.obstacles.splice(oi, 1);
          } else if (obs.type === 'perch') {
            if (obs.wx < g.cameraX - 300) g.obstacles.splice(oi, 1);
          }
        }

        const tryJump = () => {
          sfxJump();
          // Apex check: are we close to either end of the current wire?
          const w = g.wires[p.currentWireIdx];
          const pa = g.poles[w.a];
          const pb = g.poles[w.b];
          const pcx = p.x + PLAYER_W / 2;
          const distToA = Math.abs(pcx - pa.x);
          const distToB = Math.abs(pcx - pb.x);
          let apexPole = null;
          if (distToA < APEX_WINDOW_X) apexPole = pa;
          else if (distToB < APEX_WINDOW_X) apexPole = pb;

          p.vy = JUMP_VY;
          if (apexPole) {
            sfxApex();
            p.vy += APEX_VY_BONUS;
            p.vx += APEX_VX_BONUS;
            queueTrick("spin", 1.15);
            g.apexFlashTimer = 28;
            g.apexFlashPoleIdx = apexPole === pa ? w.a : w.b;
            emitParticles(g.particles, apexPole.x, apexPole.y, 14, {
              angleMin: -Math.PI, angleMax: 0,
              speedMin: 1.5, speedMax: 4,
              life: 35,
              colors: ["#facc15", "#fff7ed", "#fde68a", "#fb923c"],
              size: 3, gravity: 0.06, shrink: true,
            });
          } else {
            emitParticles(g.particles, p.x + PLAYER_W / 2, p.y + PLAYER_H, 3, {
              angleMin: Math.PI * 0.2, angleMax: Math.PI * 0.8,
              speedMin: 0.4, speedMax: 1.4,
              life: 14, colors: ["#a8a29e", "#d6d3d1"],
              size: 1.6, gravity: -0.04, shrink: true,
            });
          }
          p.onWire = false;
          g.jumpHeld = true;
          g.jumpBuffer = 0;
          g.coyote = 0;
        };

        if (p.onWire) {
          g.coyote = COYOTE_FRAMES;

          const w = g.wires[p.currentWireIdx];
          const pa = g.poles[w.a];
          const pb = g.poles[w.b];

          // Slope-driven physics: gravity component along the wire tangent.
          const slope = wireSlopeAt(pa, pb, w.sag, p.x + PLAYER_W / 2);
          p.vx += slope * SLOPE_ACCEL * simSpeed;
          p.vx *= Math.pow(WIRE_FRICTION, simSpeed);
          p.vx = clamp(p.vx, MIN_VX, MAX_VX);

          p.x += p.vx * simSpeed;
          // y locked to wire curve
          const newY = wireYAt(pa, pb, w.sag, p.x + PLAYER_W / 2);
          if (newY !== null) p.y = newY - PLAYER_H;

          // Reached the right pole — advance to next wire if it exists and is present
          if (p.x + PLAYER_W / 2 >= pb.x) {
            const nextIdx = p.currentWireIdx + 1;
            if (nextIdx < g.wires.length && g.wires[nextIdx].present) {
              p.currentWireIdx = nextIdx;
            } else {
              // Gap or end of wires — go airborne
              p.onWire = false;
            }
          }

          // Perch collision: ran into bird/squirrel sitting on this wire
          {
            const pcx = p.x + PLAYER_W / 2;
            for (const obs of g.obstacles) {
              if (obs.type !== 'perch') continue;
              if (obs.wx < pa.x || obs.wx > pb.x) continue;
              if (Math.abs(pcx - obs.wx) < obs.w / 2 + PLAYER_W / 2 - 1) { doWipeout(); break; }
            }
          }
          // Transformer: running through sparking arc on wire
          {
            const pcx = p.x + PLAYER_W / 2;
            const pcy = p.y + PLAYER_H / 2;
            for (const obs of g.obstacles) {
              if (obs.type !== 'transformer' || obs.timer >= TRANSFORMER_ON) continue;
              if (Math.abs(pcx - obs.wx) < 30 && Math.abs(pcy - obs.wy) < 30) { doWipeout(); break; }
            }
          }

          if (g.jumpBuffer > 0) tryJump();
        } else {
          // Airborne
          p.x += p.vx * simSpeed;
          p.y += p.vy * simSpeed;
          // Hang gravity: if the button is still held and the player is near
          // the apex, apply slow gravity — releasing immediately restores full
          // gravity, so hold duration directly controls hang time.
          const hanging = g.jumpHeld && Math.abs(p.vy) < APEX_HANG_VY;
          p.vy += (hanging ? APEX_HANG_GRAVITY : GRAVITY) * simSpeed;
          p.vx = Math.max(MIN_VX, p.vx * Math.pow(AIR_DRAG, simSpeed));

          if (g.coyote > 0) g.coyote--;

          // Try to land on a wire (test against curve y at player's center x)
          const pcx = p.x + PLAYER_W / 2;
          const feetY = p.y + PLAYER_H;
          const oldFeetY = feetY - p.vy;
          for (let i = 0; i < g.wires.length; i++) {
            const w = g.wires[i];
            if (!w.present) continue;
            const pa = g.poles[w.a];
            const pb = g.poles[w.b];
            if (pcx < pa.x || pcx > pb.x) continue;
            const wY = wireYAt(pa, pb, w.sag, pcx);
            if (p.vy > 0 && oldFeetY <= wY + 2 && feetY >= wY - 2) {
              sfxLand();
              p.y = wY - PLAYER_H;
              p.vy = 0;
              p.onWire = true;
              p.currentWireIdx = i;
              emitParticles(g.particles, pcx, wY, 4, {
                angleMin: Math.PI * 0.2, angleMax: Math.PI * 0.8,
                speedMin: 0.4, speedMax: 1.2,
                life: 14, colors: ["#fef3c7", "#fde68a"],
                size: 1.6, gravity: -0.03, shrink: true,
              });
              break;
            }
          }

          // Assist: touching an isolated pole top auto-launches the player forward.
          if (!p.onWire && p.vy > 0) {
            for (let i = 1; i < g.poles.length - 1; i++) {
              if (!isStandalonePole(g, i)) continue;
              const pole = g.poles[i];
              if (Math.abs(pcx - pole.x) > 13) continue;
              if (oldFeetY <= pole.y + 4 && feetY >= pole.y - 4) {
                p.x = pole.x - PLAYER_W / 2;
                p.y = pole.y - PLAYER_H;
                p.vy = JUMP_VY + APEX_VY_BONUS * 0.55;
                p.vx = Math.min(MAX_VX, p.vx + APEX_VX_BONUS + 1.2);
                queueTrick("tilt", 1.1);
                p.onWire = false;
                g.jumpHeld = true;
                g.jumpBuffer = 0;
                g.coyote = 0;
                sfxApex();
                emitParticles(g.particles, pole.x, pole.y, 12, {
                  angleMin: -Math.PI, angleMax: 0,
                  speedMin: 1.1, speedMax: 3.2,
                  life: 28, colors: ["#fef08a", "#fde68a", "#ffffff"],
                  size: 2.2, gravity: 0.05, shrink: true,
                });
                break;
              }
            }
          }

          // Coyote-time jump: pressed jump just after running off the end of a wire
          if (g.jumpBuffer > 0 && g.coyote > 0 && !p.onWire) tryJump();

          // Flying obstacle collision: land on top = bounce; body hit = wipeout
          if (!p.onWire) {
            const pcx = p.x + PLAYER_W / 2;
            const pfeet = p.y + PLAYER_H;
            for (const obs of g.obstacles) {
              if (obs.type !== 'flyer') continue;
              if (pcx < obs.x || pcx > obs.x + obs.w) continue;
              if (p.vy > 0 && pfeet >= obs.y - 4 && pfeet <= obs.y + 10 && p.y < obs.y) {
                sfxBonk();
                // Land on top — auto-bounce with forward kick
                p.y = obs.y - PLAYER_H;
                p.vy = JUMP_VY * 0.78;
                p.vx = Math.min(p.vx + 1.5, MAX_VX);
                if (Math.abs(p.vy) > 8.2 || p.vx > BASE_SPEED + 2.6) queueTrick("spin", 0.95);
                g.jumpHeld = true;
                emitParticles(g.particles, pcx, obs.y, 7, {
                  angleMin: -Math.PI, angleMax: 0,
                  speedMin: 1, speedMax: 3.5,
                  life: 24, colors: ["#fde68a", "#ffffff", "#bfdbfe"],
                  size: 2.5, gravity: 0.06, shrink: true,
                });
              } else if (pfeet > obs.y && p.y < obs.y + obs.h) {
                doWipeout();
              }
              break;
            }
          }

          // Transformer: flying into sparking arc
          {
            const pcx = p.x + PLAYER_W / 2;
            const pcy = p.y + PLAYER_H / 2;
            for (const obs of g.obstacles) {
              if (obs.type !== 'transformer' || obs.timer >= TRANSFORMER_ON) continue;
              if (Math.abs(pcx - obs.wx) < 30 && Math.abs(pcy - obs.wy) < 30) { doWipeout(); break; }
            }
          }

          // Fail: fell below screen
          if (p.y > GAME_H + 100) doWipeout("fall");
        }

        // Score = forward distance / 10
        g.score = Math.max(g.score, p.x / 10);

        // Camera follow
        g.cameraX = p.x - PLAYER_OFFSET_X;

        // Recycle poles + wires
        while (g.poles.length > 2 && g.poles[1].x < g.cameraX - 200) {
          g.poles.shift();
          g.wires.shift();
          // Re-index every wire's a/b and the player's currentWireIdx
          for (const w of g.wires) { w.a--; w.b--; }
          if (p.currentWireIdx > 0) p.currentWireIdx--;
          if (g.apexFlashPoleIdx > -1) g.apexFlashPoleIdx--;
        }
        while (g.poles[g.poles.length - 1].x < g.cameraX + GAME_W + 800) {
          const last = g.poles[g.poles.length - 1];
          const next = genNextPole(last);
          g.poles.push(next);
          const canGap = g.wireRunLength >= MIN_RUN_AFTER_GAP;
          const gapIsJumpable = isGapJumpable(last, next);
          const wantsGap = canGap && Math.random() < MISSING_WIRE_CHANCE;
          const present = !(wantsGap && gapIsJumpable);
          g.wireRunLength = present ? g.wireRunLength + 1 : 0;
          const newSag = genSag(last, next);
          g.wires.push({
            a: g.poles.length - 2,
            b: g.poles.length - 1,
            sag: newSag,
            present,
          });
          // Perched obstacle on new wire
          if (present) {
            const po = genPerchedObstacle(last, next, newSag);
            if (po) g.obstacles.push(po);
          }
          // Transformer on new pole
          const to = genTransformerObstacle(next);
          if (to) g.obstacles.push(to);
        }
        // Spawn flying obstacles ahead of the camera
        while (g.lastFlyerX < g.cameraX + GAME_W + 700) {
          g.lastFlyerX += FLYER_INTERVAL * rand(0.75, 1.25);
          g.obstacles.push(spawnFlyer(g.lastFlyerX));
        }

        if (g.jumpBuffer > 0) g.jumpBuffer--;
        if (g.apexFlashTimer > 0) g.apexFlashTimer--;
      }

      updateParticles(g.particles);
      drawScene(ctx, g, frame);
      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-4 gap-4">
      <div className="max-w-[960px] w-full flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-amber-300">Wire Runner</h1>
          <p className="text-slate-300">A girl runs the telephone lines. Time the apex.</p>
        </div>
        <div className="hidden md:block text-right text-sm text-slate-300">
          Jump: Space / W / ↑<br />Hit pole top for boost
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black">
        <canvas
          ref={canvasRef}
          width={GAME_W}
          height={GAME_H}
          className="w-full max-w-[960px] aspect-video block"
        />
      </div>
      <div className="max-w-[960px] w-full rounded-2xl bg-white/10 border border-white/10 p-4 text-sm text-slate-200">
        <b>Prototype notes:</b> first version — endless runner along telephone lines. Tap jump
        right at a pole top for a big apex boost (Excitebike-style). See PLAN.md for the roadmap.
      </div>
    </div>
  );
}
