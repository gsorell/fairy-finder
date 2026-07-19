import React, { useEffect, useRef, useState } from "react";
import {
  isMuted, primeAudio, sfxBigSwing, sfxFall, sfxGrab, sfxMenuMove,
  sfxRelease, toggleMute,
} from "./audioRingSwinger";
import { TouchControls, BackButton } from "./TouchControls.jsx";

// Ring Swinger — synthwave schoolyard pendulum game.
// Hang from a ring, pump to build momentum, release at the right moment to
// fly to the next ring across an endless jungle gym.

const GAME_W = 960;
const GAME_H = 540;

const TOP_BAR_Y = 65;         // y of horizontal jungle-gym bar
const GROUND_Y = 488;
const PLAYER_OFFSET_X = 320;  // player rendered ~1/3 from screen left

// Pendulum tuning — slow, dreamy arcs. Full-swing period ~2.0s so each
// momentum-building swing reads as a deliberate beat.
const PEND_GRAVITY = 0.0028;
const SWING_DAMP = 0.99975;    // basically lossless — momentum lingers
const PUMP_ACCEL = 0.00030;    // hold direction = gentle assist
const MAX_THETA = 1.28;        // soft amplitude cap (~73°)
const START_THETA = -1.20;     // ring 0 starts player at full backswing
const MIN_RELEASE_SPEED = 0.9;

// Sweet-spot release: timing SPACE near the bottom of the forward arc gives
// a velocity boost. Players SEE the difference via the trajectory preview.
const SWEET_THETA_LO = -0.14;
const SWEET_THETA_HI = 0.34;
const SWEET_OMEGA_MIN = 0.028;
const SWEET_BOOST = 1.40;
const OK_BOOST = 1.10;

// Air physics — heavy hang time. Low gravity holds the player up at the
// peak of the arc long enough to feel the float between rings. There is no
// mid-air steering on purpose: the release commits you to a trajectory.
const GRAVITY = 0.105;
const AIR_DRAG = 0.9985;
const MAX_FALL_VY = 5.5;
const RELEASE_LOCKOUT = 6;
const GRAB_R = 50;
const FORGIVE_GRAB_R = 74;

// Slide-top platforms. You can land on them mid-flight and jump off to
// bridge wider gaps. Required slides sit between rings whose gap is too
// wide to clear in a single swing; optional ones are scoring shortcuts.
const SLIDE_PROB = 0.40;
const SLIDE_REQUIRED_PROB = 0.30;
const SLIDE_PLATFORM_TOP_MIN = 360;
const SLIDE_PLATFORM_TOP_MAX = 400;
const SLIDE_PLATFORM_W = 64;
const SLIDE_LAND_HALF_W = 46;     // generous — bigger than the visible plank
const SLIDE_JUMP_VX = 13;
const SLIDE_JUMP_VY = -8.0;

// World — wide gaps to match the long arcs. Tight chain-length variation
// keeps every ring at almost the same height for predictable timing.
const RING_MIN_GAP = 270;
const RING_MAX_GAP = 360;
const RING_DIFFICULTY_GAP = 0.18;
const CHAIN_MIN_LEN = 230;
const CHAIN_MAX_LEN = 250;
const RING_R = 11;
const POST_SPACING = 280;
const SAFE_RINGS_AT_START = 3;

const HIGHSCORE_KEY = "ring-swinger-best";
const CHARACTER_KEY = "fairy-finder-character";

const CHARACTERS = [
  { id: "big", name: "Big Sis", skin: "#f4d4b0", hair: "#2b1810", top: "#7dd3fc", trim: "#bae6fd", legs: "#f4d4b0", shoes: "#f8fafc", accessory: "flower" },
  { id: "lil", name: "Lil Sis", skin: "#f8e0c0", hair: "#8b3a1f", top: "#fbcfe8", trim: "#fda4af", legs: "#f8e0c0", shoes: "#f8fafc", accessory: "ribbons" },
  { id: "dad", name: "Dad", skin: "#e8c4a0", hair: "#1f2937", top: "#0ea5e9", trim: "#0284c7", legs: "#27364a", shoes: "#1f2937", accessory: "sunglasses" },
  { id: "mom", name: "Mom", skin: "#e8c4a0", hair: "#5b3920", top: "#fef3c7", trim: "#fde68a", legs: "#1e3a5f", shoes: "#1f2937", accessory: "earrings" },
];

const RING_PALETTE = [
  { core: "#ff8c66", glow: "#ffc4a8" }, // coral
  { core: "#7bc6e0", glow: "#bce3ee" }, // dusk sky
  { core: "#ffd76b", glow: "#fff0c2" }, // warm gold
  { core: "#c2a4e0", glow: "#decaeb" }, // soft lavender
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

// --- Ring generation -------------------------------------------------------

function genNextRing(prev, idx) {
  // Slightly grow gap with progress (idx = ring number from start).
  const t = clamp(idx / 60, 0, 1);
  const gMin = RING_MIN_GAP + (RING_MAX_GAP - RING_MIN_GAP) * RING_DIFFICULTY_GAP * t;
  const gMax = RING_MAX_GAP * (0.85 + 0.15 * t);
  const gap = rand(gMin, gMax);
  // Vary chain length subtly so trajectory matters.
  let len;
  if (idx < SAFE_RINGS_AT_START) {
    len = 240;
  } else {
    len = clamp(prev.chainLen + rand(-12, 12), CHAIN_MIN_LEN, CHAIN_MAX_LEN);
  }
  const palette = RING_PALETTE[idx % RING_PALETTE.length];
  return { x: prev.x + gap, chainLen: len, idx, color: palette };
}

// Append the next world segment to the rings/slides arrays. Sometimes a
// slide is inserted between the previous ring and the next one — required
// slides sit in front of a wider-than-normal gap.
function appendNextSegment(rings, slides) {
  const last = rings[rings.length - 1];
  const nextRingIdx = last.idx + 1;

  if (nextRingIdx > SAFE_RINGS_AT_START && Math.random() < SLIDE_PROB) {
    const required = Math.random() < SLIDE_REQUIRED_PROB;
    const slideX = last.x + rand(170, 230);
    const top = SLIDE_PLATFORM_TOP_MIN +
      Math.random() * (SLIDE_PLATFORM_TOP_MAX - SLIDE_PLATFORM_TOP_MIN);
    const nextSlideIdx = slides.length > 0 ? slides[slides.length - 1].idx + 1 : 0;
    slides.push({
      x: slideX,
      top,
      idx: nextSlideIdx,
      side: Math.random() < 0.5 ? -1 : 1,
      required,
    });
    // Required slides are followed by a far ring; optional slides keep a
    // normal gap so a fast swing can fly over.
    const gap2 = required ? rand(290, 360) : rand(190, 240);
    const len = clamp(last.chainLen + rand(-12, 12), CHAIN_MIN_LEN, CHAIN_MAX_LEN);
    rings.push({
      x: slideX + gap2,
      chainLen: len,
      idx: nextRingIdx,
      color: RING_PALETTE[nextRingIdx % RING_PALETTE.length],
    });
  } else {
    rings.push(genNextRing(last, nextRingIdx));
  }
}

function makeInitialWorld() {
  const rings = [{ x: 280, chainLen: 240, idx: 0, color: RING_PALETTE[0] }];
  const slides = [];
  while (rings[rings.length - 1].x < 2800) {
    appendNextSegment(rings, slides);
  }
  return { rings, slides };
}

function ringRestPos(ring) {
  return { x: ring.x, y: TOP_BAR_Y + ring.chainLen };
}

// --- Particles -------------------------------------------------------------

function makeParticlePool(size = 80) {
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
    p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
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

// --- Game state ------------------------------------------------------------

function makeGame(mode = "title", selectedCharacter = loadCharacterIndex()) {
  const world = makeInitialWorld();
  const rings = world.rings;
  const slides = world.slides;
  const startRing = rings[0];
  // Player starts at the back peak of the first ring's swing — gravity will
  // immediately pull them forward, so they're swinging within a few frames
  // without needing any input. Like Aladdin landing on a rope.
  const theta0 = START_THETA;
  return {
    mode,
    rings,
    slides,
    player: {
      x: startRing.x + startRing.chainLen * Math.sin(theta0),
      y: TOP_BAR_Y + startRing.chainLen * Math.cos(theta0),
      vx: 0, vy: 0,
      state: "swing", // swing | air | platform
      ringIdx: 0,
      slideIdx: -1,
      theta: theta0,
      omega: 0,
      bodyRot: 0,
      bodyRotRate: 0,
      releaseLockout: 0,
      lastReleasedIdx: -1,
      kickFlash: 0,
      platformIdleFrames: 0,
    },
    cameraX: startRing.x - PLAYER_OFFSET_X,
    score: 0,
    bestRing: 0,
    best: loadBest(),
    selectedCharacter,
    muted: isMuted(),
    prevJump: false,
    prevLeft: false,
    prevRight: false,
    prevOne: false, prevTwo: false, prevThree: false, prevFour: false,
    prevMute: false,
    twinkles: makeTwinkles(),
    clouds: makeClouds(),
    particles: makeParticlePool(),
    popups: [],         // floating "+50" world-space score chips
    callout: null,      // big screen-space banner like "GOLDEN!" or "x5 COMBO!"
    combo: 0,
    bestCombo: 0,
    flashFrames: 0,     // brief screen flash on big events
  };
}

// Combo → score multiplier: x1, x1.5, x2, x2.5, ... every 3 chained moves.
function comboMult(combo) {
  return 1 + Math.floor(combo / 3) * 0.5;
}

function addPopup(g, x, y, text, color = "#fff7d6") {
  if (g.popups.length > 24) g.popups.shift();
  g.popups.push({
    x, y, text, color,
    vy: -1.4 - Math.random() * 0.4,
    life: 48, maxLife: 48,
  });
}

function setCallout(g, text, color = "#fff7d6") {
  g.callout = { text, color, life: 60, maxLife: 60 };
  g.flashFrames = Math.max(g.flashFrames, 6);
}

function updatePopups(popups) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy;
    p.vy *= 0.96;
    p.life--;
    if (p.life <= 0) popups.splice(i, 1);
  }
}

function updateCallout(g) {
  if (g.callout) {
    g.callout.life--;
    if (g.callout.life <= 0) g.callout = null;
  }
  if (g.flashFrames > 0) g.flashFrames--;
}

function drawPopups(ctx, popups, cameraX) {
  for (const p of popups) {
    const a = Math.min(1, p.life / 24);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `800 18px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(58,35,71,0.9)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x - cameraX, p.y);
    ctx.restore();
  }
}

function drawCallout(ctx, callout, frame) {
  if (!callout) return;
  const t = 1 - callout.life / callout.maxLife;
  const easeOut = 1 - Math.pow(1 - t, 3);
  // Slide in from above + fade out at end
  const cx = GAME_W / 2;
  const cy = 130 + (1 - easeOut) * -18;
  const a = callout.life > 12 ? 1 : callout.life / 12;
  const scale = 1 + (1 - easeOut) * 0.15;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.font = `900 38px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(58,35,71,0.95)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = callout.color;
  ctx.fillText(callout.text, 0, 0);
  ctx.restore();
}

function makeTwinkles() {
  // A few early stars near the top of the dusk sky.
  const arr = [];
  for (let i = 0; i < 22; i++) {
    arr.push({
      x: Math.random() * GAME_W * 1.6,
      y: Math.random() * 90,
      r: 0.4 + Math.random() * 1.0,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return arr;
}

function makeClouds() {
  const arr = [];
  const tints = ["#ffd6b3", "#f4b896", "#ffe2c2", "#e7a08f"];
  for (let i = 0; i < 6; i++) {
    arr.push({
      x: Math.random() * GAME_W * 1.5,
      y: 110 + Math.random() * 130,
      scale: 0.7 + Math.random() * 0.7,
      drift: 0.04 + Math.random() * 0.10,
      tint: tints[i % tints.length],
    });
  }
  return arr;
}

// --- Drawing helpers -------------------------------------------------------

function drawText(ctx, text, x, y, size = 18, color = "white", align = "left", weight = 700) {
  ctx.save();
  ctx.font = `${weight} ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawSky(ctx, frame) {
  // Ponyo dusk: deep indigo overhead → lavender → coral → warm peach at the
  // horizon. Painterly, no neon.
  const grad = ctx.createLinearGradient(0, 0, 0, 430);
  grad.addColorStop(0.00, "#1f1944");
  grad.addColorStop(0.18, "#3d2c66");
  grad.addColorStop(0.38, "#7d4d80");
  grad.addColorStop(0.58, "#d27a78");
  grad.addColorStop(0.78, "#f5a06f");
  grad.addColorStop(1.00, "#ffd29a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, 430);
}

function drawTwinkles(ctx, twinkles, frame) {
  ctx.save();
  for (const t of twinkles) {
    const a = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(frame * 0.05 + t.phase));
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSun(ctx, frame) {
  // Big warm setting sun, low on the horizon. No scan bands — just a soft
  // glow falling into the sea.
  const cx = GAME_W * 0.66;
  const cy = 388;
  const r = 118;
  // Outer halo bleeding into the sky
  const halo = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.6);
  halo.addColorStop(0.00, "rgba(255,222,170,0.55)");
  halo.addColorStop(0.45, "rgba(255,180,120,0.22)");
  halo.addColorStop(1.00, "rgba(255,180,120,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, GAME_W, 460);

  // Sun body — soft cream → peach → coral
  const grad = ctx.createRadialGradient(cx, cy - 18, r * 0.18, cx, cy, r);
  grad.addColorStop(0.00, "#fff7d6");
  grad.addColorStop(0.45, "#ffe19a");
  grad.addColorStop(0.85, "#ffaf72");
  grad.addColorStop(1.00, "#ee8455");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawCloud(ctx, x, y, s, tint) {
  ctx.save();
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(x,            y,           18 * s, 0, Math.PI * 2);
  ctx.arc(x + 22 * s,   y - 6 * s,   22 * s, 0, Math.PI * 2);
  ctx.arc(x + 48 * s,   y,           20 * s, 0, Math.PI * 2);
  ctx.arc(x + 70 * s,   y + 4 * s,   16 * s, 0, Math.PI * 2);
  ctx.fill();
  // Sunlit tops
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#fff1d4";
  ctx.beginPath();
  ctx.arc(x + 18 * s,   y - 11 * s,  10 * s, 0, Math.PI * 2);
  ctx.arc(x + 44 * s,   y - 9 * s,    9 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClouds(ctx, cameraX, frame, clouds) {
  const periodX = GAME_W + 400;
  for (const c of clouds) {
    const off = cameraX * 0.05 + frame * c.drift;
    const x = ((c.x - off) % periodX + periodX) % periodX - 200;
    drawCloud(ctx, x, c.y, c.scale, c.tint);
  }
}

function drawHills(ctx, cameraX) {
  // Two rolling hill silhouettes, parallax. Soft rounded shapes — Ponyo
  // islands at dusk.
  ctx.save();
  // Far hills — purple-blue, sit just under the sun
  const off1 = (cameraX * 0.10) % 320;
  ctx.fillStyle = "#5e3f6e";
  ctx.beginPath();
  ctx.moveTo(0, 430);
  for (let x = -off1; x <= GAME_W + 320; x += 60) {
    const peak = 415 + Math.sin(x * 0.011) * 18 - Math.cos(x * 0.027) * 6;
    ctx.lineTo(x, peak);
  }
  ctx.lineTo(GAME_W + 320, 430);
  ctx.closePath();
  ctx.fill();
  // Near hills — deeper plum, more textured
  const off2 = (cameraX * 0.18) % 260;
  ctx.fillStyle = "#3a2347";
  ctx.beginPath();
  ctx.moveTo(0, 442);
  for (let x = -off2; x <= GAME_W + 260; x += 48) {
    const peak = 428 + Math.sin(x * 0.019) * 10 + Math.sin(x * 0.061) * 3;
    ctx.lineTo(x, peak);
  }
  ctx.lineTo(GAME_W + 260, 442);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawOcean(ctx, cameraX, frame) {
  // Calm sunset-lit water. Top of the band catches the warm sky; depth
  // darkens toward the shoreline.
  const yTop = 442;
  const yBot = 472;
  const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
  grad.addColorStop(0.00, "#9b6c8a");
  grad.addColorStop(0.45, "#c47376");
  grad.addColorStop(1.00, "#6f4566");
  ctx.fillStyle = grad;
  ctx.fillRect(0, yTop, GAME_W, yBot - yTop);

  // Sun reflection — wavering gold strip beneath the sun.
  const cx = GAME_W * 0.66;
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const yy = yTop + 1 + i * 3.2;
    const w = 110 + Math.sin(frame * 0.05 + i * 0.7) * 22 - i * 8;
    if (w <= 0) continue;
    const a = 0.55 - i * 0.05;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = i % 2 === 0 ? "#ffe7be" : "#ffba87";
    ctx.fillRect(cx - w / 2, yy, w, 1.6);
  }
  ctx.restore();

  // Shoreline highlight
  ctx.fillStyle = "#3a2347";
  ctx.fillRect(0, yBot - 1, GAME_W, 2);
}

function drawPalm(ctx, x, y, scale = 1, flip = 1) {
  // Backlit palm silhouette in dusk plum. Slightly warmer rim from the sun.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * flip, scale);
  ctx.fillStyle = "#2a1830";
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const w = 6 - t * 3;
    ctx.fillRect(-w / 2 + Math.sin(t * 3) * 2, -i * 9, w, 9);
  }
  ctx.translate(0, -72);
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI * 0.5 + (f - 3) * 0.42;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = "#2a1830";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(20, -6, 42, -2);
    ctx.quadraticCurveTo(20, 4, 0, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawPalms(ctx, cameraX) {
  const off = cameraX * 0.30;
  const positions = [80, 240, 420, 620, 820, 1020, 1240];
  for (const px of positions) {
    const x = ((px - off) % (GAME_W + 200) + (GAME_W + 200)) % (GAME_W + 200) - 80;
    drawPalm(ctx, x, 470, 0.9, x % 200 < 100 ? 1 : -1);
  }
}

function drawGround(ctx, cameraX) {
  // Beach/grass strip running between the ocean and the playground floor.
  // Warm sand on top, soft grass tufts, and dark earth below GROUND_Y.
  const sandTop = 472;
  const sandGrad = ctx.createLinearGradient(0, sandTop, 0, GROUND_Y);
  sandGrad.addColorStop(0.00, "#e9b07a");
  sandGrad.addColorStop(1.00, "#a86b4a");
  ctx.fillStyle = sandGrad;
  ctx.fillRect(0, sandTop, GAME_W, GROUND_Y - sandTop);

  // Grass tufts along the playground edge
  ctx.fillStyle = "#5b8a4a";
  const off = (cameraX * 0.6) % 24;
  for (let x = -off; x < GAME_W; x += 24) {
    ctx.fillRect(x, GROUND_Y - 5, 2, 4);
    ctx.fillRect(x + 4, GROUND_Y - 4, 2, 3);
    ctx.fillRect(x + 8, GROUND_Y - 6, 2, 5);
  }

  // Earth strip below the play floor
  ctx.fillStyle = "#3d2418";
  ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
  // Pebble flecks
  ctx.fillStyle = "#5a3a26";
  for (let i = 0; i < 18; i++) {
    const px = (i * 73 - (cameraX * 0.6) % 73 + GAME_W) % GAME_W;
    ctx.fillRect(px, GROUND_Y + 8 + (i % 4) * 6, 3, 2);
  }
}

function drawJungleGym(ctx, cameraX) {
  // Painted-metal monkey bars — coral-red top, cream highlights. Lit from
  // the right by the setting sun.
  const yBar = TOP_BAR_Y;
  ctx.save();
  const grad = ctx.createLinearGradient(0, yBar - 7, 0, yBar + 7);
  grad.addColorStop(0.00, "#ffb89a");
  grad.addColorStop(0.45, "#e2603e");
  grad.addColorStop(1.00, "#7a2a1a");
  ctx.fillStyle = grad;
  ctx.fillRect(cameraX - 20, yBar - 6, GAME_W + 40, 12);
  // Top highlight
  ctx.fillStyle = "rgba(255,234,210,0.55)";
  ctx.fillRect(cameraX - 20, yBar - 6, GAME_W + 40, 1.5);
  ctx.restore();

  // Vertical posts at fixed world spacing — same warm coral, softly shaded.
  const firstPostX = Math.floor((cameraX - 100) / POST_SPACING) * POST_SPACING;
  ctx.save();
  for (let wx = firstPostX; wx < cameraX + GAME_W + 100; wx += POST_SPACING) {
    const pg = ctx.createLinearGradient(wx - 5, 0, wx + 5, 0);
    pg.addColorStop(0.00, "#ffb89a");
    pg.addColorStop(0.50, "#d65a3a");
    pg.addColorStop(1.00, "#5a1d12");
    ctx.fillStyle = pg;
    ctx.fillRect(wx - 4, yBar - 6, 8, 14);
    ctx.fillRect(wx - 3, yBar + 8, 6, GROUND_Y - (yBar + 8));
    // Footing — buried plate at ground line
    ctx.fillStyle = "#2a1812";
    ctx.fillRect(wx - 14, GROUND_Y - 4, 28, 6);
  }
  ctx.restore();
}

function drawRing(ctx, ring, theta, attached, frame, telegraph = 0) {
  // Chain top point
  const topX = ring.x;
  const topY = TOP_BAR_Y;
  const bottomX = topX + ring.chainLen * Math.sin(theta);
  const bottomY = topY + ring.chainLen * Math.cos(theta);

  // Telegraph beacon — a soft halo on the NEXT ring that brightens while the
  // player is in the ideal release window. Helps players learn timing.
  if (telegraph > 0) {
    ctx.save();
    const r = 22 + telegraph * 18;
    const halo = ctx.createRadialGradient(bottomX, bottomY, 4, bottomX, bottomY, r);
    halo.addColorStop(0, `rgba(255,255,255,${0.35 * telegraph})`);
    halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(bottomX - r, bottomY - r, r * 2, r * 2);
    ctx.restore();
  }

  // Chain links — warm pewter so they sit in the sunset palette.
  ctx.save();
  ctx.strokeStyle = "#d6c4a8";
  ctx.lineWidth = 1.3;
  ctx.shadowBlur = 0;
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const t1 = i / segs;
    const t2 = (i + 1) / segs;
    const x1 = topX + (bottomX - topX) * t1;
    const y1 = topY + (bottomY - topY) * t1;
    const x2 = topX + (bottomX - topX) * t2;
    const y2 = topY + (bottomY - topY) * t2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (i % 2 === 0) {
      ctx.fillStyle = "#a08868";
      ctx.beginPath();
      ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Ring handle
  const pulse = attached ? 1.15 : 1.0;
  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = ring.color.core;
  ctx.lineWidth = 4;
  ctx.strokeStyle = ring.color.core;
  ctx.beginPath();
  ctx.arc(bottomX, bottomY, RING_R * pulse, 0, Math.PI * 2);
  ctx.stroke();
  // Inner glow ring
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = ring.color.glow;
  ctx.beginPath();
  ctx.arc(bottomX, bottomY, (RING_R - 2.4) * pulse, 0, Math.PI * 2);
  ctx.stroke();
  // Highlight
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(bottomX - 2, bottomY - 2, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSlide(ctx, slide) {
  // Wooden playground slide-top: a flat plank held up by two posts, with a
  // colorful curving slide off one side and a ladder on the other.
  const { x, top, side, required } = slide;
  const platW = SLIDE_PLATFORM_W;
  const platH = 8;

  // Posts (legs) — warm brown, lit from sun side
  ctx.fillStyle = "#6b4626";
  ctx.fillRect(x - platW / 2 + 2, top + platH, 5, GROUND_Y - (top + platH));
  ctx.fillRect(x + platW / 2 - 7, top + platH, 5, GROUND_Y - (top + platH));
  ctx.fillStyle = "#8a5b32";
  ctx.fillRect(x - platW / 2 + 2, top + platH, 1, GROUND_Y - (top + platH));
  ctx.fillRect(x + platW / 2 - 7, top + platH, 1, GROUND_Y - (top + platH));

  // Platform plank — warm cedar with subtle grain
  const plankGrad = ctx.createLinearGradient(0, top, 0, top + platH);
  plankGrad.addColorStop(0, "#e8b07c");
  plankGrad.addColorStop(1, "#8a5530");
  ctx.fillStyle = plankGrad;
  ctx.fillRect(x - platW / 2, top, platW, platH);
  ctx.strokeStyle = "#5a3a1f";
  ctx.lineWidth = 0.6;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(x - platW / 2 + 4, top + i * 1.5);
    ctx.lineTo(x + platW / 2 - 4, top + i * 1.5);
    ctx.stroke();
  }
  // Top edge highlight
  ctx.fillStyle = "rgba(255,242,210,0.65)";
  ctx.fillRect(x - platW / 2, top, platW, 1.2);

  // Required slides get a small chalk arrow on the deck so players read
  // them as a route, not an option.
  if (required) {
    ctx.fillStyle = "#fff4d6";
    ctx.globalAlpha = 0.85;
    const ax = x - 6, ay = top + 3;
    ctx.fillRect(ax, ay, 10, 2);
    ctx.fillRect(ax + 9, ay - 2, 2, 6);
    ctx.fillRect(ax + 7, ay - 1, 2, 4);
    ctx.globalAlpha = 1;
  }

  // Slide chute — colorful curve
  const sx = x + side * (platW / 2 - 4);
  const sy = top + platH - 2;
  const ex = x + side * (platW / 2 + 52);
  const ey = GROUND_Y - 6;
  const cpx = sx + side * 18;
  const cpy = sy + 34;
  ctx.save();
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#7bc6e0";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cpx, cpy, ex, ey);
  ctx.stroke();
  // Highlight stripe
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#e6f4f9";
  ctx.beginPath();
  ctx.moveTo(sx, sy + 0.5);
  ctx.quadraticCurveTo(cpx, cpy - 1, ex - side * 2, ey - 1);
  ctx.stroke();
  ctx.restore();

  // Ladder on the opposite side — two rails + rungs
  const ldSide = -side;
  const lx0 = x + ldSide * (platW / 2 - 5);
  const lx1 = x + ldSide * (platW / 2 + 6);
  ctx.strokeStyle = "#6b4626";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lx0, top + platH);
  ctx.lineTo(lx0, GROUND_Y - 4);
  ctx.moveTo(lx1, top + platH);
  ctx.lineTo(lx1, GROUND_Y - 4);
  ctx.stroke();
  const rungs = 4;
  for (let i = 1; i <= rungs; i++) {
    const ty = top + platH + (GROUND_Y - top - platH - 4) * (i / (rungs + 1));
    ctx.beginPath();
    ctx.moveTo(lx0, ty);
    ctx.lineTo(lx1, ty);
    ctx.stroke();
  }
}

function drawPlayerStanding(ctx, character, frame) {
  // Origin: feet at (0, 0). Body extends UPWARD. Used when standing on a
  // slide-top platform.
  const isDad = character.id === "dad";
  const isMom = character.id === "mom";
  const isLil = character.id === "lil";
  const sway = Math.sin(frame * 0.06) * 0.5;

  ctx.save();
  ctx.translate(sway * 0.3, 0);

  // Legs
  ctx.fillStyle = character.legs;
  ctx.fillRect(-4, -12, 4, 12);
  ctx.fillRect(0, -12, 4, 12);
  // Shoes
  ctx.fillStyle = character.shoes;
  ctx.fillRect(-5, -2, 5, 2);
  ctx.fillRect(0, -2, 5, 2);

  // Torso
  ctx.fillStyle = character.top;
  if (isDad) ctx.fillRect(-7, -24, 14, 12);
  else if (isLil) ctx.fillRect(-7, -23, 14, 11);
  else ctx.fillRect(-6, -24, 12, 12);
  ctx.fillStyle = character.trim;
  ctx.fillRect(-7, -14, 14, 2);

  // Arms at sides
  ctx.fillStyle = character.skin;
  ctx.fillRect(-8, -22, 3, 11);
  ctx.fillRect(5, -22, 3, 11);

  // Head
  ctx.fillStyle = character.skin;
  ctx.fillRect(-5, -33, 10, 9);

  // Hair
  ctx.fillStyle = character.hair;
  if (isDad) {
    ctx.fillRect(-7, -33, 14, 4);
  } else if (isMom) {
    ctx.fillRect(-8, -33, 16, 5);
    ctx.fillRect(-8, -30, 2, 5);
    ctx.fillRect(6, -30, 2, 5);
  } else if (isLil) {
    ctx.fillRect(-7, -33, 14, 5);
    ctx.fillRect(-9, -31, 2, 5);
    ctx.fillRect(7, -31, 2, 5);
  } else {
    ctx.fillRect(-7, -33, 14, 5);
    ctx.fillRect(-9, -31, 3, 6);
  }

  // Accessory
  if (character.accessory === "flower") {
    ctx.fillStyle = "#ec4899"; ctx.fillRect(-7, -32, 2, 2);
    ctx.fillStyle = "#fde68a"; ctx.fillRect(-6, -31, 1, 1);
  } else if (character.accessory === "ribbons") {
    ctx.fillStyle = "#ec4899";
    ctx.fillRect(-9, -31, 2, 1); ctx.fillRect(7, -31, 2, 1);
  } else if (character.accessory === "sunglasses") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(-4, -30, 3, 2); ctx.fillRect(1, -30, 3, 2); ctx.fillRect(-1, -30, 2, 1);
  } else if (character.accessory === "earrings") {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-6, -27, 1, 1); ctx.fillRect(5, -27, 1, 1);
  }

  // Eyes
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-3, -29, 1.5, 2);
  ctx.fillRect(2, -29, 1.5, 2);
  // Smile
  ctx.fillStyle = "#9f1239";
  ctx.fillRect(-1, -26, 3, 1);

  ctx.restore();
}

function drawPlayerAtPivot(ctx, character, frame, isSwinging, kickFlash) {
  // Origin: (0, 0) at the hand pivot (where hands grab the ring).
  // Body extends downward.
  const flash = kickFlash > 0 && Math.floor(frame / 3) % 2 === 0;

  ctx.save();

  if (flash) {
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#fff";
  }

  const isDad = character.id === "dad";
  const isMom = character.id === "mom";
  const isLil = character.id === "lil";

  // Arms — going from hand (0,0) down-out to shoulders at y≈12
  ctx.fillStyle = character.skin;
  // left arm (drawn as 2 segments to fake angle)
  ctx.fillRect(-3, 0, 3, 12);
  ctx.fillRect(-6, 9, 4, 4);
  // right arm
  ctx.fillRect(0, 0, 3, 12);
  ctx.fillRect(2, 9, 4, 4);

  // Head — between/below hands at y=2..12
  ctx.fillStyle = character.skin;
  ctx.fillRect(-5, 4, 10, 9);

  // Hair
  ctx.fillStyle = character.hair;
  if (isDad) {
    ctx.fillRect(-7, 4, 14, 4);
  } else if (isMom) {
    ctx.fillRect(-8, 4, 16, 5);
    ctx.fillRect(-8, 7, 2, 5);
    ctx.fillRect(6, 7, 2, 5);
  } else if (isLil) {
    ctx.fillRect(-7, 4, 14, 5);
    ctx.fillRect(-9, 6, 2, 5);
    ctx.fillRect(7, 6, 2, 5);
  } else {
    ctx.fillRect(-7, 4, 14, 5);
    ctx.fillRect(-9, 6, 3, 6);
  }

  if (character.accessory === "flower") {
    ctx.fillStyle = "#ec4899"; ctx.fillRect(-7, 5, 2, 2);
    ctx.fillStyle = "#fde68a"; ctx.fillRect(-6, 6, 1, 1);
  } else if (character.accessory === "ribbons") {
    ctx.fillStyle = "#ec4899";
    ctx.fillRect(-9, 6, 2, 1); ctx.fillRect(7, 6, 2, 1);
  } else if (character.accessory === "sunglasses") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(-4, 7, 3, 2); ctx.fillRect(1, 7, 3, 2); ctx.fillRect(-1, 7, 2, 1);
  } else if (character.accessory === "earrings") {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-6, 10, 1, 1); ctx.fillRect(5, 10, 1, 1);
  }

  // Eyes
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-3, 8, 1.5, 2);
  ctx.fillRect(2, 8, 1.5, 2);
  // Smile
  ctx.fillStyle = "#9f1239";
  ctx.fillRect(-1, 11, 3, 1);

  // Torso
  ctx.fillStyle = character.top;
  if (isDad) ctx.fillRect(-7, 13, 14, 12);
  else if (isLil) ctx.fillRect(-7, 13, 14, 11);
  else ctx.fillRect(-6, 13, 12, 12);
  ctx.fillStyle = character.trim;
  ctx.fillRect(-7, 23, 14, 2);

  // Legs — slight kick animation when swinging hard
  const legSwing = isSwinging
    ? Math.sin(frame * 0.12) * 2
    : Math.sin(frame * 0.18) * 3;
  ctx.fillStyle = character.legs;
  ctx.fillRect(-4 + legSwing * 0.4, 25, 4, 11);
  ctx.fillRect(0 - legSwing * 0.4, 25, 4, 11);
  // Shoes
  ctx.fillStyle = character.shoes;
  ctx.fillRect(-5 + legSwing * 0.4, 35, 5, 2);
  ctx.fillRect(-1 - legSwing * 0.4, 35, 5, 2);

  ctx.restore();
}

// Walk the predicted release trajectory and find where it ends — at a
// grabbable ring, a slide-top, or the ground. Returns { tEnd, endpoint }
// where endpoint describes the marker to draw.
function predictTrajectory(p, rings, slides, vx0, vy0) {
  for (let t = 1; t <= 240; t++) {
    const x = p.x + vx0 * t;
    const y = p.y + vy0 * t + 0.5 * GRAVITY * t * t;
    if (t > RELEASE_LOCKOUT) {
      // Ring catch (forgiving radius — matches in-game grab when SPACE held)
      for (const ring of rings) {
        if (ring.idx === p.ringIdx) continue;
        const rest = ringRestPos(ring);
        if (Math.hypot(x - rest.x, y - rest.y) < FORGIVE_GRAB_R) {
          return { tEnd: t, endpoint: { x: rest.x, y: rest.y, type: "ring", color: ring.color } };
        }
      }
      // Slide landing (must be falling and crossing the plank top)
      const vyNow = vy0 + GRAVITY * t;
      if (vyNow > 0) {
        for (const slide of slides) {
          if (Math.abs(x - slide.x) > SLIDE_LAND_HALF_W) continue;
          const yPrev = y - vyNow;
          if (yPrev < slide.top && y >= slide.top - 1) {
            return { tEnd: t, endpoint: { x: slide.x, y: slide.top, type: "slide", required: slide.required } };
          }
        }
      }
    }
    if (y > GROUND_Y - 8) {
      return { tEnd: t, endpoint: { x, y: GROUND_Y - 8, type: "ground" } };
    }
  }
  return { tEnd: 240, endpoint: null };
}

// Trajectory preview — dotted parabola plus a glowing endpoint marker so
// the player knows whether their current swing will catch a ring, land on
// a slide, or fall to the ground.
function drawTrajectoryPreview(ctx, p, frame, rings, slides) {
  if (p.state !== "swing") return;
  if (p.omega <= 0 || p.vx <= 0.5) return;
  const inSweet =
    p.theta > SWEET_THETA_LO &&
    p.theta < SWEET_THETA_HI &&
    p.omega > SWEET_OMEGA_MIN;
  const boost = inSweet ? SWEET_BOOST : OK_BOOST;
  const vx0 = p.vx * boost;
  const vy0 = p.vy * boost;

  const { tEnd, endpoint } = predictTrajectory(p, rings, slides, vx0, vy0);

  // Color the line by the *type* of outcome so the player reads it
  // instantly — gold for ring, peach for slide, red for ground.
  let lineColor = "#ffd1b8", glowColor = "#ff8c66", alpha = 0.55;
  if (endpoint?.type === "ring") {
    lineColor = inSweet ? "#fff2c8" : "#fff1d4";
    glowColor = inSweet ? "#ffd76b" : "#ffae5a";
    alpha = inSweet ? 0.95 : 0.75;
  } else if (endpoint?.type === "slide") {
    lineColor = endpoint.required ? "#ffe19a" : "#ffd9b3";
    glowColor = endpoint.required ? "#ffae5a" : "#e8b07c";
    alpha = 0.85;
  } else if (endpoint?.type === "ground") {
    lineColor = "#ff8c66";
    glowColor = "#7a2a1a";
    alpha = 0.45;
  }

  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  const dashOffset = -((frame * 0.6) % 14);
  ctx.setLineDash([4, 8]);
  ctx.lineDashOffset = dashOffset;
  ctx.strokeStyle = lineColor;
  ctx.shadowBlur = inSweet ? 12 : 4;
  ctx.shadowColor = glowColor;
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  let drew = false;
  const tStop = Math.min(tEnd, 200);
  for (let t = 6; t <= tStop; t += 3) {
    const x = p.x + vx0 * t;
    const y = p.y + vy0 * t + 0.5 * GRAVITY * t * t;
    if (!drew) { ctx.moveTo(x, y); drew = true; }
    else ctx.lineTo(x, y);
  }
  if (drew) ctx.stroke();
  ctx.setLineDash([]);

  // Endpoint marker — pulsing target ring at the predicted landing point.
  if (endpoint) {
    const r = 11 + 2 * Math.sin(frame * 0.25);
    let ringColor, fillColor;
    if (endpoint.type === "ring") {
      ringColor = endpoint.color.glow;
      fillColor = endpoint.color.core;
    } else if (endpoint.type === "slide") {
      ringColor = endpoint.required ? "#ffd76b" : "#ffd9b3";
      fillColor = "#fff7d6";
    } else {
      ringColor = "#ff8c66";
      fillColor = "#3a2347";
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ringColor;
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(endpoint.x, endpoint.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(endpoint.x, endpoint.y, 3, 0, Math.PI * 2);
    ctx.fill();
    if (endpoint.type === "ground") {
      // Big red X — releasing now will fall.
      ctx.strokeStyle = "#fff7d6";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(endpoint.x - 4, endpoint.y - 4);
      ctx.lineTo(endpoint.x + 4, endpoint.y + 4);
      ctx.moveTo(endpoint.x + 4, endpoint.y - 4);
      ctx.lineTo(endpoint.x - 4, endpoint.y + 4);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// --- Scene -----------------------------------------------------------------

function drawScene(ctx, game, frame) {
  const character = CHARACTERS[game.selectedCharacter] ?? CHARACTERS[0];
  ctx.clearRect(0, 0, GAME_W, GAME_H);

  // Background layers (do not scroll with world camera).
  drawSky(ctx, frame);
  drawTwinkles(ctx, game.twinkles, frame);
  drawSun(ctx, frame);
  drawClouds(ctx, game.cameraX, frame, game.clouds);
  drawHills(ctx, game.cameraX);
  drawOcean(ctx, game.cameraX, frame);
  drawPalms(ctx, game.cameraX);
  drawGround(ctx, game.cameraX);

  // World layer
  ctx.save();
  ctx.translate(-game.cameraX, 0);

  drawJungleGym(ctx, game.cameraX);

  // Slides — drawn before rings so chains/players sit on top of any handrail
  // overlap.
  for (const s of game.slides) {
    if (s.x < game.cameraX - 120 || s.x > game.cameraX + GAME_W + 120) continue;
    drawSlide(ctx, s);
  }

  // Telegraph beacon on the next ring — brightens while the player's swing is
  // inside the sweet-spot release window, fades elsewhere.
  const p = game.player;
  let telegraphIdx = -1, telegraphAmt = 0;
  if (game.mode === "playing" && p.state === "swing" && p.omega > SWEET_OMEGA_MIN) {
    telegraphIdx = p.ringIdx + 1;
    const center = (SWEET_THETA_LO + SWEET_THETA_HI) / 2;
    const half = (SWEET_THETA_HI - SWEET_THETA_LO) / 2;
    const t = p.theta;
    const inside = 1 - clamp(Math.abs(t - center) / half, 0, 1);
    // Square the falloff so the beacon really pops at the center.
    telegraphAmt = inside * inside;
  }

  // Rings
  for (const r of game.rings) {
    if (r.x < game.cameraX - 80 || r.x > game.cameraX + GAME_W + 80) continue;
    const isAttached = p.state === "swing" && p.ringIdx === r.idx;
    const theta = isAttached ? p.theta : 0;
    const tg = (r.idx === telegraphIdx) ? telegraphAmt : 0;
    drawRing(ctx, r, theta, isAttached, frame, tg);
  }

  // Trajectory preview (drawn after rings so it sits over the chain art).
  if (game.mode === "playing") drawTrajectoryPreview(ctx, p, frame, game.rings, game.slides);

  // Particles
  drawParticles(ctx, game.particles);

  // Player
  ctx.save();
  if (p.state === "platform") {
    const slide = game.slides.find(s => s.idx === p.slideIdx);
    if (slide) {
      ctx.translate(slide.x, slide.top);
      drawPlayerStanding(ctx, character, frame);
    }
  } else {
    ctx.translate(p.x, p.y);
    if (p.state === "swing") ctx.rotate(p.theta);
    else ctx.rotate(p.bodyRot);
    drawPlayerAtPivot(ctx, character, frame, p.state === "swing", p.kickFlash);
  }
  ctx.restore();

  // Score popups float in world-space so they trail off behind the camera.
  drawPopups(ctx, game.popups, game.cameraX);

  ctx.restore();

  // Brief warm flash on big events.
  if (game.flashFrames > 0) {
    ctx.save();
    ctx.globalAlpha = (game.flashFrames / 6) * 0.18;
    ctx.fillStyle = "#fff7d6";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.restore();
  }

  // HUD overlay (screen-space)
  drawHUD(ctx, game, frame);
  drawCallout(ctx, game.callout, frame);

  if (game.mode === "title") drawTitle(ctx, game, frame, character);
  else if (game.mode === "gameover") drawGameOver(ctx, game, frame);
}

function drawHUD(ctx, game, frame) {
  const score = Math.floor(game.score);
  const best = Math.max(game.best, score);
  const mult = comboMult(game.combo);
  ctx.save();
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(58,35,71,0.85)";
  drawText(ctx, `RINGS  ${String(game.bestRing).padStart(3, "0")}`, 18, 30, 18, "#fff4d6");
  drawText(ctx, `SCORE  ${score}`, 18, 54, 16, "#ffd9b3");
  drawText(ctx, `BEST   ${best}`, 18, 74, 14, "#e6c8aa");
  ctx.shadowBlur = 0;

  // Combo readout — pulses bigger when active. Empty combo is dim.
  if (game.combo > 0) {
    const pulse = 1 + 0.06 * Math.sin(frame * 0.3);
    const color = mult >= 2.5 ? "#ff8c66" : mult >= 2 ? "#ffae5a" : mult >= 1.5 ? "#ffd76b" : "#fff1d4";
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.translate(GAME_W / 2, 32);
    ctx.scale(pulse, pulse);
    drawText(ctx, `COMBO  ${game.combo}   x${mult}`, 0, 0, 20, color, "center", 900);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawText(ctx, `COMBO  0`, GAME_W / 2, 32, 16, "#c8a78c", "center", 700);
    ctx.restore();
  }

  drawText(ctx, game.muted ? "[ MUTED  M ]" : "[ M ]", GAME_W - 18, 30, 13, "#fff1d4", "right");
  ctx.restore();
}

function drawTitle(ctx, game, frame, character) {
  ctx.save();
  // Soft dusk dim
  ctx.fillStyle = "rgba(31,25,68,0.45)";
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const cx = GAME_W / 2;
  ctx.shadowBlur = 18;
  ctx.shadowColor = "rgba(58,35,71,0.9)";
  drawText(ctx, "RING SWINGER", cx, 150, 56, "#fff4d6", "center", 900);
  ctx.shadowColor = "rgba(58,35,71,0.7)";
  drawText(ctx, "evening at the playground", cx, 184, 16, "#ffd9b3", "center", 700);
  ctx.shadowBlur = 0;

  const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(frame * 0.12));
  ctx.globalAlpha = pulse;
  drawText(ctx, "PRESS  SPACE  TO  SWING", cx, 270, 22, "#fff7e2", "center", 800);
  ctx.globalAlpha = 1;

  drawText(ctx, "SPACE  release at the bottom of the swing",
    cx, 308, 14, "#fff1d4", "center", 700);
  drawText(ctx, "← →  pump the swing      land on slide-tops, jump again",
    cx, 326, 13, "#e6c8aa", "center", 600);
  drawText(ctx, "1 2 3 4  character        M  mute        ESC  back",
    cx, 346, 12, "#c8a78c", "center", 600);

  for (let i = 0; i < CHARACTERS.length; i++) {
    const px = cx - 180 + i * 120;
    const py = 388;
    if (i === game.selectedCharacter) {
      const grad = ctx.createRadialGradient(px, py + 18, 4, px, py + 18, 60);
      grad.addColorStop(0, "rgba(255,200,140,0.55)");
      grad.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px - 60, py - 30, 120, 100);
    }
    ctx.save();
    ctx.translate(px, py);
    drawPlayerAtPivot(ctx, CHARACTERS[i], frame, true, 0);
    ctx.restore();
    drawText(ctx, CHARACTERS[i].name, px, py + 60, 12,
      i === game.selectedCharacter ? "#fff4d6" : "#a78a72", "center");
  }

  drawText(ctx, `BEST  ${game.best}`, cx, GAME_H - 28, 14, "#e6c8aa", "center");
  ctx.restore();
}

function drawGameOver(ctx, game, frame) {
  ctx.save();
  ctx.fillStyle = "rgba(31,25,68,0.65)";
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  const cx = GAME_W / 2;
  ctx.shadowBlur = 14;
  ctx.shadowColor = "rgba(58,35,71,0.9)";
  drawText(ctx, "WIPEOUT", cx, 200, 64, "#fff4d6", "center", 900);
  ctx.shadowBlur = 0;
  drawText(ctx, `Rings  ${game.bestRing}    Best Combo  ${game.bestCombo}`,
    cx, 248, 20, "#ffd9b3", "center", 700);
  drawText(ctx, `Score  ${Math.floor(game.score)}    Best  ${game.best}`,
    cx, 278, 18, "#e6c8aa", "center", 700);
  const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(frame * 0.12));
  ctx.globalAlpha = pulse;
  drawText(ctx, "SPACE  to  swing  again", cx, 340, 22, "#fff7e2", "center", 800);
  ctx.globalAlpha = 1;
  drawText(ctx, "ESC  back to arcade", cx, 372, 14, "#c8a78c", "center", 600);
  ctx.restore();
}

// --- Component -------------------------------------------------------------

export default function RingSwinger({ onBack }) {
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
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        e.preventDefault();
      }
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
        const prev = g.selectedCharacter;
        let changed = false;
        if (leftPressed) { g.selectedCharacter = (g.selectedCharacter - 1 + CHARACTERS.length) % CHARACTERS.length; changed = true; }
        if (rightPressed) { g.selectedCharacter = (g.selectedCharacter + 1) % CHARACTERS.length; changed = true; }
        if (onePressed) { g.selectedCharacter = 0; changed = true; }
        if (twoPressed) { g.selectedCharacter = Math.min(1, CHARACTERS.length - 1); changed = true; }
        if (threePressed) { g.selectedCharacter = Math.min(2, CHARACTERS.length - 1); changed = true; }
        if (fourPressed) { g.selectedCharacter = Math.min(3, CHARACTERS.length - 1); changed = true; }
        if (changed && g.selectedCharacter !== prev) {
          sfxMenuMove();
          saveCharacterIndex(g.selectedCharacter);
        }
      }

      if ((g.mode === "title" || g.mode === "gameover") && jumpPressed) {
        startRun();
      }

      if (g.mode === "playing") {
        const p = g.player;

        if (p.kickFlash > 0) p.kickFlash--;
        if (p.releaseLockout > 0) p.releaseLockout--;

        if (p.state === "swing") {
          const ring = g.rings.find(r => r.idx === p.ringIdx);
          if (!ring) {
            // safety: ring vanished, drop player into air
            p.state = "air";
          } else {
            // Optional gentle pump — holding direction nudges the swing that
            // way. No sign-matching; alternating L/R timed with motion still
            // builds amplitude, but holding one direction also works (just
            // biases the equilibrium). Skill-optional, not skill-required.
            const dir = (leftDown ? -1 : 0) + (rightDown ? 1 : 0);
            if (dir !== 0) {
              p.omega += dir * PUMP_ACCEL;
            }
            // Pendulum integration (semi-implicit Euler)
            p.omega += -PEND_GRAVITY * Math.sin(p.theta);
            p.omega *= SWING_DAMP;
            p.theta += p.omega;
            // Soft cap on amplitude
            if (p.theta > MAX_THETA) { p.theta = MAX_THETA; if (p.omega > 0) p.omega *= -0.25; }
            if (p.theta < -MAX_THETA) { p.theta = -MAX_THETA; if (p.omega < 0) p.omega *= -0.25; }
            // Place hand
            p.x = ring.x + ring.chainLen * Math.sin(p.theta);
            p.y = TOP_BAR_Y + ring.chainLen * Math.cos(p.theta);
            // Tangent velocity (used for release)
            p.vx = p.omega * ring.chainLen * Math.cos(p.theta);
            p.vy = -p.omega * ring.chainLen * Math.sin(p.theta);

            // Big-swing fanfare when crossing peak amplitude
            if (Math.abs(p.theta) > 1.15 && Math.abs(p.omega) < 0.012 && p.kickFlash === 0) {
              p.kickFlash = 18;
              sfxBigSwing();
              emitParticles(g.particles, p.x, p.y, 6, {
                angleMin: -Math.PI, angleMax: 0,
                speedMin: 0.6, speedMax: 1.8,
                life: 30, colors: ["#fff4d6", "#ffd29a", "#ffae5a"],
                size: 2.0, gravity: 0.04, shrink: true,
              });
            }

            // Release on jump press. Gate only on actual launch speed so the
            // very first frames (omega still tiny) don't dump the player.
            if (jumpPressed) {
              const speed = Math.hypot(p.vx, p.vy);
              if (speed >= MIN_RELEASE_SPEED) {
                // Sweet-spot bonus: releasing while swinging forward through
                // the bottom of the arc gives a satisfying velocity kick.
                const inSweet =
                  p.theta > SWEET_THETA_LO &&
                  p.theta < SWEET_THETA_HI &&
                  p.omega > SWEET_OMEGA_MIN;
                const boost = inSweet ? SWEET_BOOST : OK_BOOST;
                p.vx *= boost;
                p.vy *= boost;

                p.state = "air";
                p.lastReleasedIdx = p.ringIdx;
                p.ringIdx = -1;
                p.releaseLockout = RELEASE_LOCKOUT;
                p.bodyRot = p.theta;
                p.bodyRotRate = clamp(p.omega * 1.4, -0.30, 0.30);

                if (inSweet) {
                  sfxBigSwing();
                  p.kickFlash = 18;
                  // Sweet release counts as its own skill move — bumps combo
                  // and pops a callout independent of the upcoming catch.
                  g.combo++;
                  if (g.combo > g.bestCombo) g.bestCombo = g.combo;
                  addPopup(g, p.x, p.y - 16, "GOLDEN!", "#fff2c8");
                  setCallout(g, "GOLDEN!", "#fff2c8");
                  // Twin burst: a forward fan of warm sparks plus a small
                  // upward puff for an extra moment of lift.
                  emitParticles(g.particles, p.x, p.y, 22, {
                    angleMin: -Math.PI * 0.95, angleMax: -0.05,
                    speedMin: 1.6, speedMax: 5.2,
                    life: 34, colors: ["#fff7d6", "#ffd29a", "#ffae5a", "#ff8c66"],
                    size: 2.8, gravity: 0.03, shrink: true,
                  });
                  emitParticles(g.particles, p.x, p.y - 6, 8, {
                    angleMin: -Math.PI, angleMax: 0,
                    speedMin: 0.4, speedMax: 1.4,
                    life: 26, colors: ["#fff7d6", "#fff1d4"],
                    size: 2.2, gravity: -0.01, shrink: true,
                  });
                } else {
                  sfxRelease();
                  emitParticles(g.particles, p.x, p.y, 12, {
                    angleMin: -Math.PI, angleMax: 0,
                    speedMin: 1.0, speedMax: 3.5,
                    life: 26, colors: ["#ffd29a", "#fff1d4", "#c2a4e0"],
                    size: 2.2, gravity: 0.05, shrink: true,
                  });
                }
              }
            }
          }
        } else if (p.state === "platform") {
          // Standing on a slide-top, waiting for SPACE. No idle drift —
          // the kid stands still until you commit a jump direction.
          p.platformIdleFrames++;
          if (jumpPressed) {
            const slide = g.slides.find(s => s.idx === p.slideIdx);
            const dir = leftDown ? -1 : 1; // SPACE alone = forward
            p.state = "air";
            p.vx = dir * SLIDE_JUMP_VX;
            p.vy = SLIDE_JUMP_VY;
            p.bodyRot = 0;
            p.bodyRotRate = dir * 0.18;
            p.releaseLockout = RELEASE_LOCKOUT;
            p.lastReleasedIdx = -1; // any ring is grabbable now
            p.slideIdx = -1;
            p.kickFlash = 12;
            sfxBigSwing();
            if (slide) {
              emitParticles(g.particles, slide.x, slide.top, 14, {
                angleMin: -Math.PI, angleMax: 0,
                speedMin: 1.0, speedMax: 3.2,
                life: 26, colors: ["#fff7d6", "#ffd29a", "#a86b4a"],
                size: 2.2, gravity: 0.04, shrink: true,
              });
            }
          }
        } else {
          // Air physics — no mid-air steering. The release commits you.
          p.vy = clamp(p.vy + GRAVITY, -20, MAX_FALL_VY);
          p.vx *= AIR_DRAG;
          p.x += p.vx;
          p.y += p.vy;
          p.bodyRot += p.bodyRotRate;
          p.bodyRotRate *= 0.992;

          // Platform landing — only while falling, only when crossing the
          // platform top from above this frame. lastReleasedIdx clears on
          // landing so you can re-grab the same ring you just left.
          if (p.releaseLockout <= 0 && p.vy > 0) {
            for (const slide of g.slides) {
              if (Math.abs(p.x - slide.x) > SLIDE_LAND_HALF_W) continue;
              const prevY = p.y - p.vy;
              if (prevY < slide.top && p.y >= slide.top - 1) {
                p.state = "platform";
                p.slideIdx = slide.idx;
                p.x = slide.x;
                p.y = slide.top;
                p.vx = 0;
                p.vy = 0;
                p.bodyRot = 0;
                p.bodyRotRate = 0;
                p.platformIdleFrames = 0;
                p.kickFlash = 8;
                sfxGrab();
                g.combo++;
                if (g.combo > g.bestCombo) g.bestCombo = g.combo;
                const mult = comboMult(g.combo);
                const base = slide.required ? 75 : 40;
                const gained = Math.round(base * mult);
                g.score += gained;
                const txt = slide.required ? "PERCH!" : "STEP!";
                addPopup(g, slide.x, slide.top - 14,
                  mult > 1 ? `${txt}  +${gained}  x${mult}` : `${txt}  +${gained}`,
                  slide.required ? "#ffd76b" : "#fff7d6");
                if (slide.required) setCallout(g, "PERCH!", "#ffd76b");
                emitParticles(g.particles, slide.x, slide.top, 14, {
                  angleMin: -Math.PI, angleMax: 0,
                  speedMin: 0.8, speedMax: 2.6,
                  life: 24, colors: ["#fff1d4", "#ffd9b3", "#d4a070"],
                  size: 2.0, gravity: 0.04, shrink: true,
                });
                break;
              }
            }
          }
          // If we just landed on a slide, skip ring-grab/fall checks for
          // this frame so the platform takes precedence.
          if (p.state !== "platform") {

          // Soft motion trail — a faint warm streak so the float reads as
          // motion. Only while moving fast enough to feel airborne.
          if (frame % 2 === 0 && Math.hypot(p.vx, p.vy) > 3) {
            emitParticles(g.particles, p.x - p.vx * 0.4, p.y - p.vy * 0.4, 1, {
              angleMin: 0, angleMax: 0,
              speedMin: 0, speedMax: 0,
              life: 16, colors: ["#fff1d4", "#ffd9b3"],
              size: 1.8, gravity: 0, shrink: true,
            });
          }

          // Try to grab a ring
          if (p.releaseLockout <= 0) {
            const wantsGrab = jumpDown; // holding/repressing space helps
            const r = wantsGrab ? FORGIVE_GRAB_R : GRAB_R;
            let bestIdx = -1, bestDist = Infinity;
            for (const ring of g.rings) {
              if (ring.idx === p.lastReleasedIdx) continue;
              const rest = ringRestPos(ring);
              const dx = p.x - rest.x;
              const dy = p.y - rest.y;
              const d = Math.hypot(dx, dy);
              if (d < r && d < bestDist) {
                bestDist = d; bestIdx = ring.idx;
              }
            }
            if (bestIdx >= 0) {
              const ring = g.rings.find(rr => rr.idx === bestIdx);
              // Snap to ring with preserved tangential velocity
              const dx = p.x - ring.x;
              const dy = p.y - TOP_BAR_Y;
              // Theta from ring top: theta = atan2(dx, dy)
              const safeDy = Math.max(0.5, dy);
              const theta = Math.atan2(dx, safeDy);
              // Tangent unit vector at this theta: (cos θ, -sin θ)
              const tvx = Math.cos(theta);
              const tvy = -Math.sin(theta);
              const tangentSpeed = p.vx * tvx + p.vy * tvy;
              const omega = tangentSpeed / ring.chainLen;
              p.state = "swing";
              p.ringIdx = bestIdx;
              p.theta = clamp(theta, -MAX_THETA, MAX_THETA);
              p.omega = clamp(omega, -0.18, 0.18);
              p.bodyRot = 0;
              p.bodyRotRate = 0;
              // Snap position
              p.x = ring.x + ring.chainLen * Math.sin(p.theta);
              p.y = TOP_BAR_Y + ring.chainLen * Math.cos(p.theta);
              sfxGrab();
              if (bestIdx > g.bestRing) g.bestRing = bestIdx;
              g.combo++;
              if (g.combo > g.bestCombo) g.bestCombo = g.combo;
              const mult = comboMult(g.combo);
              const gained = Math.round(50 * mult);
              g.score += gained;
              const popupTxt = mult > 1 ? `+${gained}  x${mult}` : `+${gained}`;
              addPopup(g, p.x, p.y - 18, popupTxt, ring.color.glow);
              // Combo milestones — escalating callouts every 3.
              if (g.combo === 3) setCallout(g, "x1.5  COMBO", "#fff7d6");
              else if (g.combo === 6) setCallout(g, "x2  COMBO", "#fff2c8");
              else if (g.combo === 9) setCallout(g, "x2.5  COMBO!", "#ffd76b");
              else if (g.combo === 12) setCallout(g, "x3  ON  FIRE!", "#ffae5a");
              else if (g.combo > 12 && g.combo % 6 === 0) {
                setCallout(g, `x${mult}  RIDICULOUS!`, "#ff8c66");
              }
              p.kickFlash = 8;
              emitParticles(g.particles, p.x, p.y, 16, {
                angleMin: 0, angleMax: Math.PI * 2,
                speedMin: 1.0, speedMax: 3.4,
                life: 24, colors: [ring.color.core, ring.color.glow, "#fff7d6"],
                size: 2.0, gravity: -0.03, shrink: true,
              });
              emitParticles(g.particles, p.x, p.y - 4, 5, {
                angleMin: -Math.PI * 0.8, angleMax: -Math.PI * 0.2,
                speedMin: 0.4, speedMax: 1.2,
                life: 22, colors: ["#fff1d4", "#ffd9b3"],
                size: 1.6, gravity: -0.02, shrink: true,
              });
            }
          }

          // Fall fail
          if (p.y > GROUND_Y - 10) {
            p.y = GROUND_Y - 10;
            sfxFall();
            g.mode = "gameover";
            g.combo = 0;
            const scored = Math.floor(g.score);
            if (scored > g.best) { g.best = scored; saveBest(scored); }
            emitParticles(g.particles, p.x, GROUND_Y, 18, {
              angleMin: -Math.PI, angleMax: 0,
              speedMin: 1.5, speedMax: 4,
              life: 30, colors: ["#e9b07a", "#ffd9b3", "#a86b4a"],
              size: 2.4, gravity: 0.12, shrink: true,
            });
            force(n => n + 1);
          }
          } // end if (p.state !== "platform")
        }

        // Score is now event-based (per catch / sweet release / slide land)
        // and accumulates with the combo multiplier above.

        // Camera anchors to the current ring while swinging or to the slide
        // while standing, so the world holds steady; tracks the player while
        // airborne. Smoothing kept gentle to avoid pans.
        let camAnchor = p.x;
        if (p.state === "swing") {
          const ring = g.rings.find(r => r.idx === p.ringIdx);
          if (ring) camAnchor = ring.x;
        } else if (p.state === "platform") {
          const slide = g.slides.find(s => s.idx === p.slideIdx);
          if (slide) camAnchor = slide.x;
        }
        const targetCam = camAnchor - PLAYER_OFFSET_X;
        g.cameraX += (targetCam - g.cameraX) * 0.09;

        // Recycle rings + spawn new. Don't recycle a ring the player is on.
        while (
          g.rings.length > 2 &&
          g.rings[1].x < g.cameraX - 200 &&
          g.rings[0].idx !== p.ringIdx
        ) {
          g.rings.shift();
        }
        while (g.rings[g.rings.length - 1].x < g.cameraX + GAME_W + 700) {
          appendNextSegment(g.rings, g.slides);
        }
        // Recycle slides off the left edge (but never the one we're on).
        while (
          g.slides.length > 0 &&
          g.slides[0].x < g.cameraX - 250 &&
          g.slides[0].idx !== p.slideIdx
        ) {
          g.slides.shift();
        }
      }

      updateParticles(g.particles);
      updatePopups(g.popups);
      updateCallout(g);
      drawScene(ctx, g, frame);
      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="min-h-screen w-full text-white flex flex-col items-center justify-center p-4 gap-4"
         style={{ background: "linear-gradient(180deg, #1f1944 0%, #5d3f7a 45%, #d27a78 80%, #ffd29a 100%)" }}>
      <div className="max-w-[960px] w-full flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight"
              style={{ color: "#fff4d6", textShadow: "0 0 22px #3a234799" }}>
            Ring Swinger
          </h1>
          <p style={{ color: "#fff1d4" }}>Pump the swing, time the release, catch the next ring — or land on a slide-top and jump from there.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BackButton onBack={onBack} />
          <div className="hidden md:block text-right text-sm" style={{ color: "#ffd9b3" }}>
            SPACE release/jump • ← → pump
          </div>
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
      <TouchControls keysRef={keys} jumpKey=" " onPress={primeAudio} />
      <div className="max-w-[960px] w-full rounded-2xl border p-4 text-sm"
           style={{ background: "#3a234766", borderColor: "#ffd29a55", color: "#fff1d4" }}>
        <b style={{ color: "#fff4d6" }}>How to play:</b> The dotted arc shows where you'll
        land — a <b style={{ color: "#ffd76b" }}>glowing target</b> marks the next ring or slide,
        a <b style={{ color: "#ff8c66" }}>red X</b> means you'll fall. Pump with <b>← →</b>, release
        with <b>SPACE</b> — there's no mid-air steering, your release commits you. Sweet-spot
        releases, ring catches, and slide landings all build a <b style={{ color: "#ffd76b" }}>combo</b>
        that multiplies your score. Stand on a slide-top, hold a direction, hit <b>SPACE</b> again
        to jump. Don't fall.
      </div>
    </div>
  );
}
