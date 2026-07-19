import React, { useEffect, useRef } from "react";
import {
  isMuted, primeAudio, toggleMute,
  sfxCrystal, sfxBomb, sfxShoot, sfxZap, sfxSpawn, sfxDeath, sfxGate,
  sfxWave, sfxWin, sfxMenuMove,
} from "./audioCrystal";
import { BackButton } from "./TouchControls.jsx";

// Crystal Quest — a neon-vector arcade flyer. Sweep your ship around a walled
// arena, hoover up every glowing crystal, then dive through the gate that
// opens to warp to the next, meaner wave. Mines, drifters and homing nasties
// want a piece of you; a smart bomb clears the screen when things get hairy.
// Momentum-based flight, three ships, and a score that climbs with your combo.

const GAME_W = 960;
const GAME_H = 600;
const WALL = 26;                 // inset of the play field from the canvas edge
const ARENA = { x0: WALL, y0: WALL, x1: GAME_W - WALL, y1: GAME_H - WALL };

const START_LIVES = 3;
const START_BOMBS = 3;
const MAX_WAVE = 20;             // clear this wave to win the whole run

const SHIP_R = 11;
// Flight model — authentic Crystal Quest inertia. The ship is a mass drifting
// in near-frictionless space. Moving the mouse (via Pointer Lock, our trackball
// stand-in) IMPARTS ACCELERATION in that direction; it never sets position. The
// ship keeps its momentum and coasts, so you fight your own drift to turn. Aim
// is COUPLED to travel: the hull faces its velocity and shots fly straight
// ahead, so you must fly toward something to hit it.
const MOUSE_SENS = 0.055;        // acceleration per game-pixel of mouse motion
const KEY_THRUST = 0.42;         // fallback thrust for arrow keys / touch d-pad
const FRICTION = 0.99;           // barely any drag — long, floaty coasting
const MAX_SPEED = 8;
const TURN_RATE = 0.4;           // how quickly the hull swings to face its drift
const RESPAWN_INVULN = 110;      // frames of blinking safety after respawn
const SHOT_SPEED = 9;
const SHOT_COOLDOWN = 9;

const BEST_KEY = "crystal-quest-best";

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

// Ease one angle toward another along the shortest arc (handles wraparound), so
// the ship rotates smoothly toward its heading instead of snapping.
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function loadBest() {
  try {
    const v = parseInt(localStorage.getItem(BEST_KEY), 10);
    if (Number.isInteger(v) && v >= 0) return v;
  } catch {}
  return 0;
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(Math.floor(v))); } catch {}
}

// --- Ships -----------------------------------------------------------------

const SHIPS = [
  { name: "Comet", color: "#5cf0ff", glow: "#1fb0d6" },
  { name: "Nova", color: "#ff7be5", glow: "#c93ea6" },
  { name: "Vireo", color: "#a7ff5c", glow: "#5fbf2e" },
];

// --- Particles (shared little pool, same shape as the other games) ---------

function makeParticlePool(size = 220) {
  const pool = [];
  for (let i = 0; i < size; i++) pool.push({ active: false });
  return pool;
}
function emit(pool, x, y, count, opts) {
  let done = 0;
  for (let i = 0; i < pool.length && done < count; i++) {
    const p = pool[i];
    if (p.active) continue;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * (opts.spread || 0);
    p.y = y + (Math.random() - 0.5) * (opts.spread || 0);
    const a = opts.angleMin + Math.random() * (opts.angleMax - opts.angleMin);
    const sp = opts.speedMin + Math.random() * (opts.speedMax - opts.speedMin);
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
    p.life = p.maxLife = opts.life || 30;
    p.color = Array.isArray(opts.colors)
      ? opts.colors[(Math.random() * opts.colors.length) | 0]
      : (opts.color || "#fff");
    p.size = opts.size || 2;
    p.drag = opts.drag ?? 0.96;
    p.shrink = opts.shrink ? 1 : 0;
    done++;
  }
}
function updateParticles(pool) {
  for (const p of pool) {
    if (!p.active) continue;
    p.x += p.vx; p.y += p.vy;
    p.vx *= p.drag; p.vy *= p.drag;
    p.life--;
    if (p.life <= 0) p.active = false;
  }
}
function drawParticles(ctx, pool) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of pool) {
    if (!p.active) continue;
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const size = p.shrink ? Math.max(0.4, p.size * alpha) : p.size;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Floating "+N" score chips.
function addPopup(g, x, y, text, color) {
  if (g.popups.length > 24) g.popups.shift();
  g.popups.push({ x, y, text, color, vy: -1.1, life: 46, maxLife: 46 });
}
function updatePopups(popups) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy; p.vy *= 0.95; p.life--;
    if (p.life <= 0) popups.splice(i, 1);
  }
}
function drawPopups(ctx, popups) {
  for (const p of popups) {
    const a = Math.min(1, p.life / 20);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "800 18px ui-monospace, 'SFMono-Regular', Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }
}

// --- World generation ------------------------------------------------------

// How many crystals to lay out this wave.
function crystalCount(wave) { return clamp(8 + wave * 2, 8, 46); }

// Scatter crystals across the arena, keeping them off the walls and away from
// the ship's central spawn point. Uses simple rejection sampling for spacing.
function makeCrystals(wave) {
  const n = crystalCount(wave);
  const pad = 46;
  const cx = GAME_W / 2, cy = GAME_H / 2;
  const out = [];
  let guard = 0;
  while (out.length < n && guard < n * 60) {
    guard++;
    const x = rand(ARENA.x0 + pad, ARENA.x1 - pad);
    const y = rand(ARENA.y0 + pad, ARENA.y1 - pad);
    if (dist2(x, y, cx, cy) < 90 * 90) continue;             // keep spawn clear
    if (out.some((c) => dist2(x, y, c.x, c.y) < 40 * 40)) continue;
    out.push({ x, y, phase: rand(0, Math.PI * 2), got: false, pop: 0 });
  }
  return out;
}

// Enemy archetypes. `budget` grows with the wave and gates how many/what kind
// of nasties can be on screen at once.
function enemyBudget(wave) { return clamp(3 + Math.floor(wave * 1.4), 3, 26); }

function pickEnemyKind(wave) {
  const r = Math.random();
  if (wave <= 1) return "mine";
  if (wave <= 3) return r < 0.6 ? "mine" : "drifter";
  if (wave <= 6) return r < 0.4 ? "mine" : r < 0.75 ? "drifter" : "homer";
  return r < 0.3 ? "mine" : r < 0.62 ? "drifter" : r < 0.85 ? "homer" : "weaver";
}

// Spawn a single enemy of `kind` at the edge of the arena with a little warp-in
// timer so it never materialises on top of the player.
function spawnEnemy(kind, wave) {
  const spd = 0.6 + wave * 0.12;
  const edge = Math.random() * 4 | 0;
  let x, y;
  if (edge === 0) { x = rand(ARENA.x0 + 20, ARENA.x1 - 20); y = ARENA.y0 + 24; }
  else if (edge === 1) { x = ARENA.x1 - 24; y = rand(ARENA.y0 + 20, ARENA.y1 - 20); }
  else if (edge === 2) { x = rand(ARENA.x0 + 20, ARENA.x1 - 20); y = ARENA.y1 - 24; }
  else { x = ARENA.x0 + 24; y = rand(ARENA.y0 + 20, ARENA.y1 - 20); }

  const e = {
    kind, x, y,
    vx: 0, vy: 0,
    r: kind === "mine" ? 13 : 12,
    phase: rand(0, Math.PI * 2),
    spin: rand(0, Math.PI * 2),
    warp: 46,                       // counts down; harmless & translucent until 0
    hp: kind === "mine" ? 1 : 1,
    color:
      kind === "mine" ? "#ff5470" :
      kind === "drifter" ? "#ffd23f" :
      kind === "homer" ? "#c07bff" : "#4ce0b3",
    seed: rand(0, 1000),
  };
  if (kind === "drifter" || kind === "weaver") {
    const a = rand(0, Math.PI * 2);
    e.vx = Math.cos(a) * spd * 1.8;
    e.vy = Math.sin(a) * spd * 1.8;
  }
  e.speed = spd;
  return e;
}

function makeStars(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({ x: rand(0, GAME_W), y: rand(0, GAME_H), r: rand(0.4, 1.6), tw: rand(0, Math.PI * 2) });
  }
  return arr;
}

// --- Game state ------------------------------------------------------------

function makeShip() {
  return {
    x: GAME_W / 2, y: GAME_H / 2, vx: 0, vy: 0,
    angle: -Math.PI / 2, invuln: RESPAWN_INVULN, shotCd: 0,
  };
}

function makeGame(mode = "title", shipIndex = 0) {
  return {
    mode,                         // title | playing | dying | wavecomplete | gameover | win
    shipIndex,
    ship: makeShip(),
    crystals: mode === "playing" ? makeCrystals(1) : [],
    enemies: [],
    shots: [],
    stars: makeStars(90),
    particles: makeParticlePool(),
    popups: [],
    wave: 1,
    score: 0,
    lives: START_LIVES,
    bombs: START_BOMBS,
    combo: 0,
    best: loadBest(),
    spawnTimer: 90,
    gateOpen: false,
    gatePulse: 0,
    stateTimer: 0,                // generic per-mode countdown
    shake: 0,
    flash: 0,
    bannerLife: 0,
    muted: isMuted(),
    prevBomb: false,
    prevShoot: false,
    prevMute: false,
    prevLeftSel: false,
    prevRightSel: false,
  };
}

// The gate lives on the right wall; this is its vertical span.
const GATE_Y0 = GAME_H / 2 - 46;
const GATE_Y1 = GAME_H / 2 + 46;

// --- Drawing ---------------------------------------------------------------

function drawBackground(ctx, g, frame) {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Twinkling starfield.
  for (const s of g.stars) {
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(frame * 0.05 + s.tw));
    ctx.globalAlpha = tw;
    ctx.fillStyle = "#8fa6d8";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Faint grid inside the arena for that vector-arcade depth.
  ctx.save();
  ctx.strokeStyle = "rgba(70,110,190,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ARENA.x0; x <= ARENA.x1; x += 48) { ctx.moveTo(x, ARENA.y0); ctx.lineTo(x, ARENA.y1); }
  for (let y = ARENA.y0; y <= ARENA.y1; y += 48) { ctx.moveTo(ARENA.x0, y); ctx.lineTo(ARENA.x1, y); }
  ctx.stroke();
  ctx.restore();
}

function drawWalls(ctx, g, frame) {
  const hue = (frame * 0.6) % 360;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `hsl(${hue}, 90%, 62%)`;
  ctx.shadowColor = `hsl(${hue}, 90%, 62%)`;
  ctx.shadowBlur = 14;

  // Draw the border in four segments so we can leave a gap for the gate on
  // the right wall.
  ctx.beginPath();
  // top
  ctx.moveTo(ARENA.x0, ARENA.y0); ctx.lineTo(ARENA.x1, ARENA.y0);
  // right (above gate)
  ctx.moveTo(ARENA.x1, ARENA.y0); ctx.lineTo(ARENA.x1, GATE_Y0);
  // right (below gate)
  ctx.moveTo(ARENA.x1, GATE_Y1); ctx.lineTo(ARENA.x1, ARENA.y1);
  // bottom
  ctx.moveTo(ARENA.x1, ARENA.y1); ctx.lineTo(ARENA.x0, ARENA.y1);
  // left
  ctx.moveTo(ARENA.x0, ARENA.y1); ctx.lineTo(ARENA.x0, ARENA.y0);
  ctx.stroke();
  ctx.restore();

  // The gate itself — two flashing posts and, once open, a shimmering portal.
  const open = g.gateOpen;
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.18);
  ctx.save();
  const gateCol = open ? "#5cff9e" : "#ff5470";
  ctx.strokeStyle = gateCol;
  ctx.fillStyle = gateCol;
  ctx.shadowColor = gateCol;
  ctx.shadowBlur = open ? 20 : 10;
  // posts
  for (const yy of [GATE_Y0, GATE_Y1]) {
    ctx.beginPath();
    ctx.moveTo(ARENA.x1 - 10, yy); ctx.lineTo(ARENA.x1 + 8, yy);
    ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.arc(ARENA.x1, yy, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (open) {
    // Portal shimmer filling the gap, plus an arrow beckoning you out.
    ctx.globalAlpha = 0.20 + 0.20 * pulse;
    ctx.fillRect(ARENA.x1 - 4, GATE_Y0, 12, GATE_Y1 - GATE_Y0);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const ax = ARENA.x1 - 16 + pulse * 4;
    ctx.moveTo(ax, GAME_H / 2 - 10);
    ctx.lineTo(ax + 14, GAME_H / 2);
    ctx.lineTo(ax, GAME_H / 2 + 10);
    ctx.closePath();
    ctx.fill();
  } else {
    // Closed bars.
    ctx.globalAlpha = 0.5 + 0.3 * pulse;
    ctx.lineWidth = 2;
    for (let yy = GATE_Y0 + 8; yy < GATE_Y1; yy += 12) {
      ctx.beginPath(); ctx.moveTo(ARENA.x1 - 3, yy); ctx.lineTo(ARENA.x1 + 3, yy); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCrystal(ctx, c, frame) {
  const hue = (frame * 2 + c.phase * 60) % 360;
  const pulse = 1 + Math.sin(frame * 0.12 + c.phase) * 0.12 + c.pop * 0.5;
  const s = 9 * pulse;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(frame * 0.02 + c.phase);
  ctx.shadowColor = `hsl(${hue}, 95%, 65%)`;
  ctx.shadowBlur = 12;
  // Diamond body
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.4);
  ctx.lineTo(s, 0);
  ctx.lineTo(0, s * 1.4);
  ctx.lineTo(-s, 0);
  ctx.closePath();
  ctx.fillStyle = `hsl(${hue}, 90%, 62%)`;
  ctx.fill();
  // Facet highlight
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.4);
  ctx.lineTo(s, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = `hsl(${hue}, 90%, 82%)`;
  ctx.fill();
  ctx.restore();
}

function drawShip(ctx, ship, ship_def, frame, thrusting) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Blink while invulnerable.
  if (ship.invuln > 0 && Math.floor(frame / 4) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  // Engine flame
  if (thrusting) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flick = 10 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(-SHIP_R, -4);
    ctx.lineTo(-SHIP_R - flick, 0);
    ctx.lineTo(-SHIP_R, 4);
    ctx.closePath();
    ctx.fillStyle = "#ffdd66";
    ctx.shadowColor = "#ff9d3f";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
  }

  // Hull — a sharp neon dart.
  ctx.beginPath();
  ctx.moveTo(SHIP_R + 4, 0);
  ctx.lineTo(-SHIP_R, -SHIP_R * 0.85);
  ctx.lineTo(-SHIP_R * 0.4, 0);
  ctx.lineTo(-SHIP_R, SHIP_R * 0.85);
  ctx.closePath();
  ctx.fillStyle = ship_def.color;
  ctx.shadowColor = ship_def.color;
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha *= 0.8;
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(ctx, e, frame) {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.warp > 0) ctx.globalAlpha = 0.3 + 0.7 * (1 - e.warp / 46);
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = e.color;
  ctx.fillStyle = e.color;
  ctx.lineWidth = 2;

  if (e.kind === "mine") {
    // Pulsing spiky mine.
    const pulse = 1 + Math.sin(frame * 0.15 + e.phase) * 0.16;
    const r = e.r * pulse;
    for (let i = 0; i < 8; i++) {
      const a = e.spin + (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
      ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === "drifter") {
    // Spinning square with an inner diamond.
    ctx.rotate(e.spin + frame * 0.04);
    ctx.strokeRect(-e.r, -e.r, e.r * 2, e.r * 2);
    ctx.beginPath();
    ctx.moveTo(0, -e.r * 0.6); ctx.lineTo(e.r * 0.6, 0);
    ctx.lineTo(0, e.r * 0.6); ctx.lineTo(-e.r * 0.6, 0); ctx.closePath();
    ctx.fill();
  } else if (e.kind === "homer") {
    // Menacing triangle that points at the player (already rotated by update).
    ctx.rotate(e.spin);
    ctx.beginPath();
    ctx.moveTo(e.r * 1.2, 0);
    ctx.lineTo(-e.r, -e.r);
    ctx.lineTo(-e.r * 0.5, 0);
    ctx.lineTo(-e.r, e.r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.globalAlpha *= 0.7;
    ctx.stroke();
  } else { // weaver
    const pulse = 1 + Math.sin(frame * 0.2 + e.phase) * 0.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + e.spin + frame * 0.03;
      const rr = e.r * (i % 2 === 0 ? 1.3 : 0.7) * pulse;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawShots(ctx, shots) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of shots) {
    ctx.strokeStyle = "#eaffff";
    ctx.shadowColor = "#7bf0ff";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 1.4, s.y - s.vy * 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShipIcon(ctx, x, y, def) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(9, 0); ctx.lineTo(-7, -6); ctx.lineTo(-3, 0); ctx.lineTo(-7, 6);
  ctx.closePath();
  ctx.fillStyle = def.color;
  ctx.shadowColor = def.color; ctx.shadowBlur = 6;
  ctx.fill();
  ctx.restore();
}

function drawHUD(ctx, g) {
  const def = SHIPS[g.shipIndex];
  ctx.save();
  ctx.font = "800 20px ui-monospace, 'SFMono-Regular', Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#eaffff";
  ctx.shadowColor = "#1fb0d6"; ctx.shadowBlur = 6;
  ctx.fillText(`SCORE ${g.score}`, WALL + 6, 20);

  ctx.font = "700 14px ui-monospace, monospace";
  ctx.fillStyle = "#8fd0ff";
  ctx.fillText(`WAVE ${g.wave}/${MAX_WAVE}`, WALL + 6, 40);

  const remain = g.crystals.filter((c) => !c.got).length;
  ctx.fillStyle = remain > 0 ? "#ffd23f" : "#5cff9e";
  ctx.fillText(remain > 0 ? `CRYSTALS ${remain}` : `GATE OPEN →`, WALL + 6, 58);

  // Lives (ship icons)
  ctx.textAlign = "right";
  ctx.fillStyle = "#eaffff";
  ctx.shadowBlur = 0;
  ctx.fillText("SHIPS", GAME_W - WALL - 6, 20);
  for (let i = 0; i < g.lives - 1; i++) {
    drawShipIcon(ctx, GAME_W - WALL - 14 - i * 20, 36, def);
  }

  // Bombs
  ctx.fillStyle = "#ffb14a";
  ctx.font = "700 14px ui-monospace, monospace";
  ctx.fillText(`BOMBS ${"◈".repeat(g.bombs) || "—"}`, GAME_W - WALL - 6, 58);

  // Combo
  if (g.combo > 1) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff7be5";
    ctx.shadowColor = "#ff7be5"; ctx.shadowBlur = 8;
    ctx.font = "800 16px ui-monospace, monospace";
    ctx.fillText(`COMBO x${g.combo}`, GAME_W / 2, 20);
  }

  ctx.restore();
}

function drawCenterText(ctx, lines) {
  ctx.save();
  ctx.textAlign = "center";
  let y = GAME_H / 2 - (lines.length - 1) * 26;
  for (const ln of lines) {
    ctx.font = ln.font;
    ctx.fillStyle = ln.color;
    ctx.shadowColor = ln.glow || ln.color;
    ctx.shadowBlur = ln.glow ? 16 : 0;
    ctx.fillText(ln.text, GAME_W / 2, y);
    y += ln.gap || 40;
  }
  ctx.restore();
}

// --- Touch controls --------------------------------------------------------

// A single hold-to-press button that writes into the shared `keys` ref (same
// mechanism the keyboard uses), so no game logic needs to know about touch.
function Hold({ keysRef, name, label, cls, onPress }) {
  const set = (val) => { if (keysRef.current) keysRef.current[name] = val; };
  return (
    <button
      type="button"
      aria-label={name}
      onPointerDown={(e) => { e.preventDefault(); onPress?.(); set(true); }}
      onPointerUp={(e) => { e.preventDefault(); set(false); }}
      onPointerLeave={(e) => { if (e.buttons) set(false); }}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={cls}
      style={{ touchAction: "none", WebkitTapHighlightColor: "transparent", userSelect: "none" }}
    >
      {label}
    </button>
  );
}

const PAD_BTN = "w-14 h-14 text-2xl bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl select-none active:scale-95 transition-transform flex items-center justify-center text-white";

// Directional pad on the left, fire + bomb on the right. Only shown on small
// screens (the desktop layout hides it with `md:hidden`).
function TouchPad({ keysRef, onPress }) {
  return (
    <div className="max-w-[960px] w-full flex items-center justify-between gap-4 px-2 md:hidden">
      <div className="grid grid-cols-3 grid-rows-2 gap-1.5" style={{ width: 178 }}>
        <div />
        <Hold keysRef={keysRef} name="arrowup" label="▲" cls={PAD_BTN} onPress={onPress} />
        <div />
        <Hold keysRef={keysRef} name="arrowleft" label="◀" cls={PAD_BTN} onPress={onPress} />
        <Hold keysRef={keysRef} name="arrowdown" label="▼" cls={PAD_BTN} onPress={onPress} />
        <Hold keysRef={keysRef} name="arrowright" label="▶" cls={PAD_BTN} onPress={onPress} />
      </div>
      <div className="flex items-center gap-3">
        <Hold keysRef={keysRef} name="b" label="💣" onPress={onPress}
          cls="w-16 h-16 text-2xl bg-amber-500/70 hover:bg-amber-500 border border-amber-300/40 rounded-2xl select-none active:scale-95 transition-transform flex items-center justify-center text-white" />
        <Hold keysRef={keysRef} name=" " label="FIRE" onPress={onPress}
          cls="w-20 h-20 text-lg font-bold bg-cyan-500/70 hover:bg-cyan-500 border border-cyan-300/40 rounded-2xl select-none active:scale-95 transition-transform flex items-center justify-center text-white" />
      </div>
    </div>
  );
}

// --- Component -------------------------------------------------------------

export default function CrystalQuest({ onBack }) {
  const canvasRef = useRef(null);
  const keys = useRef({});
  // Relative mouse input: dx/dy accumulate motion since the last frame (in game
  // units) and get converted to acceleration. `locked` tracks Pointer Lock.
  const mouse = useRef({ dx: 0, dy: 0, firing: false, locked: false, everMouse: false });
  const gameRef = useRef(makeGame("title", 0));
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
        if (g.mode === "title" || g.mode === "gameover" || g.mode === "win") {
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

    // Accumulate raw mouse motion (only meaningful while Pointer Lock is on) and
    // scale it into game units so it feels the same at any display size.
    const onMove = (e) => {
      if (!mouse.current.locked) return;
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width ? GAME_W / rect.width : 1;
      mouse.current.dx += (e.movementX || 0) * scale;
      mouse.current.dy += (e.movementY || 0) * scale;
    };
    const onDown = (e) => {
      e.preventDefault();
      primeAudio();
      if (e.button === 0 || e.pointerType !== "mouse") mouse.current.firing = true;
      // A mouse click grabs Pointer Lock — our trackball. Touch skips this.
      if (e.pointerType === "mouse") {
        mouse.current.everMouse = true;
        if (!mouse.current.locked && canvas.requestPointerLock) {
          try {
            const p = canvas.requestPointerLock();
            if (p && p.catch) p.catch(() => {});   // some browsers return a promise
          } catch { /* pointer lock unavailable — d-pad / keys still work */ }
        }
      }
    };
    const onUp = () => { mouse.current.firing = false; };
    const onLockChange = () => { mouse.current.locked = document.pointerLockElement === canvas; };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("pointerlockchange", onLockChange);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    const startRun = () => {
      const sel = gameRef.current.shipIndex;
      const g = makeGame("playing", sel);
      g.crystals = makeCrystals(1);
      gameRef.current = g;
      sfxWave();
    };

    const loseLife = (g) => {
      const s = g.ship;
      emit(g.particles, s.x, s.y, 40, {
        angleMin: 0, angleMax: Math.PI * 2, speedMin: 1.5, speedMax: 6.5,
        life: 42, colors: [SHIPS[g.shipIndex].color, "#ffffff", "#ff9d3f"],
        size: 3, shrink: true, drag: 0.94,
      });
      g.shake = 22;
      g.flash = 10;
      g.lives -= 1;
      g.combo = 0;
      sfxDeath();
      if (g.lives <= 0) {
        g.mode = "gameover";
        g.stateTimer = 0;
        if (g.score > g.best) { g.best = g.score; saveBest(g.best); }
        if (document.pointerLockElement) document.exitPointerLock?.();
      } else {
        g.mode = "dying";
        g.stateTimer = 55;
      }
    };

    const fireBomb = (g) => {
      // No bomb to spend, or nothing on screen worth spending it on.
      if (g.bombs <= 0) return;
      if (!g.enemies.some((e) => e.warp <= 0)) return;
      g.bombs -= 1;
      g.flash = 16;
      g.shake = 14;
      sfxBomb();
      let cleared = 0;
      for (const e of g.enemies) {
        if (e.warp > 0) continue;
        emit(g.particles, e.x, e.y, 14, {
          angleMin: 0, angleMax: Math.PI * 2, speedMin: 1, speedMax: 4.5,
          life: 30, colors: [e.color, "#ffffff"], size: 2.5, shrink: true,
        });
        cleared++;
      }
      const gain = cleared * 25 * g.wave;
      if (cleared > 0) {
        g.score += gain;
        addPopup(g, g.ship.x, g.ship.y - 20, `+${gain}`, "#ffb14a");
      }
      g.enemies = g.enemies.filter((e) => e.warp > 0);
    };

    const tick = () => {
      frame++;
      const g = gameRef.current;
      const k = keys.current;

      // ---- edge-triggered keys ----
      // Fire = keyboard space OR mouse/touch button held.
      const shootDown = !!(k[" "] || k["space"]) || mouse.current.firing;
      const shootPressed = shootDown && !g.prevShoot;
      g.prevShoot = shootDown;

      const bombDown = !!(k["b"] || k["shift"]);
      const bombPressed = bombDown && !g.prevBomb;
      g.prevBomb = bombDown;

      const muteDown = !!k["m"];
      if (muteDown && !g.prevMute) g.muted = toggleMute();
      g.prevMute = muteDown;

      // ---- title / menu ----
      if (g.mode === "title") {
        const leftDown = !!(k["arrowleft"] || k["a"]);
        const rightDown = !!(k["arrowright"] || k["d"]);
        if (leftDown && !g.prevLeftSel) { g.shipIndex = (g.shipIndex + SHIPS.length - 1) % SHIPS.length; sfxMenuMove(); }
        if (rightDown && !g.prevRightSel) { g.shipIndex = (g.shipIndex + 1) % SHIPS.length; sfxMenuMove(); }
        g.prevLeftSel = leftDown;
        g.prevRightSel = rightDown;
        if (shootPressed) startRun();
      } else if (g.mode === "gameover" || g.mode === "win") {
        g.stateTimer++;
        if (shootPressed && g.stateTimer > 30) {
          gameRef.current = makeGame("title", g.shipIndex);
        }
      } else if (g.mode === "dying") {
        g.stateTimer--;
        if (g.stateTimer <= 0) {
          g.ship = makeShip();
          g.mode = "playing";
        }
      } else if (g.mode === "wavecomplete") {
        g.stateTimer--;
        if (g.stateTimer <= 0) {
          g.wave += 1;
          if (g.wave > MAX_WAVE) {
            g.mode = "win";
            g.stateTimer = 0;
            if (g.score > g.best) { g.best = g.score; saveBest(g.best); }
            if (document.pointerLockElement) document.exitPointerLock?.();
            sfxWin();
          } else {
            g.crystals = makeCrystals(g.wave);
            g.enemies = [];
            g.shots = [];
            g.gateOpen = false;
            g.ship = makeShip();
            g.bombs = Math.min(g.bombs + 1, 6);   // a little bomb refill each wave
            g.spawnTimer = 70;
            g.mode = "playing";
            g.bannerLife = 80;
            sfxWave();
          }
        }
      }

      // ---- active play ----
      if (g.mode === "playing" || g.mode === "dying") {
        const s = g.ship;
        const controllable = g.mode === "playing";

        const m = mouse.current;

        if (controllable) {
          // --- MOVEMENT: mouse motion imparts acceleration (never position). ---
          // The accumulated motion since the last frame is the thrust vector; it
          // adds straight onto the ship's velocity, so momentum is king.
          const mvx = m.dx, mvy = m.dy;
          m.dx = 0; m.dy = 0;
          s.vx += mvx * MOUSE_SENS;
          s.vy += mvy * MOUSE_SENS;
          let accelMag = Math.hypot(mvx, mvy) * MOUSE_SENS;

          // Fallback thrust for touch / no-mouse play (arrow keys or the d-pad).
          let ax = 0, ay = 0;
          if (k["arrowleft"] || k["a"]) ax -= 1;
          if (k["arrowright"] || k["d"]) ax += 1;
          if (k["arrowup"] || k["w"]) ay -= 1;
          if (k["arrowdown"] || k["s"]) ay += 1;
          if (ax !== 0 || ay !== 0) {
            const len = Math.hypot(ax, ay) || 1;
            s.vx += (ax / len) * KEY_THRUST;
            s.vy += (ay / len) * KEY_THRUST;
            accelMag += KEY_THRUST;
          }
          s.thrusting = accelMag > 0.05;

          // Engine sparks trail behind the direction of travel.
          if (s.thrusting && frame % 2 === 0) {
            emit(g.particles, s.x - Math.cos(s.angle) * SHIP_R, s.y - Math.sin(s.angle) * SHIP_R, 1, {
              angleMin: s.angle + Math.PI - 0.4, angleMax: s.angle + Math.PI + 0.4,
              speedMin: 1, speedMax: 2.5, life: 16, colors: ["#ffdd66", "#ff9d3f"], size: 2, shrink: true,
            });
          }

          // --- FIRE: straight ahead along the hull's heading (coupled to travel). ---
          if (s.shotCd > 0) s.shotCd--;
          if (shootDown && s.shotCd <= 0) {
            g.shots.push({
              x: s.x + Math.cos(s.angle) * (SHIP_R + 2),
              y: s.y + Math.sin(s.angle) * (SHIP_R + 2),
              vx: Math.cos(s.angle) * SHOT_SPEED + s.vx * 0.4,
              vy: Math.sin(s.angle) * SHOT_SPEED + s.vy * 0.4,
              life: 48,
            });
            s.shotCd = SHOT_COOLDOWN;
            sfxShoot();
          }

          if (bombPressed) fireBomb(g);
        } else {
          s.thrusting = false;
        }

        // Physics
        s.vx *= FRICTION; s.vy *= FRICTION;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > MAX_SPEED) { s.vx = s.vx / sp * MAX_SPEED; s.vy = s.vy / sp * MAX_SPEED; }
        s.x += s.vx; s.y += s.vy;

        // The hull orients to its direction of travel — aim IS movement.
        if (sp > 0.35) {
          s.angle = lerpAngle(s.angle, Math.atan2(s.vy, s.vx), TURN_RATE);
        }

        // Wall bounce (with gate escape on the right).
        if (s.x - SHIP_R < ARENA.x0) { s.x = ARENA.x0 + SHIP_R; s.vx = Math.abs(s.vx) * 0.5; }
        if (s.y - SHIP_R < ARENA.y0) { s.y = ARENA.y0 + SHIP_R; s.vy = Math.abs(s.vy) * 0.5; }
        if (s.y + SHIP_R > ARENA.y1) { s.y = ARENA.y1 - SHIP_R; s.vy = -Math.abs(s.vy) * 0.5; }
        if (s.x + SHIP_R > ARENA.x1) {
          const inGate = g.gateOpen && s.y > GATE_Y0 && s.y < GATE_Y1;
          if (inGate && s.x > ARENA.x1 + 6 && controllable) {
            // Warped through the gate — wave complete!
            emit(g.particles, ARENA.x1, s.y, 30, {
              angleMin: -0.6, angleMax: 0.6, speedMin: 2, speedMax: 7,
              life: 36, colors: ["#5cff9e", "#eaffff"], size: 3, shrink: true,
            });
            const bonus = 100 * g.wave + g.bombs * 20;
            g.score += bonus;
            addPopup(g, ARENA.x1 - 60, GAME_H / 2 - 30, `WAVE BONUS +${bonus}`, "#5cff9e");
            g.mode = "wavecomplete";
            g.stateTimer = 70;
            sfxGate();
          } else if (!inGate) {
            s.x = ARENA.x1 - SHIP_R; s.vx = -Math.abs(s.vx) * 0.5;
          }
        }

        if (s.invuln > 0) s.invuln--;

        // ---- crystals ----
        if (controllable) {
          for (const c of g.crystals) {
            if (c.got) continue;
            if (dist2(s.x, s.y, c.x, c.y) < 22 * 22) {
              c.got = true;
              c.pop = 1;
              g.combo += 1;
              const val = (10 + g.combo * 2) * g.wave;
              g.score += val;
              addPopup(g, c.x, c.y, `+${val}`, "#8fd0ff");
              emit(g.particles, c.x, c.y, 12, {
                angleMin: 0, angleMax: Math.PI * 2, speedMin: 1, speedMax: 3.5,
                life: 26, colors: ["#8fd0ff", "#ffffff", "#ff7be5"], size: 2, shrink: true,
              });
              sfxCrystal(g.combo);
            }
          }
          const remain = g.crystals.filter((c) => !c.got).length;
          if (remain === 0 && !g.gateOpen) {
            g.gateOpen = true;
            g.bannerLife = 70;
            sfxGate();
          }
        }
      }

      // Crystal pop decay
      for (const c of g.crystals) if (c.pop > 0) c.pop = Math.max(0, c.pop - 0.06);

      // ---- shots ----
      for (let i = g.shots.length - 1; i >= 0; i--) {
        const sh = g.shots[i];
        sh.x += sh.vx; sh.y += sh.vy; sh.life--;
        if (sh.life <= 0 ||
            sh.x < ARENA.x0 || sh.x > ARENA.x1 || sh.y < ARENA.y0 || sh.y > ARENA.y1) {
          g.shots.splice(i, 1);
        }
      }

      // ---- enemy spawning ----
      if (g.mode === "playing") {
        g.spawnTimer--;
        const budget = enemyBudget(g.wave);
        if (g.spawnTimer <= 0 && g.enemies.length < budget) {
          g.enemies.push(spawnEnemy(pickEnemyKind(g.wave), g.wave));
          sfxSpawn();
          g.spawnTimer = clamp(90 - g.wave * 3, 28, 90) + rand(-10, 20);
        }
      }

      // ---- enemy update ----
      const s = g.ship;
      for (const e of g.enemies) {
        if (e.warp > 0) { e.warp--; continue; }
        if (e.kind === "mine") {
          // drift very slowly, gentle wander
          e.vx += Math.cos(frame * 0.02 + e.seed) * 0.02;
          e.vy += Math.sin(frame * 0.02 + e.seed) * 0.02;
          e.vx *= 0.96; e.vy *= 0.96;
          e.spin += 0.01;
        } else if (e.kind === "drifter") {
          e.spin += 0.05;
        } else if (e.kind === "homer") {
          const dx = s.x - e.x, dy = s.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          e.vx += (dx / d) * 0.10 * e.speed;
          e.vy += (dy / d) * 0.10 * e.speed;
          const spd = Math.hypot(e.vx, e.vy);
          const cap = 1.4 + e.speed;
          if (spd > cap) { e.vx = e.vx / spd * cap; e.vy = e.vy / spd * cap; }
          e.spin = Math.atan2(e.vy, e.vx);
        } else { // weaver — sine-weaving pursuit
          const dx = s.x - e.x, dy = s.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const nx = dx / d, ny = dy / d;
          const perp = Math.sin(frame * 0.1 + e.seed) * 1.6;
          e.vx = nx * (1.1 + e.speed) - ny * perp;
          e.vy = ny * (1.1 + e.speed) + nx * perp;
        }
        e.x += e.vx; e.y += e.vy;

        // keep inside arena
        if (e.x < ARENA.x0 + e.r) { e.x = ARENA.x0 + e.r; e.vx = Math.abs(e.vx); }
        if (e.x > ARENA.x1 - e.r) { e.x = ARENA.x1 - e.r; e.vx = -Math.abs(e.vx); }
        if (e.y < ARENA.y0 + e.r) { e.y = ARENA.y0 + e.r; e.vy = Math.abs(e.vy); }
        if (e.y > ARENA.y1 - e.r) { e.y = ARENA.y1 - e.r; e.vy = -Math.abs(e.vy); }
      }

      // ---- shot vs enemy ----
      for (let i = g.shots.length - 1; i >= 0; i--) {
        const sh = g.shots[i];
        for (let j = g.enemies.length - 1; j >= 0; j--) {
          const e = g.enemies[j];
          if (e.warp > 0) continue;
          if (dist2(sh.x, sh.y, e.x, e.y) < (e.r + 3) * (e.r + 3)) {
            e.hp -= 1;
            g.shots.splice(i, 1);
            if (e.hp <= 0) {
              const val = 20 * g.wave;
              g.score += val;
              addPopup(g, e.x, e.y, `+${val}`, "#eaffff");
              emit(g.particles, e.x, e.y, 16, {
                angleMin: 0, angleMax: Math.PI * 2, speedMin: 1, speedMax: 5,
                life: 30, colors: [e.color, "#ffffff"], size: 2.5, shrink: true,
              });
              g.enemies.splice(j, 1);
              sfxZap();
            }
            break;
          }
        }
      }

      // ---- enemy vs ship ----
      if (g.mode === "playing" && s.invuln <= 0) {
        for (const e of g.enemies) {
          if (e.warp > 0) continue;
          if (dist2(s.x, s.y, e.x, e.y) < (e.r + SHIP_R * 0.7) * (e.r + SHIP_R * 0.7)) {
            loseLife(g);
            break;
          }
        }
      }

      updateParticles(g.particles);
      updatePopups(g.popups);
      if (g.shake > 0) g.shake -= 1;
      if (g.flash > 0) g.flash -= 1;
      if (g.bannerLife > 0) g.bannerLife -= 1;

      // ================= RENDER =================
      ctx.save();
      if (g.shake > 0) {
        ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
      }

      drawBackground(ctx, g, frame);
      drawWalls(ctx, g, frame);

      for (const c of g.crystals) if (!c.got) drawCrystal(ctx, c, frame);
      drawShots(ctx, g.shots);
      for (const e of g.enemies) drawEnemy(ctx, e, frame);

      if (g.mode === "playing" || g.mode === "dying") {
        if (!(g.mode === "dying")) {
          drawShip(ctx, g.ship, SHIPS[g.shipIndex], frame, g.ship.thrusting);
        }
      }

      drawParticles(ctx, g.particles);
      drawPopups(ctx, g.popups);
      ctx.restore();

      // Screen flash (bombs / death), drawn over shake transform.
      if (g.flash > 0) {
        ctx.save();
        ctx.globalAlpha = (g.flash / 16) * 0.5;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.restore();
      }

      // HUD + overlays
      if (g.mode !== "title") drawHUD(ctx, g);

      // Mouse pilot whose Pointer Lock dropped (e.g. hit Esc) — nudge them to
      // click back in. Touch players never trip this (they never lock).
      if (g.mode === "playing" && mouse.current.everMouse && !mouse.current.locked) {
        ctx.save();
        ctx.fillStyle = "rgba(5,6,15,0.55)";
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.textAlign = "center";
        ctx.font = "800 26px ui-monospace, monospace";
        ctx.fillStyle = "#5cf0ff";
        ctx.shadowColor = "#1fb0d6"; ctx.shadowBlur = 14;
        ctx.fillText("CLICK TO FLY", GAME_W / 2, GAME_H / 2 - 6);
        ctx.font = "600 14px ui-monospace, monospace";
        ctx.shadowBlur = 0; ctx.fillStyle = "#8fd0ff";
        ctx.fillText("move the mouse to thrust • the ship keeps its momentum", GAME_W / 2, GAME_H / 2 + 24);
        ctx.restore();
      }

      if (g.bannerLife > 0 && g.mode === "playing") {
        const a = Math.min(1, g.bannerLife / 20);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = "center";
        ctx.font = "900 30px ui-monospace, monospace";
        const txt = g.crystals.every((c) => c.got) ? "GATE OPEN — ESCAPE RIGHT →" : `WAVE ${g.wave}`;
        ctx.fillStyle = g.crystals.every((c) => c.got) ? "#5cff9e" : "#8fd0ff";
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
        ctx.fillText(txt, GAME_W / 2, 110);
        ctx.restore();
      }

      if (g.mode === "title") {
        const def = SHIPS[g.shipIndex];
        // Big animated demo ship drifting behind the title.
        ctx.save();
        ctx.translate(GAME_W / 2, GAME_H / 2 + 6);
        ctx.rotate(Math.sin(frame * 0.02) * 0.5);
        ctx.scale(1.6, 1.6);
        drawShip(ctx, { x: 0, y: 0, angle: 0, invuln: 0 }, def, frame, true);
        ctx.restore();

        drawCenterText(ctx, [
          { text: "CRYSTAL QUEST", font: "900 56px ui-monospace, monospace", color: "#5cf0ff", glow: "#1fb0d6", gap: 130 },
          { text: `◀  ${def.name}  ▶`, font: "800 22px ui-monospace, monospace", color: def.color, glow: def.glow, gap: 40 },
          { text: "CLICK to launch  •  ← → pick ship", font: "700 16px ui-monospace, monospace", color: "#8fd0ff", gap: 28 },
          { text: "Move the mouse to fly — grab every crystal, exit the gate", font: "600 14px ui-monospace, monospace", color: "#5f7bb0", gap: 24 },
        ]);
        if (g.muted) {
          ctx.save(); ctx.textAlign = "center"; ctx.font = "700 13px ui-monospace, monospace";
          ctx.fillStyle = "#5f7bb0"; ctx.fillText("🔇 muted — press M", GAME_W / 2, GAME_H - 30); ctx.restore();
        }
      } else if (g.mode === "gameover") {
        ctx.save(); ctx.fillStyle = "rgba(5,6,15,0.6)"; ctx.fillRect(0, 0, GAME_W, GAME_H); ctx.restore();
        drawCenterText(ctx, [
          { text: "GAME OVER", font: "900 52px ui-monospace, monospace", color: "#ff5470", glow: "#c93ea6", gap: 60 },
          { text: `SCORE ${g.score}`, font: "800 26px ui-monospace, monospace", color: "#eaffff", gap: 34 },
          { text: `BEST ${g.best}   •   WAVE ${g.wave}`, font: "700 16px ui-monospace, monospace", color: "#8fd0ff", gap: 40 },
          { text: g.stateTimer > 30 ? "SPACE for menu" : "…", font: "700 15px ui-monospace, monospace", color: "#5f7bb0", gap: 20 },
        ]);
      } else if (g.mode === "win") {
        ctx.save(); ctx.fillStyle = "rgba(5,6,15,0.5)"; ctx.fillRect(0, 0, GAME_W, GAME_H); ctx.restore();
        drawCenterText(ctx, [
          { text: "GALAXY CLEARED!", font: "900 48px ui-monospace, monospace", color: "#5cff9e", glow: "#2ec27a", gap: 60 },
          { text: `FINAL SCORE ${g.score}`, font: "800 26px ui-monospace, monospace", color: "#eaffff", gap: 34 },
          { text: `BEST ${g.best}`, font: "700 16px ui-monospace, monospace", color: "#8fd0ff", gap: 40 },
          { text: g.stateTimer > 30 ? "SPACE for menu" : "…", font: "700 15px ui-monospace, monospace", color: "#5f7bb0", gap: 20 },
        ]);
      } else if (g.mode === "wavecomplete") {
        ctx.save(); ctx.textAlign = "center";
        ctx.font = "900 40px ui-monospace, monospace";
        ctx.fillStyle = "#5cff9e"; ctx.shadowColor = "#5cff9e"; ctx.shadowBlur = 18;
        ctx.fillText(`WAVE ${g.wave} CLEAR`, GAME_W / 2, GAME_H / 2);
        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
  }, []);

  return (
    <div className="min-h-screen w-full text-white flex flex-col items-center justify-center p-4 gap-4"
         style={{ background: "radial-gradient(ellipse at 50% 30%, #0d1330 0%, #05060f 70%)" }}>
      <div className="max-w-[960px] w-full flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight"
              style={{ color: "#5cf0ff", textShadow: "0 0 22px #1fb0d688" }}>
            Crystal Quest
          </h1>
          <p style={{ color: "#8fd0ff" }}>Sweep up every crystal, then dive through the gate before the nasties get you.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BackButton onBack={onBack} />
          <div className="hidden md:block text-right text-sm" style={{ color: "#5f7bb0" }}>
            Move mouse to fly • click to fire • B bomb • M mute
          </div>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden shadow-2xl border border-cyan-400/20 bg-black">
        <canvas
          ref={canvasRef}
          width={GAME_W}
          height={GAME_H}
          className="w-full max-w-[960px] aspect-video block cursor-pointer"
        />
      </div>

      {/* Touch controls: directional pad on the left, fire + bomb on the right. */}
      <TouchPad keysRef={keys} onPress={primeAudio} />

      <div className="max-w-[960px] w-full rounded-2xl border p-4 text-sm"
           style={{ background: "#0d133066", borderColor: "#1fb0d655", color: "#bfe3ff" }}>
        <b style={{ color: "#5cf0ff" }}>How to play:</b> <b>Click the arena</b> to take the controls, then
        <b> move the mouse to fly</b>. Motion is <b>thrust, not steering</b> — the ship is a mass drifting in
        near-frictionless space, so it keeps its momentum and coasts. To turn or stop you push <i>against</i> your own
        drift; lead your moves. Your guns fire <b>straight ahead in the direction you're travelling</b>, so you have to
        fly toward a target to hit it. <b>Click</b> to shoot; <b style={{ color: "#ffb14a" }}>B</b> (or Shift) sets off
        a <b>smart bomb</b> that clears the screen. Grab every <b style={{ color: "#8fd0ff" }}>crystal</b> to open the
        <b style={{ color: "#5cff9e" }}> gate</b> on the right wall, then drift out through it to the next wave. Bumping
        a mine or nasty costs a ship. Clear all {MAX_WAVE} waves to win. <span style={{ color: "#5f7bb0" }}>(On a phone
        or tablet, use the on-screen pad.)</span> <span style={{ color: "#5f7bb0" }}>Press <b>Esc</b> to release the
        mouse.</span>
      </div>
    </div>
  );
}
