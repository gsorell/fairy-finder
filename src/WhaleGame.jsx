import React, { useEffect, useRef, useState } from "react";
import {
  isMuted, primeAudio, sfxEat, sfxTreat, sfxLevel, sfxWin, sfxBounce,
  sfxSparkle, sfxButton, toggleMute,
} from "./audioWhale";
import { BackButton } from "./TouchControls.jsx";

// Bubbly Whale — swim around a cozy ocean and eat little shrimp. You can bump
// into jellies and puffers but you never get hurt and you can never lose; the
// world just keeps getting sparklier the more you eat. Between games you dress
// up your whale with colors, patterns, sparkles and cute accessories.

const GAME_W = 960;
const GAME_H = 600;

const SHRIMP_PER_LEVEL = 8;     // eat this many to reach the next level
const MAX_LEVEL = 30;           // finish the adventure here — then you win!
const EAT_DIST = 40;            // how close the whale must be to gulp a snack

const BEST_KEY = "whale-game-best";
const LOOK_KEY = "whale-game-look";

// --- Customization options -------------------------------------------------

const BODY_COLORS = [
  { name: "Sky", c: "#7fd4ff" },
  { name: "Berry", c: "#ff8fce" },
  { name: "Mint", c: "#93ecc4" },
  { name: "Grape", c: "#b9a4ff" },
  { name: "Peach", c: "#ffc0a3" },
  { name: "Lemon", c: "#ffe285" },
  { name: "Coral", c: "#ff9a8b" },
  { name: "Aqua", c: "#6fe6e0" },
  { name: "Cloud", c: "#dfe7ff" },
  { name: "Rose", c: "#ff9fb2" },
];

const BELLY_COLORS = [
  { name: "Cream", c: "#fff6e9" },
  { name: "Snow", c: "#eaf7ff" },
  { name: "Blush", c: "#ffe3ef" },
  { name: "Mint Ice", c: "#e0fff1" },
  { name: "Butter", c: "#fff3c9" },
  { name: "Lilac", c: "#f0e9ff" },
];

const PATTERNS = [
  { id: "plain", name: "Plain" },
  { id: "spots", name: "Spots" },
  { id: "stripes", name: "Stripes" },
  { id: "hearts", name: "Hearts" },
  { id: "stars", name: "Stars" },
];

const ACCENT_COLORS = [
  { name: "Pink", c: "#ff7fc4" },
  { name: "Gold", c: "#ffd24a" },
  { name: "Red", c: "#ff6b6b" },
  { name: "Purple", c: "#b982ff" },
  { name: "Teal", c: "#48d6c8" },
  { name: "White", c: "#ffffff" },
];

const ACCESSORIES = [
  { id: "none", name: "None" },
  { id: "bow", name: "Bow" },
  { id: "crown", name: "Crown" },
  { id: "flower", name: "Flower" },
  { id: "party", name: "Party Hat" },
  { id: "star", name: "Star" },
];

const DEFAULT_LOOK = {
  body: "#7fd4ff",
  belly: "#eaf7ff",
  pattern: "spots",
  patternColor: "#ffffff",
  sparkles: true,
  cheeks: true,
  accessory: "bow",
  accessoryColor: "#ff7fc4",
};

// --- Persistence -----------------------------------------------------------

function loadLook() {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { ...DEFAULT_LOOK, ...v };
    }
  } catch {}
  return { ...DEFAULT_LOOK };
}
function saveLook(look) {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch {}
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

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Lighten (amt>0) or darken (amt<0) a #rrggbb hex color.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// --- Little shape helpers --------------------------------------------------

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s, y - s * 0.2, x - s, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y + s * 0.9, x, y + s * 1.1, x, y + s * 1.5);
  ctx.bezierCurveTo(x, y + s * 1.1, x + s, y + s * 0.9, x + s, y + s * 0.35);
  ctx.bezierCurveTo(x + s, y - s * 0.2, x, y, x, y + s * 0.3);
  ctx.closePath();
}

function starPath(ctx, cx, cy, spikes, outer, inner, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / spikes;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// --- The whale ------------------------------------------------------------

// Body outline (facing right, centered near origin). Reused for fill + clip.
function whaleBodyPath(ctx) {
  ctx.beginPath();
  ctx.ellipse(6, 2, 58, 42, 0, 0, Math.PI * 2);
  ctx.closePath();
}

function drawWhalePattern(ctx, look) {
  ctx.save();
  whaleBodyPath(ctx);
  ctx.clip();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = look.patternColor;
  if (look.pattern === "spots") {
    const spots = [[-30, -14], [-8, 16], [16, -20], [34, 8], [-18, -30], [-40, 10], [24, 26]];
    for (const [x, y] of spots) {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (look.pattern === "stripes") {
    for (let x = -50; x <= 55; x += 20) {
      ctx.fillRect(x, -50, 8, 100);
    }
  } else if (look.pattern === "hearts") {
    const pts = [[-28, -8], [2, 14], [28, -12], [-6, -26], [-44, 12]];
    for (const [x, y] of pts) { heartPath(ctx, x, y, 6); ctx.fill(); }
  } else if (look.pattern === "stars") {
    const pts = [[-30, -10], [0, 16], [26, -16], [-8, -28], [40, 6]];
    for (const [x, y] of pts) { starPath(ctx, x, y, 5, 8, 3.4); ctx.fill(); }
  }
  ctx.restore();
}

function drawAccessory(ctx, look, frame) {
  const col = look.accessoryColor;
  const bob = Math.sin(frame * 0.12) * 1.5;
  ctx.save();
  ctx.translate(16, -40 + bob);
  if (look.accessory === "bow") {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-16, -9); ctx.lineTo(-16, 9); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(16, -9); ctx.lineTo(16, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(col, -0.15);
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  } else if (look.accessory === "crown") {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-16, 6);
    ctx.lineTo(-16, -6); ctx.lineTo(-8, 2); ctx.lineTo(0, -10);
    ctx.lineTo(8, 2); ctx.lineTo(16, -6); ctx.lineTo(16, 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff6b9d";
    for (const gx of [-10, 0, 10]) { ctx.beginPath(); ctx.arc(gx, 3, 2, 0, Math.PI * 2); ctx.fill(); }
  } else if (look.accessory === "flower") {
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffe066";
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  } else if (look.accessory === "party") {
    ctx.save();
    ctx.rotate(-0.25);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -30); ctx.lineTo(-12, 6); ctx.lineTo(12, 6); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(rand(-6, 6), -6 - i * 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ff6b9d";
    ctx.beginPath(); ctx.arc(0, -31, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (look.accessory === "star") {
    ctx.fillStyle = shade(col, -0.1);
    ctx.fillRect(-18, 4, 36, 3);
    ctx.fillStyle = col;
    starPath(ctx, 0, -6, 5, 12, 5);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.7;
    starPath(ctx, -2, -8, 5, 4, 1.6);
    ctx.fill();
  }
  ctx.restore();
}

// Draw the whale centered at the current transform origin.
// opts: { frame, facing, scale, happy, dizzy, mouthOpen, tilt, spin }
function drawWhale(ctx, look, opts = {}) {
  const {
    frame = 0, facing = 1, scale = 1,
    happy = 0, dizzy = 0, mouthOpen = 0, tilt = 0, spin = 0,
  } = opts;
  const bob = Math.sin(frame * 0.08) * 2;

  ctx.save();
  ctx.rotate(spin);
  ctx.scale(facing * scale, scale);
  ctx.rotate(tilt);
  ctx.translate(0, bob);

  const bodyDark = shade(look.body, -0.16);
  const wag = Math.sin(frame * 0.16) * 0.22;

  // Tail fluke (behind body)
  ctx.save();
  ctx.translate(-54, 0);
  ctx.rotate(wag);
  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.quadraticCurveTo(-4, -6, -22, -22);
  ctx.quadraticCurveTo(-16, -6, -6, -2);
  ctx.quadraticCurveTo(-16, 6, -22, 22);
  ctx.quadraticCurveTo(-4, 6, 6, 0);
  ctx.fill();
  ctx.restore();

  // Flipper (behind body, peeks out below)
  ctx.save();
  ctx.translate(6, 30);
  ctx.rotate(0.5 + Math.sin(frame * 0.1) * 0.12);
  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body
  whaleBodyPath(ctx);
  ctx.fillStyle = look.body;
  ctx.fill();

  // Belly (lighter underside)
  ctx.save();
  whaleBodyPath(ctx);
  ctx.clip();
  ctx.fillStyle = look.belly;
  ctx.beginPath();
  ctx.ellipse(12, 30, 48, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Pattern
  if (look.pattern !== "plain") drawWhalePattern(ctx, look);

  // Soft rim for definition
  ctx.save();
  whaleBodyPath(ctx);
  ctx.lineWidth = 2;
  ctx.strokeStyle = shade(look.body, -0.22);
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.restore();

  // Blowhole + happy spout
  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.ellipse(-8, -38, 4, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (happy > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(happy / 20, 0, 1) * 0.9;
    ctx.fillStyle = "#cdeeff";
    for (let i = 0; i < 4; i++) {
      const yy = -42 - i * 7 - (frame % 12);
      ctx.beginPath();
      ctx.arc(-8 + Math.sin(i) * 3, yy, 3 - i * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Cheeks
  if (look.cheeks) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#ff9ec4";
    ctx.beginPath();
    ctx.ellipse(30, 10, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Eye
  const eyeX = 40, eyeY = -8;
  if (dizzy > 0) {
    // Dizzy swirl eyes — playful, never scary.
    ctx.save();
    ctx.strokeStyle = "#3a2b55";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = i * 0.6 + frame * 0.2;
      const r = 1 + i * 0.35;
      const x = eyeX + Math.cos(a) * r;
      const y = eyeY + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b2140";
    const blink = Math.sin(frame * 0.05) > 0.985 ? 0.2 : 1; // occasional blink
    ctx.beginPath();
    ctx.ellipse(eyeX + 1, eyeY, 4.5, 4.5 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(eyeX - 1, eyeY - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth
  ctx.strokeStyle = "#c9527a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  if (mouthOpen > 0) {
    ctx.fillStyle = "#ff8fa8";
    ctx.beginPath();
    ctx.ellipse(40, 12, 5, 4 + mouthOpen * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(38, 8, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  // Accessory (on top)
  if (look.accessory !== "none") drawAccessory(ctx, look, frame);

  ctx.restore();
}

// --- Sea creatures & decor -------------------------------------------------

function drawShrimp(ctx, s, frame) {
  ctx.save();
  ctx.translate(s.x, s.y);
  const wig = Math.sin(frame * 0.2 + s.phase) * 0.25;
  ctx.rotate(s.angle + wig);
  const rainbow = s.rainbow;
  // Antennae
  ctx.strokeStyle = rainbow ? "#ffffff" : shade(s.color, -0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, -1); ctx.quadraticCurveTo(14, -6, 18, -3);
  ctx.moveTo(6, 1); ctx.quadraticCurveTo(14, 6, 18, 4);
  ctx.stroke();
  // Curled body — overlapping circles
  const segs = [[6, 0, 6], [1, -1, 6.5], [-4, 1, 6], [-9, 4, 5], [-12, 8, 4]];
  for (let i = 0; i < segs.length; i++) {
    const [x, y, r] = segs[i];
    if (rainbow) {
      ctx.fillStyle = `hsl(${(frame * 4 + i * 55) % 360}, 90%, 68%)`;
    } else {
      ctx.fillStyle = i % 2 === 0 ? s.color : shade(s.color, 0.12);
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tail fan
  ctx.fillStyle = rainbow ? "#ffd6f2" : shade(s.color, 0.18);
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.lineTo(-18, 4); ctx.lineTo(-17, 10); ctx.lineTo(-18, 14);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#2b2140";
  ctx.beginPath();
  ctx.arc(8, -2, 1.6, 0, Math.PI * 2);
  ctx.fill();
  // Little legs
  ctx.strokeStyle = shade(s.color, -0.15);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(2 - i * 4, 4);
    ctx.lineTo(1 - i * 4, 9);
    ctx.stroke();
  }
  if (rainbow) {
    ctx.fillStyle = "#fff";
    starPath(ctx, 2, -8, 4, 3, 1.2, frame * 0.1);
    ctx.fill();
  }
  ctx.restore();
}

function drawFish(ctx, s, frame) {
  ctx.save();
  ctx.translate(s.x, s.y);
  // face travel direction
  const dir = Math.cos(s.angle) < 0 ? -1 : 1;
  ctx.scale(dir, 1);
  const wig = Math.sin(frame * 0.3 + s.phase) * 0.15;
  ctx.rotate(wig);
  // Tail
  ctx.fillStyle = shade(s.color, -0.12);
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-16, -7); ctx.lineTo(-14, 0); ctx.lineTo(-16, 7);
  ctx.closePath();
  ctx.fill();
  // Top fin
  ctx.beginPath();
  ctx.moveTo(-2, -7); ctx.lineTo(3, -13); ctx.lineTo(6, -6);
  ctx.closePath();
  ctx.fill();
  // Body
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Belly stripe
  ctx.fillStyle = shade(s.color, 0.22);
  ctx.beginPath();
  ctx.ellipse(1, 3, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(6, -2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b2140";
  ctx.beginPath(); ctx.arc(7, -2, 1.5, 0, Math.PI * 2); ctx.fill();
  // Smile
  ctx.strokeStyle = shade(s.color, -0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(8, 2, 2, 0.1 * Math.PI, 0.7 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawStarfish(ctx, s, frame) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.spin + frame * 0.01);
  const col = s.color;
  ctx.fillStyle = col;
  starPath(ctx, 0, 0, 5, 15, 6);
  ctx.fill();
  // Dotty texture
  ctx.fillStyle = shade(col, 0.25);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cute face
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-3.5, -1, 2.4, 0, Math.PI * 2); ctx.arc(3.5, -1, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b2140";
  ctx.beginPath(); ctx.arc(-3.5, -1, 1.2, 0, Math.PI * 2); ctx.arc(3.5, -1, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#c9527a";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 2, 2, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
  ctx.restore();
}

function drawFood(ctx, f, frame) {
  if (f.kind === "fish") drawFish(ctx, f, frame);
  else if (f.kind === "starfish") drawStarfish(ctx, f, frame);
  else drawShrimp(ctx, f, frame); // shrimp + rainbow
}

function drawJelly(ctx, j, frame) {
  ctx.save();
  ctx.translate(j.x, j.y);
  const squish = 1 + Math.sin(frame * 0.08 + j.phase) * 0.08;
  ctx.globalAlpha = 0.82;
  // Tentacles
  ctx.strokeStyle = j.color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = -3; i <= 3; i++) {
    const bx = i * 4;
    ctx.beginPath();
    ctx.moveTo(bx, 8);
    ctx.quadraticCurveTo(
      bx + Math.sin(frame * 0.1 + i) * 4, 20,
      bx + Math.sin(frame * 0.08 + i) * 6, 30
    );
    ctx.stroke();
  }
  // Dome
  ctx.fillStyle = j.color;
  ctx.beginPath();
  ctx.ellipse(0, 4, 16 * squish, 14, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 4, 16 * squish, 6, 0, 0, Math.PI);
  ctx.fill();
  // Highlight
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-5, -2, 4, 3, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Sleepy face
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "#5b4a7a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-5, 2, 2, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.arc(5, 2, 2, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawPuffer(ctx, p, frame) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const puff = 1 + Math.sin(frame * 0.06 + p.phase) * 0.06;
  ctx.scale(puff, puff);
  // Spikes
  ctx.fillStyle = shade(p.color, -0.12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
    ctx.lineTo(Math.cos(a + 0.12) * 24, Math.sin(a + 0.12) * 24);
    ctx.lineTo(Math.cos(a - 0.12) * 24, Math.sin(a - 0.12) * 24);
    ctx.closePath();
    ctx.fill();
  }
  // Body
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.fill();
  // Belly
  ctx.fillStyle = shade(p.color, 0.25);
  ctx.beginPath();
  ctx.ellipse(0, 6, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-6, -3, 4, 0, Math.PI * 2); ctx.arc(6, -3, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b2140";
  ctx.beginPath(); ctx.arc(-5, -3, 2, 0, Math.PI * 2); ctx.arc(7, -3, 2, 0, Math.PI * 2); ctx.fill();
  // Pouty mouth
  ctx.strokeStyle = "#8a5a3a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 10, 3, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawCrab(ctx, c, frame) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const step = Math.sin(frame * 0.3 + c.phase) * 1.5;
  const col = c.color;
  // Legs
  ctx.strokeStyle = shade(col, -0.1);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const lx = 8 + i * 5;
    ctx.beginPath();
    ctx.moveTo(lx, 4); ctx.lineTo(lx + 6, 10 + (i === 1 ? step : 0));
    ctx.moveTo(-lx, 4); ctx.lineTo(-lx - 6, 10 + (i === 1 ? -step : 0));
    ctx.stroke();
  }
  // Claws
  ctx.fillStyle = col;
  const clawOpen = 0.5 + Math.sin(frame * 0.15 + c.phase) * 0.3;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 16, -2);
    ctx.rotate(side * -0.3);
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(col, -0.15);
    ctx.beginPath();
    ctx.moveTo(side * 4, -2); ctx.lineTo(side * 12, -2 - clawOpen * 4); ctx.lineTo(side * 12, 1); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col;
    ctx.restore();
  }
  // Shell
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(col, 0.2);
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes on stalks
  ctx.strokeStyle = shade(col, -0.1);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, -8); ctx.lineTo(-5, -14);
  ctx.moveTo(5, -8); ctx.lineTo(5, -14);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-5, -15, 3, 0, Math.PI * 2); ctx.arc(5, -15, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b2140";
  ctx.beginPath(); ctx.arc(-5, -15, 1.5, 0, Math.PI * 2); ctx.arc(5, -15, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawUrchin(ctx, u, frame) {
  ctx.save();
  ctx.translate(u.x, u.y);
  const pulse = 1 + Math.sin(frame * 0.05 + u.phase) * 0.05;
  const col = u.color;
  // Spikes
  ctx.strokeStyle = shade(col, -0.1);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 10 * pulse, Math.sin(a) * 10 * pulse);
    ctx.lineTo(Math.cos(a) * 22 * pulse, Math.sin(a) * 22 * pulse);
    ctx.stroke();
  }
  // Body
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(col, 0.25);
  ctx.beginPath(); ctx.arc(-3, -3, 4, 0, Math.PI * 2); ctx.fill();
  // Grumpy-cute eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-4, 0, 3, 0, Math.PI * 2); ctx.arc(4, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b2140";
  ctx.beginPath(); ctx.arc(-4, 1, 1.5, 0, Math.PI * 2); ctx.arc(4, 1, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHazard(ctx, h, frame) {
  if (h.kind === "puffer") drawPuffer(ctx, h, frame);
  else if (h.kind === "crab") drawCrab(ctx, h, frame);
  else if (h.kind === "urchin") drawUrchin(ctx, h, frame);
  else drawJelly(ctx, h, frame);
}

function drawBubble(ctx, b) {
  ctx.save();
  ctx.globalAlpha = b.alpha;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = b.alpha * 0.5;
  ctx.beginPath();
  ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSeaweed(ctx, x, baseY, h, frame, tint) {
  ctx.save();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  const sway = Math.sin(frame * 0.04 + x) * 10;
  ctx.quadraticCurveTo(x + sway * 0.5, baseY - h * 0.5, x + sway, baseY - h);
  ctx.stroke();
  ctx.restore();
}

function drawCoral(ctx, x, baseY, s, color) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, -22 * s);
  ctx.moveTo(0, -8 * s); ctx.lineTo(-10 * s, -20 * s);
  ctx.moveTo(0, -8 * s); ctx.lineTo(10 * s, -20 * s);
  ctx.moveTo(0, -14 * s); ctx.lineTo(-7 * s, -26 * s);
  ctx.moveTo(0, -14 * s); ctx.lineTo(7 * s, -26 * s);
  ctx.stroke();
  ctx.restore();
}

// --- Particles -------------------------------------------------------------

function makeParticlePool(size = 160) {
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
    p.gravity = opts.gravity ?? 0;
    p.shrink = opts.shrink ? 1 : 0;
    p.shape = opts.shape || "dot"; // dot | star | heart
    p.spin = Math.random() * Math.PI * 2;
    p.spinRate = (Math.random() - 0.5) * 0.3;
    done++;
  }
}
function updateParticles(pool) {
  for (const p of pool) {
    if (!p.active) continue;
    p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
    p.vx *= 0.98;
    p.spin += p.spinRate;
    p.life--;
    if (p.life <= 0) p.active = false;
  }
}
function drawParticles(ctx, pool) {
  for (const p of pool) {
    if (!p.active) continue;
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const size = p.shrink ? p.size * alpha : p.size;
    if (p.shape === "star") {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      starPath(ctx, 0, 0, 5, size * 1.6, size * 0.7);
      ctx.fill();
    } else if (p.shape === "heart") {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin * 0.3);
      heartPath(ctx, 0, 0, size);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.4, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Floating "+1" style chips.
function addPopup(g, x, y, text, color) {
  if (g.popups.length > 20) g.popups.shift();
  g.popups.push({ x, y, text, color, vy: -1.2, life: 44, maxLife: 44 });
}
function updatePopups(popups) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy; p.vy *= 0.96; p.life--;
    if (p.life <= 0) popups.splice(i, 1);
  }
}
function drawPopups(ctx, popups) {
  for (const p of popups) {
    const a = Math.min(1, p.life / 20);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "800 20px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = p.color;
    ctx.strokeStyle = "rgba(20,40,70,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }
}

// --- Game state ------------------------------------------------------------

const SHRIMP_COLORS = ["#ff9a76", "#ff7f9c", "#ffb36b", "#ff8fae", "#f98d6b"];
const FISH_COLORS = ["#ffd24a", "#ff8f5a", "#5ad1ff", "#8f7bff", "#ff7fc4", "#7bffb0"];
const STARFISH_COLORS = ["#ff9ec4", "#ffb14a", "#ff7f9c", "#c58fff"];
const JELLY_COLORS = ["#c9a4ff", "#a4d8ff", "#ffb3d9", "#b0f0d0"];
const CRAB_COLORS = ["#ff6b5a", "#ff8a4a", "#e0574a"];
const URCHIN_COLORS = ["#8f6bff", "#6b5ad1", "#b95ad1"];

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// A tasty snack. `kind` is shrimp | fish | starfish; rainbow is a bonus treat.
function spawnFood(kind, rainbow = false) {
  if (!kind && !rainbow) {
    const r = Math.random();
    kind = r < 0.5 ? "shrimp" : r < 0.82 ? "fish" : "starfish";
  }
  const f = {
    kind: kind || "shrimp",
    x: rand(80, GAME_W - 80),
    y: rand(90, GAME_H - 90),
    vx: rand(-0.5, 0.5),
    vy: rand(-0.4, 0.4),
    angle: rand(0, Math.PI * 2),
    phase: rand(0, Math.PI * 2),
    spin: rand(0, Math.PI * 2),
    rainbow: false,
    points: 1,
    flee: 0.28,
    ttl: Infinity,
  };
  if (rainbow) {
    f.kind = "shrimp"; f.rainbow = true; f.points = 5; f.flee = 0.5; f.ttl = 60 * 12;
    f.color = "#ff9a76";
  } else if (f.kind === "fish") {
    f.color = pick(FISH_COLORS); f.points = 1; f.flee = 0.3;
  } else if (f.kind === "starfish") {
    f.color = pick(STARFISH_COLORS); f.points = 2; f.flee = 0.12;
    f.vx = rand(-0.3, 0.3); f.vy = rand(-0.25, 0.25); // slow drifter
  } else {
    f.color = pick(SHRIMP_COLORS); f.points = 1; f.flee = 0.28;
  }
  return f;
}

// Something to bump into — harmless, just a friendly boing.
function spawnHazard(kind) {
  const h = {
    kind,
    x: rand(60, GAME_W - 60),
    y: rand(80, GAME_H - 130),
    vx: rand(-0.5, 0.5),
    vy: rand(-0.3, 0.3),
    phase: rand(0, Math.PI * 2),
    color: "#ffc27a",
  };
  if (kind === "jelly") h.color = pick(JELLY_COLORS);
  else if (kind === "puffer") h.color = "#ffc27a";
  else if (kind === "crab") {
    h.color = pick(CRAB_COLORS);
    h.y = GAME_H - 52;
    h.vx = (Math.random() < 0.5 ? -1 : 1) * rand(0.7, 1.2);
    h.vy = 0;
  } else if (kind === "urchin") {
    h.color = pick(URCHIN_COLORS);
    h.vx = rand(-0.2, 0.2); h.vy = rand(-0.15, 0.15);
  }
  return h;
}

function makeDecor() {
  const seaweed = [];
  for (let i = 0; i < 7; i++) {
    seaweed.push({
      x: rand(20, GAME_W - 20),
      h: rand(50, 130),
      tint: ["#3fa46a", "#2f8f78", "#4bb36b"][(Math.random() * 3) | 0],
    });
  }
  const corals = [];
  for (let i = 0; i < 5; i++) {
    corals.push({
      x: rand(40, GAME_W - 40),
      s: rand(0.8, 1.6),
      color: ["#ff8fb0", "#ff9a76", "#c9a4ff", "#ffc27a"][(Math.random() * 4) | 0],
    });
  }
  return { seaweed, corals };
}

function makeBubbles(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      x: rand(0, GAME_W),
      y: rand(0, GAME_H),
      r: rand(2, 7),
      spd: rand(0.3, 1.1),
      alpha: rand(0.2, 0.6),
    });
  }
  return arr;
}

function makeGame(look) {
  const food = [];
  for (let i = 0; i < 5; i++) food.push(spawnFood());
  return {
    mode: "playing",
    look,
    whale: {
      x: GAME_W / 2, y: GAME_H / 2, vx: 0, vy: 0,
      facing: 1, dizzy: 0, happy: 0, mouthOpen: 0, spin: 0, spinVel: 0,
    },
    target: { x: GAME_W / 2, y: GAME_H / 2, active: false },
    food,
    hazards: [],
    bubbles: makeBubbles(28),
    decor: makeDecor(),
    particles: makeParticlePool(),
    popups: [],
    eaten: 0,
    score: 0,
    level: 1,
    best: loadBest(),
    rainbowTimer: rand(60 * 8, 60 * 14),
    bannerLevel: 0,
    bannerLife: 0,
    winTime: 0,
    muted: isMuted(),
  };
}

function targetFoodCount(level) { return clamp(4 + level, 4, 12); }
function whaleScale(level) { return clamp(1 + (level - 1) * 0.05, 1, 1.55); }

// How many of each hazard should be around at a given level. New kinds unlock
// as the ocean gets busier, but totals stay gentle.
function hazardTargets(level) {
  return {
    jelly: level >= 2 ? clamp(level - 1, 1, 3) : 0,
    puffer: level >= 3 ? clamp(Math.floor((level - 1) / 2), 1, 3) : 0,
    crab: level >= 4 ? clamp(Math.floor((level - 2) / 4), 1, 2) : 0,
    urchin: level >= 6 ? clamp(Math.floor((level - 4) / 5), 1, 2) : 0,
  };
}

// --- Backgrounds -----------------------------------------------------------

function drawOceanBg(ctx, level, frame) {
  // Water gets a touch brighter and more magical with each level.
  const t = clamp((level - 1) / 10, 0, 1);
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
  grad.addColorStop(0, shade("#1a6fb0", t * 0.25));
  grad.addColorStop(0.5, shade("#1b8fc9", t * 0.22));
  grad.addColorStop(1, shade("#0e5a8a", t * 0.18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Sun rays from the surface
  ctx.save();
  ctx.globalAlpha = 0.10 + t * 0.06;
  ctx.fillStyle = "#eaffff";
  for (let i = 0; i < 5; i++) {
    const x = ((i * 220 + frame * 0.3) % (GAME_W + 200)) - 100;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 60, 0);
    ctx.lineTo(x + 160, GAME_H);
    ctx.lineTo(x + 40, GAME_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Rainbow arc appears at higher levels — pure delight, no gameplay effect.
  if (level >= 4) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 8;
    const cols = ["#ff6b6b", "#ffb36b", "#ffe66b", "#6bff9e", "#6bd0ff", "#b96bff"];
    for (let i = 0; i < cols.length; i++) {
      ctx.strokeStyle = cols[i];
      ctx.beginPath();
      ctx.arc(GAME_W / 2, GAME_H + 120, 360 + i * 9, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Sandy floor
  ctx.fillStyle = shade("#e6cf9a", t * 0.15);
  ctx.beginPath();
  ctx.moveTo(0, GAME_H);
  ctx.lineTo(0, GAME_H - 30);
  for (let x = 0; x <= GAME_W; x += 60) {
    ctx.lineTo(x, GAME_H - 30 + Math.sin(x * 0.02) * 8);
  }
  ctx.lineTo(GAME_W, GAME_H);
  ctx.closePath();
  ctx.fill();
}

function drawHUD(ctx, g, frame) {
  ctx.save();
  ctx.font = "800 22px ui-rounded, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(10,40,70,0.5)";
  ctx.lineWidth = 4;
  const s = `Snacks: ${g.score}`;
  ctx.strokeText(s, 20, 38); ctx.fillText(s, 20, 38);

  ctx.font = "800 18px ui-rounded, system-ui, sans-serif";
  const lv = `Level ${g.level} / ${MAX_LEVEL}`;
  ctx.strokeText(lv, 20, 64); ctx.fillText(lv, 20, 64);

  // Progress-to-next-level pips
  const got = g.eaten % SHRIMP_PER_LEVEL;
  const pipY = 78, pipX0 = 20;
  for (let i = 0; i < SHRIMP_PER_LEVEL; i++) {
    ctx.beginPath();
    ctx.arc(pipX0 + 8 + i * 16, pipY, 5, 0, Math.PI * 2);
    ctx.fillStyle = i < got ? "#ffe066" : "rgba(255,255,255,0.3)";
    ctx.fill();
  }

  ctx.textAlign = "right";
  ctx.font = "700 15px ui-rounded, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(`Best: ${Math.max(g.best, g.score)}`, GAME_W - 20, 34);
  ctx.fillText(g.muted ? "🔇 M" : "🔊 M", GAME_W - 20, 56);
  ctx.restore();

  // Level-up banner
  if (g.bannerLife > 0) {
    const p = 1 - g.bannerLife / 90;
    const ease = 1 - Math.pow(1 - p, 3);
    ctx.save();
    ctx.globalAlpha = g.bannerLife > 20 ? 1 : g.bannerLife / 20;
    ctx.translate(GAME_W / 2, 150 - (1 - ease) * 30);
    const sc = 1 + (1 - ease) * 0.3;
    ctx.scale(sc, sc);
    ctx.font = "900 52px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#ff7fc4";
    ctx.lineWidth = 8;
    ctx.strokeText(`Level ${g.bannerLevel}!`, 0, 0);
    ctx.fillText(`Level ${g.bannerLevel}!`, 0, 0);
    ctx.font = "800 22px ui-rounded, system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.strokeText("Yay! You're doing great!", 0, 40);
    ctx.fillText("Yay! You're doing great!", 0, 40);
    ctx.restore();
  }
}

// --- Whale preview (used on home + customize screens) ----------------------

function WhalePreview({ look, size = 220, pose = {} }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let frame = 0, raf;
    const loop = () => {
      frame++;
      ctx.clearRect(0, 0, size, size * 0.75);
      ctx.save();
      ctx.translate(size / 2, size * 0.75 / 2);
      // Sparkle ring around the whale in the preview
      if (look.sparkles) {
        for (let i = 0; i < 6; i++) {
          const a = frame * 0.03 + (i / 6) * Math.PI * 2;
          const r = 78 + Math.sin(frame * 0.06 + i) * 6;
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(frame * 0.1 + i);
          ctx.fillStyle = ["#fff", "#ffe6f5", "#e6f7ff"][i % 3];
          starPath(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.75, 4, 4, 1.6, frame * 0.05);
          ctx.fill();
          ctx.restore();
        }
      }
      drawWhale(ctx, look, { frame, facing: 1, scale: size / 220, ...pose });
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [look, size, pose]);
  return <canvas ref={ref} width={size} height={size * 0.75} style={{ width: size, height: size * 0.75 }} />;
}

// --- Customize screen ------------------------------------------------------

function Swatch({ color, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full transition-transform active:scale-90"
      style={{
        width: 40, height: 40, background: color,
        border: selected ? "4px solid #fff" : "3px solid rgba(255,255,255,0.35)",
        boxShadow: selected ? "0 0 0 3px #ff7fc4, 0 3px 10px rgba(0,0,0,0.25)" : "0 2px 6px rgba(0,0,0,0.2)",
        cursor: "pointer",
      }}
      aria-label={`color ${color}`}
    />
  );
}

function Chip({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-full font-bold text-sm transition-transform active:scale-95"
      style={{
        background: selected ? "#ff7fc4" : "rgba(255,255,255,0.18)",
        color: "#fff",
        border: selected ? "3px solid #fff" : "3px solid rgba(255,255,255,0.25)",
        boxShadow: selected ? "0 3px 12px rgba(255,127,196,0.5)" : "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <div className="font-bold mb-2 text-lg" style={{ color: "#fff7ff" }}>{title}</div>
      <div className="flex flex-wrap gap-2 items-center">{children}</div>
    </div>
  );
}

function CustomizeScreen({ look, setLook, onDone }) {
  const set = (patch) => { sfxSparkle(); setLook({ ...look, ...patch }); };
  return (
    <div className="min-h-svh w-full flex flex-col items-center py-6 px-4"
      style={{ background: "linear-gradient(180deg, #17517f 0%, #1b8fc9 55%, #0e5a8a 100%)" }}>
      <h1 className="text-4xl font-black mb-1" style={{ color: "#fff", textShadow: "0 3px 0 #ff7fc4" }}>
        Dress Up Your Whale
      </h1>
      <p className="mb-4 text-sm" style={{ color: "#d5f2ff" }}>Tap to make your whale super cute!</p>

      <div className="rounded-3xl p-4 mb-5"
        style={{ background: "rgba(255,255,255,0.12)", border: "3px solid rgba(255,255,255,0.25)" }}>
        <WhalePreview look={look} size={280} pose={{ happy: 6 }} />
      </div>

      <div className="w-full max-w-[640px]">
        <Section title="🎨 Body Color">
          {BODY_COLORS.map((b) => (
            <Swatch key={b.c} color={b.c} selected={look.body === b.c} onClick={() => set({ body: b.c })} />
          ))}
        </Section>

        <Section title="🐚 Tummy Color">
          {BELLY_COLORS.map((b) => (
            <Swatch key={b.c} color={b.c} selected={look.belly === b.c} onClick={() => set({ belly: b.c })} />
          ))}
        </Section>

        <Section title="✨ Pattern">
          {PATTERNS.map((p) => (
            <Chip key={p.id} label={p.name} selected={look.pattern === p.id} onClick={() => set({ pattern: p.id })} />
          ))}
        </Section>

        {look.pattern !== "plain" && (
          <Section title="🖍️ Pattern Color">
            {ACCENT_COLORS.map((a) => (
              <Swatch key={a.c} color={a.c} selected={look.patternColor === a.c} onClick={() => set({ patternColor: a.c })} />
            ))}
          </Section>
        )}

        <Section title="👑 Accessory">
          {ACCESSORIES.map((a) => (
            <Chip key={a.id} label={a.name} selected={look.accessory === a.id} onClick={() => set({ accessory: a.id })} />
          ))}
        </Section>

        {look.accessory !== "none" && (
          <Section title="🎀 Accessory Color">
            {ACCENT_COLORS.map((a) => (
              <Swatch key={a.c} color={a.c} selected={look.accessoryColor === a.c} onClick={() => set({ accessoryColor: a.c })} />
            ))}
          </Section>
        )}

        <Section title="💫 Extra Cute">
          <Chip label={look.sparkles ? "Sparkles: ON ✨" : "Sparkles: OFF"} selected={look.sparkles} onClick={() => set({ sparkles: !look.sparkles })} />
          <Chip label={look.cheeks ? "Blushy Cheeks: ON 🌸" : "Blushy Cheeks: OFF"} selected={look.cheeks} onClick={() => set({ cheeks: !look.cheeks })} />
        </Section>
      </div>

      <button
        onClick={() => { sfxButton(); onDone(); }}
        className="mt-3 mb-8 px-10 py-4 rounded-full font-black text-2xl transition-transform active:scale-95"
        style={{ background: "#ffd24a", color: "#7a3d00", boxShadow: "0 6px 0 #d59a1e", cursor: "pointer" }}
      >
        All Done! 🐳
      </button>
    </div>
  );
}

// --- Home screen -----------------------------------------------------------

function HomeScreen({ look, best, onPlay, onCustomize, onBack }) {
  return (
    <div className="min-h-svh w-full flex flex-col items-center justify-center py-6 px-4 relative"
      style={{ background: "linear-gradient(180deg, #17517f 0%, #1b8fc9 55%, #0e5a8a 100%)" }}>
      <div className="absolute top-4 left-4"><BackButton onBack={onBack} /></div>

      <h1 className="text-5xl md:text-6xl font-black mb-1 text-center"
        style={{ color: "#fff", textShadow: "0 4px 0 #ff7fc4, 0 8px 20px rgba(0,0,0,0.3)" }}>
        Bubbly Whale
      </h1>
      <p className="mb-4 text-lg" style={{ color: "#d5f2ff" }}>Swim, eat shrimp, and sparkle! 🦐✨</p>

      <div className="rounded-3xl p-5 mb-6"
        style={{ background: "rgba(255,255,255,0.12)", border: "3px solid rgba(255,255,255,0.25)" }}>
        <WhalePreview look={look} size={320} pose={{ happy: 8 }} />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onPlay}
          className="px-12 py-5 rounded-full font-black text-3xl transition-transform active:scale-95"
          style={{ background: "#ffd24a", color: "#7a3d00", boxShadow: "0 7px 0 #d59a1e", cursor: "pointer" }}
        >
          Play! 🐳
        </button>
        <button
          onClick={onCustomize}
          className="px-10 py-5 rounded-full font-black text-2xl transition-transform active:scale-95"
          style={{ background: "#ff7fc4", color: "#fff", boxShadow: "0 7px 0 #d3559e", cursor: "pointer" }}
        >
          Dress Up ✨
        </button>
      </div>

      {best > 0 && (
        <p className="mt-6 font-bold text-lg" style={{ color: "#fff2c9" }}>
          🏆 Best: {best} snacks!
        </p>
      )}
      <p className="mt-2 text-sm" style={{ color: "#bfe6ff" }}>
        Move with your finger, mouse, or arrow keys
      </p>
    </div>
  );
}

// --- Gameplay canvas -------------------------------------------------------

function GameCanvas({ look, onHome }) {
  const canvasRef = useRef(null);
  const keys = useRef({});
  const gameRef = useRef(makeGame(look));
  const onHomeRef = useRef(onHome);
  useEffect(() => { onHomeRef.current = onHome; }, [onHome]);

  // The loop is imperative; winning stores the final score here, which both
  // flips on the "You Win!" overlay and gives it a value to show.
  const [winScore, setWinScore] = useState(null);
  const finishRef = useRef(setWinScore);
  useEffect(() => { finishRef.current = setWinScore; }, []);

  const restart = () => {
    gameRef.current = makeGame(look);
    setWinScore(null);
  };

  // Keyboard
  useEffect(() => {
    const down = (e) => {
      const key = e.key.toLowerCase();
      primeAudio();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) e.preventDefault();
      if (key === "escape") { onHomeRef.current?.(); return; }
      if (key === "m") { gameRef.current.muted = toggleMute(); }
      keys.current[key] = true;
      // Any key steers with keys, not pointer
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        gameRef.current.target.active = false;
      }
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Pointer steering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const toWorld = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) * (GAME_W / r.width),
        y: (clientY - r.top) * (GAME_H / r.height),
      };
    };
    const move = (e) => {
      primeAudio();
      const { x, y } = toWorld(e.clientX, e.clientY);
      const g = gameRef.current;
      g.target.x = x; g.target.y = y; g.target.active = true;
    };
    const leave = () => { gameRef.current.target.active = false; };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", move);
    canvas.addEventListener("pointerleave", leave);
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", move);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let frame = 0, raf;

    const levelUp = (g) => {
      g.level++;
      g.bannerLevel = g.level;
      g.bannerLife = 90;
      sfxLevel();
      // Confetti + hearts burst from the whale
      const w = g.whale;
      emit(g.particles, w.x, w.y, 40, {
        angleMin: 0, angleMax: Math.PI * 2, speedMin: 2, speedMax: 6,
        life: 60, colors: ["#ff6b6b", "#ffd24a", "#6bff9e", "#6bd0ff", "#b96bff", "#ff7fc4"],
        size: 4, gravity: 0.08, shrink: true, shape: "star",
      });
      emit(g.particles, w.x, w.y, 14, {
        angleMin: -Math.PI, angleMax: 0, speedMin: 1, speedMax: 3,
        life: 50, colors: ["#ff9ec4", "#ff7fc4"], size: 6, shrink: true, shape: "heart",
      });
      w.spinVel = 0.4; // happy twirl
    };

    const winGame = (g) => {
      g.mode = "won";
      g.winTime = 0;
      sfxWin();
      if (g.score > g.best) { g.best = g.score; saveBest(g.score); }
      finishRef.current(g.score);
      // A big party burst to kick off the celebration
      const w = g.whale;
      emit(g.particles, w.x, w.y, 80, {
        angleMin: 0, angleMax: Math.PI * 2, speedMin: 2, speedMax: 8,
        life: 90, colors: ["#ff6b6b", "#ffd24a", "#6bff9e", "#6bd0ff", "#b96bff", "#ff7fc4", "#fff"],
        size: 5, gravity: 0.06, shrink: true, shape: "star",
      });
      w.spinVel = 0.5;
    };

    const tick = () => {
      frame++;
      const g = gameRef.current;
      const k = keys.current;
      const w = g.whale;

      const scl = whaleScale(g.level);
      const playing = g.mode === "playing";

      // --- Steering (only while actively playing) ---
      const maxSpeed = 4.6 + g.level * 0.15;
      const accel = 0.5;
      let dx = 0, dy = 0;
      const kl = playing && (k["arrowleft"] || k["a"]);
      const kr = playing && (k["arrowright"] || k["d"]);
      const ku = playing && (k["arrowup"] || k["w"]);
      const kd = playing && (k["arrowdown"] || k["s"]);
      const targetActive = playing && g.target.active;
      if (kl || kr || ku || kd) {
        dx = (kr ? 1 : 0) - (kl ? 1 : 0);
        dy = (kd ? 1 : 0) - (ku ? 1 : 0);
      } else if (targetActive) {
        const tx = g.target.x - w.x, ty = g.target.y - w.y;
        const d = Math.hypot(tx, ty);
        if (d > 6) { dx = tx / d; dy = ty / d; }
      }
      const dLen = Math.hypot(dx, dy) || 1;
      dx /= dLen; dy /= dLen;
      const moving = (kl || kr || ku || kd || (targetActive && Math.hypot(g.target.x - w.x, g.target.y - w.y) > 6));
      const ctrl = w.dizzy > 0 ? 0.35 : 1; // wobbly while dizzy, but still steerable
      if (moving) {
        w.vx += dx * accel * ctrl;
        w.vy += dy * accel * ctrl;
      }
      // Drag
      w.vx *= 0.92; w.vy *= 0.92;
      const sp = Math.hypot(w.vx, w.vy);
      if (sp > maxSpeed) { w.vx = w.vx / sp * maxSpeed; w.vy = w.vy / sp * maxSpeed; }
      w.x += w.vx; w.y += w.vy;

      // Facing follows horizontal motion
      if (Math.abs(w.vx) > 0.3) w.facing = w.vx > 0 ? 1 : -1;

      // Soft tank bounds
      const mx = 60 * scl, myTop = 60 * scl, myBot = 70 * scl;
      if (w.x < mx) { w.x = mx; w.vx = Math.abs(w.vx) * 0.4; }
      if (w.x > GAME_W - mx) { w.x = GAME_W - mx; w.vx = -Math.abs(w.vx) * 0.4; }
      if (w.y < myTop) { w.y = myTop; w.vy = Math.abs(w.vy) * 0.4; }
      if (w.y > GAME_H - myBot) { w.y = GAME_H - myBot; w.vy = -Math.abs(w.vy) * 0.4; }

      // Win celebration — the whale does a joyful never-ending twirl and
      // confetti keeps raining from the top of the screen.
      if (!playing) {
        w.happy = 22;
        if (w.spinVel < 0.14) w.spinVel += 0.02;
        g.winTime = (g.winTime || 0) + 1;
        if (g.winTime % 10 === 0) {
          emit(g.particles, rand(0, GAME_W), -10, 3, {
            angleMin: Math.PI * 0.3, angleMax: Math.PI * 0.7, speedMin: 1, speedMax: 3,
            life: 120, colors: ["#ff6b6b", "#ffd24a", "#6bff9e", "#6bd0ff", "#b96bff", "#ff7fc4"],
            size: 4, gravity: 0.05, shrink: false, shape: "star",
          });
        }
      }

      // Timers
      if (w.dizzy > 0) w.dizzy--;
      if (w.happy > 0) w.happy--;
      if (w.mouthOpen > 0) w.mouthOpen -= 0.08;
      w.spin += w.spinVel;
      if (playing) {
        w.spinVel *= 0.9;
        if (Math.abs(w.spin) < 0.02 && Math.abs(w.spinVel) < 0.02) { w.spin = 0; w.spinVel = 0; }
      }

      // Sparkle trail
      if (look.sparkles && moving && sp > 1.2 && frame % 3 === 0) {
        emit(g.particles, w.x - w.facing * 40 * scl, w.y + rand(-10, 10), 1, {
          angleMin: 0, angleMax: Math.PI * 2, speedMin: 0, speedMax: 0.6,
          life: 24, colors: ["#ffffff", "#ffe6f5", "#c9f0ff"], size: 2.4, shrink: true, shape: "star",
        });
      }

      if (playing) {
      // --- Food ---
      for (const s of g.food) {
        s.x += s.vx; s.y += s.vy;
        // gentle wandering
        if (Math.random() < 0.02) { s.vx = rand(-0.6, 0.6); s.vy = rand(-0.5, 0.5); }
        // Flee a little when whale is near (gentle challenge, still easy)
        const fdx = s.x - w.x, fdy = s.y - w.y;
        const fd = Math.hypot(fdx, fdy);
        if (fd < 90 && fd > 0.1) {
          const flee = s.flee * (1 - fd / 90);
          s.vx += (fdx / fd) * flee;
          s.vy += (fdy / fd) * flee;
        }
        const spCap = s.kind === "starfish" ? 1.4 : 2.2;
        s.vx = clamp(s.vx, -spCap, spCap); s.vy = clamp(s.vy, -spCap, spCap);
        s.angle = Math.atan2(s.vy, s.vx) + Math.PI;
        s.x = clamp(s.x, 40, GAME_W - 40);
        s.y = clamp(s.y, 70, GAME_H - 50);
        if (s.ttl !== Infinity) s.ttl--;
      }
      // Remove expired rainbow treats
      for (let i = g.food.length - 1; i >= 0; i--) {
        if (g.food[i].ttl <= 0) g.food.splice(i, 1);
      }

      // Eat check
      const eatR = EAT_DIST * scl;
      for (let i = g.food.length - 1; i >= 0; i--) {
        const s = g.food[i];
        const mouthX = w.x + w.facing * 30 * scl;
        const d = Math.hypot(s.x - mouthX, s.y - w.y);
        if (d < eatR) {
          g.food.splice(i, 1);
          g.eaten++;
          g.score += s.points;
          w.happy = 22; w.mouthOpen = 1;
          if (s.rainbow) {
            sfxTreat();
            addPopup(g, s.x, s.y - 10, "+5 ✨", "#ffe066");
            emit(g.particles, s.x, s.y, 26, {
              angleMin: 0, angleMax: Math.PI * 2, speedMin: 1.5, speedMax: 5,
              life: 46, colors: ["#ff6b6b", "#ffd24a", "#6bff9e", "#6bd0ff", "#b96bff"],
              size: 3.6, shrink: true, shape: "star",
            });
          } else {
            sfxEat();
            addPopup(g, s.x, s.y - 10, s.points > 1 ? `+${s.points}` : "+1", "#ffffff");
            emit(g.particles, s.x, s.y, 12, {
              angleMin: 0, angleMax: Math.PI * 2, speedMin: 1, speedMax: 3,
              life: 30, colors: [s.color, "#ffffff", "#ffe6d0"], size: 2.6, shrink: true,
            });
          }
          // Level up — or finish the whole adventure at the top level!
          if (g.eaten % SHRIMP_PER_LEVEL === 0) {
            if (g.level >= MAX_LEVEL) winGame(g);
            else levelUp(g);
          }
        }
      }

      // Maintain food population (rainbow treats don't count toward the base)
      while (g.food.filter(s => !s.rainbow).length < targetFoodCount(g.level)) {
        g.food.push(spawnFood());
      }

      // Rainbow treat spawner
      g.rainbowTimer--;
      if (g.rainbowTimer <= 0 && !g.food.some(s => s.rainbow)) {
        g.food.push(spawnFood(null, true));
        g.rainbowTimer = rand(60 * 10, 60 * 18);
        sfxSparkle();
      }

      // --- Hazards (avoid, but always harmless) ---
      const wants = hazardTargets(g.level);
      for (const kind of ["jelly", "puffer", "crab", "urchin"]) {
        let have = g.hazards.filter(h => h.kind === kind).length;
        while (have < wants[kind]) {
          const h = spawnHazard(kind);
          // Don't drop a new hazard right on top of the whale.
          if (Math.hypot(h.x - w.x, h.y - w.y) < 140) { h.x = (w.x + GAME_W / 2) % GAME_W; }
          g.hazards.push(h);
          have++;
        }
      }

      for (const h of g.hazards) {
        if (h.kind === "crab") {
          // Scuttle sideways along the sea floor.
          h.x += h.vx;
          h.y = GAME_H - 52 + Math.sin(frame * 0.2 + h.phase) * 3;
          if (h.x < 40 || h.x > GAME_W - 40) h.vx *= -1;
          h.x = clamp(h.x, 40, GAME_W - 40);
        } else if (h.kind === "urchin") {
          h.x += h.vx; h.y += h.vy;
          if (Math.random() < 0.01) { h.vx = rand(-0.2, 0.2); h.vy = rand(-0.15, 0.15); }
          if (h.x < 40 || h.x > GAME_W - 40) h.vx *= -1;
          if (h.y < 70 || h.y > GAME_H - 90) h.vy *= -1;
          h.x = clamp(h.x, 40, GAME_W - 40);
          h.y = clamp(h.y, 70, GAME_H - 90);
        } else {
          // Jellies and puffers drift freely.
          h.x += h.vx; h.y += h.vy;
          if (Math.random() < 0.01) { h.vx = rand(-0.5, 0.5); h.vy = rand(-0.3, 0.3); }
          if (h.x < 40 || h.x > GAME_W - 40) h.vx *= -1;
          if (h.y < 60 || h.y > GAME_H - 90) h.vy *= -1;
          h.x = clamp(h.x, 40, GAME_W - 40);
          h.y = clamp(h.y, 60, GAME_H - 90);
        }
      }

      // Bump check — bounce the whale, never hurt it
      if (w.dizzy <= 0) {
        const radii = { jelly: 24, puffer: 28, crab: 22, urchin: 24 };
        for (const h of g.hazards) {
          const r = radii[h.kind] || 24;
          const bdx = w.x - h.x, bdy = w.y - h.y;
          const bd = Math.hypot(bdx, bdy);
          if (bd < r + 30 * scl && bd > 0.1) {
            const nx = bdx / bd, ny = bdy / bd;
            w.vx = nx * 5.5; w.vy = ny * 5.5;
            w.dizzy = 45;
            w.spinVel = (Math.random() < 0.5 ? 1 : -1) * 0.3;
            sfxBounce();
            emit(g.particles, w.x, w.y, 10, {
              angleMin: 0, angleMax: Math.PI * 2, speedMin: 1, speedMax: 3,
              life: 30, colors: ["#fff", "#ffe066", "#ffd24a"], size: 3, shrink: true, shape: "star",
            });
            addPopup(g, w.x, w.y - 40 * scl, "boing!", "#ffe066");
            break;
          }
        }
      }
      } // end if (playing)

      // --- Bubbles ---
      for (const b of g.bubbles) {
        b.y -= b.spd;
        b.x += Math.sin(frame * 0.03 + b.x) * 0.2;
        if (b.y < -10) { b.y = GAME_H + 10; b.x = rand(0, GAME_W); }
      }

      // Persist best
      if (g.score > g.best) { g.best = g.score; saveBest(g.score); }

      if (g.bannerLife > 0) g.bannerLife--;

      updateParticles(g.particles);
      updatePopups(g.popups);

      // --- Draw ---
      drawOceanBg(ctx, g.level, frame);

      // Decor at the floor
      for (const sw of g.decor.seaweed) drawSeaweed(ctx, sw.x, GAME_H - 24, sw.h, frame, sw.tint);
      for (const co of g.decor.corals) drawCoral(ctx, co.x, GAME_H - 22, co.s, co.color);

      for (const b of g.bubbles) drawBubble(ctx, b);

      // Creatures behind whale
      for (const h of g.hazards) drawHazard(ctx, h, frame);
      for (const s of g.food) drawFood(ctx, s, frame);

      drawParticles(ctx, g.particles);

      // Whale
      ctx.save();
      ctx.translate(w.x, w.y);
      const tilt = clamp(w.vy * 0.03, -0.25, 0.25);
      drawWhale(ctx, look, {
        frame, facing: w.facing, scale: scl,
        happy: w.happy, dizzy: w.dizzy, mouthOpen: Math.max(0, w.mouthOpen),
        tilt, spin: w.spin,
      });
      ctx.restore();

      drawPopups(ctx, g.popups);
      drawHUD(ctx, g, frame);

      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(raf);
  }, [look]);

  return (
    <div className="min-h-svh w-full flex flex-col items-center justify-center p-3 gap-2"
      style={{ background: "linear-gradient(180deg, #0c3a5c 0%, #12608f 100%)" }}>
      <div className="max-w-[960px] w-full flex items-center justify-between">
        <BackButton onBack={() => { sfxButton(); onHome(); }} />
        <div className="text-sm" style={{ color: "#cdeeff" }}>
          Move: finger / mouse / arrows &nbsp;•&nbsp; M: sound &nbsp;•&nbsp; Esc: home
        </div>
      </div>
      <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 bg-black"
        style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={GAME_W}
          height={GAME_H}
          className="block w-full max-w-[960px]"
          style={{ aspectRatio: `${GAME_W} / ${GAME_H}`, touchAction: "none" }}
        />
        {winScore !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
            style={{ background: "rgba(12,58,92,0.55)", backdropFilter: "blur(2px)" }}>
            <div className="text-6xl md:text-7xl font-black mb-2"
              style={{ color: "#fff", textShadow: "0 4px 0 #ff7fc4, 0 0 30px #ffe066" }}>
              You Did It! 🎉
            </div>
            <div className="text-2xl font-black mb-1" style={{ color: "#ffe066" }}>
              🐳 You reached Level {MAX_LEVEL}! 🏆
            </div>
            <div className="text-lg font-bold mb-6" style={{ color: "#eaf7ff" }}>
              You ate {winScore} yummy snacks. What a super whale!
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => { sfxButton(); restart(); }}
                className="px-10 py-4 rounded-full font-black text-2xl transition-transform active:scale-95"
                style={{ background: "#ffd24a", color: "#7a3d00", boxShadow: "0 6px 0 #d59a1e", cursor: "pointer" }}
              >
                Play Again 🐳
              </button>
              <button
                onClick={() => { sfxButton(); onHome(); }}
                className="px-10 py-4 rounded-full font-black text-2xl transition-transform active:scale-95"
                style={{ background: "#ff7fc4", color: "#fff", boxShadow: "0 6px 0 #d3559e", cursor: "pointer" }}
              >
                Home ✨
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Top-level component ---------------------------------------------------

export default function WhaleGame({ onBack }) {
  const [screen, setScreen] = useState("home"); // home | customize | play
  const [look, setLookState] = useState(() => loadLook());
  const [best] = useState(() => loadBest());

  const setLook = (next) => { setLookState(next); saveLook(next); };

  if (screen === "customize") {
    return <CustomizeScreen look={look} setLook={setLook} onDone={() => setScreen("home")} />;
  }
  if (screen === "play") {
    return <GameCanvas look={look} onHome={() => setScreen("home")} />;
  }
  return (
    <HomeScreen
      look={look}
      best={best}
      onPlay={() => { sfxButton(); primeAudio(); setScreen("play"); }}
      onCustomize={() => { sfxButton(); setScreen("customize"); }}
      onBack={onBack}
    />
  );
}
