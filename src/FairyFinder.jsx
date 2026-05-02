import React, { useEffect, useRef, useState } from "react";
import {
  primeAudio,
  isMuted,
  toggleMute,
  sfxJump,
  sfxCollect,
  sfxBonk,
  sfxHurt,
  sfxFairy,
  sfxLevelClear,
  sfxBirdSquawk,
  sfxSquirrelChitter,
  startMusic,
  stopMusic,
  restartMusicIfMuted,
} from "./audio";
import { TouchControls, BackButton } from "./TouchControls.jsx";

// Fairy Finder: first playable version
// Controls: Arrow keys / A-D to move, Space/W/Up to jump, R to restart

const GAME_W = 960;
const GAME_H = 540;
const GRAVITY = 0.65;
const MOVE_SPEED = 3.0;
const JUMP_VELOCITY = -11.5;
const JUMP_CUT = 0.45;
const HANG_GRAVITY = 0.10;
const HANG_VY_WINDOW = 3.5;
const HANG_MAX_FRAMES = 10;
const COYOTE_FRAMES = 6;
const JUMP_BUFFER_FRAMES = 6;
const INV_FRAMES = 45;
const SUPER_JUMP_VELOCITY = -17.5;
const SPRING_AIR_SPEED = 4.6;
const SPRING_HANG_GRAVITY = 0.05;
const SPRING_HANG_VY_WINDOW = 6.5;
const SPRING_HANG_MAX_FRAMES = 18;
const SPRING_LAUNCH_SPEED_MIN = 4.8;
const SPRING_LAUNCH_SPEED_MAX = 6.8;

const levels = [
  {
    id: "home",
    title: "Level 1 — The Living Room Fairy",
    sky: "linear-gradient(#86d5ff, #d8f7ff)",
    ground: "#7b4f2a",
    sign: "Find the hidden fairy behind the houseplants!",
    width: 1920,
    start: { x: 70, y: 390 },
    fairy: { x: 1850, y: 295 },
    platforms: [
      { x: 0, y: 480, w: 1920, h: 60, name: "floor" },
      { x: 175, y: 395, w: 145, h: 22, name: "couch" },
      { x: 390, y: 330, w: 130, h: 20, name: "bookshelf" },
      { x: 600, y: 385, w: 145, h: 22, name: "table" },
      { x: 780, y: 335, w: 120, h: 22, name: "plant shelf" },
      { x: 980, y: 400, w: 150, h: 22, name: "coffee table" },
      { x: 1190, y: 350, w: 160, h: 22, name: "TV stand" },
      { x: 1400, y: 285, w: 130, h: 20, name: "bookshelf" },
      { x: 1580, y: 400, w: 150, h: 22, name: "couch" },
      { x: 1770, y: 340, w: 120, h: 22, name: "plant shelf" },
    ],
    collectibles: [
      { x: 210, y: 350 }, { x: 260, y: 350 }, { x: 430, y: 285 }, { x: 480, y: 285 },
      { x: 640, y: 340 }, { x: 700, y: 340 }, { x: 825, y: 292 },
      { x: 1030, y: 360 }, { x: 1080, y: 360 }, { x: 1250, y: 310 }, { x: 1300, y: 310 },
      { x: 1450, y: 245 }, { x: 1620, y: 360 }, { x: 1810, y: 297 },
    ],
    bugs: [
      { x: 330, y: 448, min: 310, max: 505, vx: 1.1 },
      { x: 710, y: 353, min: 610, max: 735, vx: 0.9 },
      { x: 1200, y: 448, min: 1000, max: 1430, vx: 1.2 },
      { x: 1620, y: 368, min: 1580, max: 1715, vx: 0.9 },
    ],
  },
  {
    id: "school",
    title: "Level 2 — The Schoolyard Fairy",
    sky: "linear-gradient(#7fc7ff, #f4fbff)",
    ground: "#526b31",
    sign: "Hop across desks and find the fairy near the big tree!",
    width: 1920,
    start: { x: 70, y: 390 },
    fairy: { x: 1850, y: 245 },
    platforms: [
      { x: 0, y: 480, w: 1920, h: 60, name: "grass" },
      { x: 150, y: 410, w: 115, h: 20, name: "desk" },
      { x: 325, y: 360, w: 120, h: 20, name: "cubby" },
      { x: 520, y: 405, w: 130, h: 20, name: "bench" },
      { x: 735, y: 315, w: 150, h: 22, name: "tree branch" },
      { x: 950, y: 400, w: 130, h: 20, name: "bench" },
      { x: 1140, y: 340, w: 140, h: 20, name: "cubby" },
      { x: 1330, y: 270, w: 160, h: 22, name: "tree branch" },
      { x: 1540, y: 380, w: 130, h: 20, name: "desk" },
      { x: 1720, y: 295, w: 160, h: 22, name: "tree branch" },
    ],
    collectibles: [
      { x: 185, y: 365 }, { x: 370, y: 315 }, { x: 560, y: 360 }, { x: 610, y: 360 },
      { x: 765, y: 270 }, { x: 815, y: 270 }, { x: 865, y: 270 },
      { x: 990, y: 355 }, { x: 1180, y: 295 }, { x: 1230, y: 295 }, { x: 1390, y: 225 },
      { x: 1440, y: 225 }, { x: 1580, y: 335 }, { x: 1770, y: 250 }, { x: 1820, y: 250 },
    ],
    bugs: [
      { x: 275, y: 448, min: 230, max: 420, vx: 1.3 },
      { x: 590, y: 373, min: 525, max: 645, vx: 0.8 },
      { x: 1100, y: 448, min: 950, max: 1290, vx: 1.4 },
      { x: 1610, y: 358, min: 1540, max: 1665, vx: 0.9 },
    ],
  },
  {
    id: "pond",
    title: "Level 3 — The Pond Fairy",
    sky: "linear-gradient(#4db2ff, #baf0ff)",
    ground: "#375b2b",
    sign: "Cross lily pads and logs to reach the glow by the pond!",
    width: 1920,
    start: { x: 70, y: 390 },
    fairy: { x: 1850, y: 215 },
    platforms: [
      { x: 0, y: 480, w: 1920, h: 60, name: "bank" },
      { x: 140, y: 420, w: 110, h: 18, name: "rock" },
      { x: 315, y: 382, w: 120, h: 18, name: "lily pad" },
      { x: 500, y: 335, w: 135, h: 18, name: "log" },
      { x: 705, y: 300, w: 150, h: 18, name: "dock" },
      { x: 950, y: 360, w: 110, h: 18, name: "rock" },
      { x: 1130, y: 320, w: 140, h: 18, name: "log" },
      { x: 1330, y: 380, w: 130, h: 18, name: "lily pad" },
      { x: 1520, y: 320, w: 150, h: 18, name: "log" },
      { x: 1720, y: 260, w: 160, h: 18, name: "dock" },
    ],
    collectibles: [
      { x: 170, y: 375 }, { x: 350, y: 337 }, { x: 400, y: 337 }, { x: 540, y: 290 },
      { x: 595, y: 290 }, { x: 745, y: 255 }, { x: 815, y: 255 },
      { x: 1000, y: 315 }, { x: 1170, y: 275 }, { x: 1220, y: 275 },
      { x: 1370, y: 335 }, { x: 1560, y: 275 }, { x: 1610, y: 275 },
      { x: 1770, y: 215 }, { x: 1820, y: 215 },
    ],
    bugs: [
      { x: 270, y: 448, min: 210, max: 380, vx: 1.2 },
      { x: 565, y: 303, min: 505, max: 630, vx: 1.0 },
      { x: 1100, y: 448, min: 950, max: 1300, vx: 1.3 },
      { x: 1550, y: 308, min: 1520, max: 1660, vx: 0.9 },
    ],
  },
  {
    id: "park",
    title: "Level 4 — The Park Fairy",
    sky: "linear-gradient(#60b8ff, #c8f0a0)",
    ground: "#4a7c2f",
    sign: "Watch out for squirrels! Find the fairy by the fountain.",
    width: 2400,
    start: { x: 70, y: 390 },
    fairy: { x: 2330, y: 230 },
    platforms: [
      { x: 0, y: 480, w: 2400, h: 60, name: "grass" },
      { x: 180, y: 410, w: 120, h: 20, name: "bench" },
      { x: 360, y: 355, w: 130, h: 20, name: "planter" },
      { x: 550, y: 415, w: 110, h: 20, name: "bench" },
      { x: 720, y: 350, w: 140, h: 22, name: "tree branch" },
      { x: 900, y: 290, w: 130, h: 20, name: "tree branch" },
      { x: 1080, y: 400, w: 120, h: 20, name: "bench" },
      { x: 1250, y: 335, w: 150, h: 22, name: "tree branch" },
      { x: 1450, y: 270, w: 140, h: 20, name: "planter" },
      { x: 1640, y: 380, w: 130, h: 20, name: "bench" },
      { x: 1820, y: 310, w: 160, h: 22, name: "tree branch" },
      { x: 2040, y: 250, w: 140, h: 20, name: "planter" },
      { x: 2220, y: 300, w: 150, h: 22, name: "fountain ledge" },
    ],
    collectibles: [
      { x: 210, y: 365 }, { x: 395, y: 310 }, { x: 585, y: 370 },
      { x: 760, y: 305 }, { x: 810, y: 305 }, { x: 940, y: 245 }, { x: 990, y: 245 },
      { x: 1120, y: 355 }, { x: 1290, y: 290 }, { x: 1490, y: 225 }, { x: 1540, y: 225 },
      { x: 1680, y: 335 }, { x: 1860, y: 265 }, { x: 2080, y: 205 },
      { x: 2260, y: 255 }, { x: 2310, y: 255 },
    ],
    bugs: [
      { x: 440, y: 448, min: 380, max: 600, vx: 1.3 },
      { x: 1160, y: 448, min: 1000, max: 1310, vx: 1.5 },
      { x: 1900, y: 448, min: 1700, max: 2100, vx: 1.6 },
    ],
    squirrels: [
      { x: 590, y: 370, minY: 265, maxY: 454, vy: 2.2, pauseTimer: 0, climbing: true },
      { x: 990, y: 310, minY: 243, maxY: 454, vy: 2.8, pauseTimer: 30, climbing: true },
      { x: 1390, y: 390, minY: 257, maxY: 454, vy: 3.0, pauseTimer: 0, climbing: true },
      { x: 1790, y: 340, minY: 258, maxY: 454, vy: 3.2, pauseTimer: 20, climbing: true },
    ],
    birds: [],
  },
  {
    id: "beach",
    title: "Level 5 — The Beach Fairy",
    sky: "linear-gradient(#1e90ff, #fffbe0)",
    ground: "#d4a855",
    sign: "Seagulls swoop! Dodge them and find the fairy on the dunes.",
    width: 2400,
    start: { x: 70, y: 390 },
    fairy: { x: 2340, y: 200 },
    platforms: [
      { x: 0, y: 480, w: 2400, h: 60, name: "sand" },
      { x: 160, y: 420, w: 120, h: 18, name: "sandcastle" },
      { x: 340, y: 370, w: 130, h: 18, name: "rock" },
      { x: 530, y: 415, w: 110, h: 18, name: "sandcastle" },
      { x: 710, y: 355, w: 150, h: 18, name: "pier board" },
      { x: 920, y: 295, w: 140, h: 18, name: "pier board" },
      { x: 1110, y: 385, w: 130, h: 18, name: "rock" },
      { x: 1300, y: 320, w: 140, h: 18, name: "pier board" },
      { x: 1510, y: 260, w: 150, h: 18, name: "pier board" },
      { x: 1720, y: 355, w: 130, h: 18, name: "rock" },
      { x: 1900, y: 285, w: 150, h: 18, name: "pier board" },
      { x: 2100, y: 230, w: 140, h: 18, name: "pier board" },
      { x: 2270, y: 265, w: 160, h: 18, name: "dune top" },
    ],
    collectibles: [
      { x: 190, y: 375 }, { x: 375, y: 325 }, { x: 565, y: 370 },
      { x: 750, y: 310 }, { x: 800, y: 310 }, { x: 960, y: 250 }, { x: 1010, y: 250 },
      { x: 1150, y: 340 }, { x: 1340, y: 275 }, { x: 1550, y: 215 }, { x: 1600, y: 215 },
      { x: 1760, y: 310 }, { x: 1940, y: 240 }, { x: 2140, y: 185 },
      { x: 2310, y: 220 }, { x: 2360, y: 220 },
    ],
    bugs: [
      { x: 460, y: 448, min: 380, max: 670, vx: 1.4 },
      { x: 1200, y: 448, min: 1050, max: 1400, vx: 1.7 },
      { x: 1900, y: 353, min: 1720, max: 2040, vx: 1.5 },
    ],
    squirrels: [],
    birds: [
      { x: 400, baseY: 200, vy: 0, min: 200, max: 750, vx: 1.8, phase: 0.0 },
      { x: 1000, baseY: 180, vy: 0, min: 850, max: 1400, vx: 2.0, phase: 1.2 },
      { x: 1600, baseY: 160, vy: 0, min: 1400, max: 2000, vx: 2.2, phase: 2.4 },
      { x: 2100, baseY: 175, vy: 0, min: 1900, max: 2380, vx: 2.4, phase: 0.8 },
    ],
  },
  {
    id: "forest",
    title: "Level 6 — The Deep Forest Fairy",
    sky: "linear-gradient(#1a2a4a, #2d5a1b)",
    ground: "#2d5a1b",
    sign: "Birds AND squirrels! The fairy hides deep in the canopy.",
    width: 2880,
    start: { x: 70, y: 390 },
    fairy: { x: 2820, y: 165 },
    platforms: [
      { x: 0, y: 480, w: 2880, h: 60, name: "forest floor" },
      { x: 150, y: 415, w: 120, h: 22, name: "root" },
      { x: 330, y: 360, w: 130, h: 22, name: "tree branch" },
      { x: 530, y: 310, w: 140, h: 22, name: "tree branch" },
      { x: 720, y: 400, w: 120, h: 22, name: "root" },
      { x: 890, y: 340, w: 150, h: 22, name: "tree branch" },
      { x: 1090, y: 275, w: 140, h: 22, name: "tree branch" },
      { x: 1290, y: 395, w: 120, h: 22, name: "root" },
      { x: 1460, y: 330, w: 150, h: 22, name: "tree branch" },
      { x: 1660, y: 265, w: 140, h: 22, name: "tree branch" },
      { x: 1860, y: 210, w: 150, h: 22, name: "tree branch" },
      { x: 2060, y: 350, w: 130, h: 22, name: "root" },
      { x: 2230, y: 280, w: 150, h: 22, name: "tree branch" },
      { x: 2420, y: 220, w: 150, h: 22, name: "tree branch" },
      { x: 2620, y: 195, w: 160, h: 22, name: "tree branch" },
    ],
    collectibles: [
      { x: 180, y: 370 }, { x: 365, y: 315 }, { x: 565, y: 265 },
      { x: 760, y: 355 }, { x: 930, y: 295 }, { x: 980, y: 295 },
      { x: 1130, y: 230 }, { x: 1180, y: 230 }, { x: 1330, y: 350 },
      { x: 1500, y: 285 }, { x: 1700, y: 220 }, { x: 1750, y: 220 },
      { x: 1900, y: 165 }, { x: 2100, y: 305 }, { x: 2270, y: 235 },
      { x: 2460, y: 175 }, { x: 2510, y: 175 }, { x: 2660, y: 150 },
    ],
    bugs: [
      { x: 400, y: 448, min: 310, max: 620, vx: 1.5 },
      { x: 960, y: 313, min: 895, max: 1220, vx: 1.4 },
      { x: 1600, y: 448, min: 1390, max: 1840, vx: 1.8 },
      { x: 2280, y: 258, min: 2235, max: 2560, vx: 1.6 },
    ],
    squirrels: [
      { x: 190, y: 380, minY: 235, maxY: 454, vy: 3.2, pauseTimer: 0, climbing: true },
      { x: 690, y: 300, minY: 225, maxY: 454, vy: 3.5, pauseTimer: 15, climbing: true },
      { x: 1440, y: 280, minY: 217, maxY: 454, vy: 3.5, pauseTimer: 20, climbing: true },
      { x: 2440, y: 400, minY: 213, maxY: 454, vy: 3.8, pauseTimer: 0, climbing: true },
    ],
    birds: [
      { x: 500, baseY: 190, vy: 0, min: 300, max: 900, vx: 2.2, phase: 0.5 },
      { x: 1150, baseY: 170, vy: 0, min: 950, max: 1550, vx: 2.5, phase: 1.8 },
      { x: 1800, baseY: 155, vy: 0, min: 1550, max: 2150, vx: 2.8, phase: 0.3 },
      { x: 2400, baseY: 160, vy: 0, min: 2150, max: 2820, vx: 3.0, phase: 2.1 },
    ],
  },
  {
    id: "nyc",
    title: "Level 7 — NYC Rooftop Fairy",
    sky: "linear-gradient(#7aa7ff, #e9f1ff)",
    ground: "#4b5563",
    sign: "Climb the scaffolding tower! Hit askew planks for super jumps.",
    width: 1920,
    height: 2200,
    vertical: true,
    start: { x: 120, y: 2060 },
    fairy: { x: 840, y: 60 },
    platforms: [
      { x: 0,   y: 2140, w: 1920, h: 60, name: "street" },
      { x: 50,  y: 2055, w: 150,  h: 22, name: "dumpster" },
      // Validated zig-zag: adjacent steps do not overlap in X, spring lanes are clear.
      { x: 260, y: 1970, w: 200, h: 20, name: "scaffold ledge" },
      { x: 520, y: 1880, w: 200, h: 20, name: "scaffold ledge" },
      { x: 280, y: 1790, w: 200, h: 20, name: "scaffold ledge" },
      { x: 540, y: 1700, w: 200, h: 20, name: "scaffold ledge" },
      { x: 300, y: 1610, w: 200, h: 20, name: "window ledge" },
      { x: 560, y: 1520, w: 200, h: 20, name: "scaffold ledge" }, // SPRING 1 host

      { x: 260, y: 1330, w: 200, h: 20, name: "scaffold ledge" },
      { x: 560, y: 1240, w: 200, h: 20, name: "scaffold ledge" },
      { x: 280, y: 1150, w: 200, h: 20, name: "window ledge" },
      { x: 540, y: 1060, w: 200, h: 20, name: "scaffold ledge" },
      { x: 300, y: 970,  w: 200, h: 20, name: "scaffold ledge" },
      { x: 560, y: 880,  w: 200, h: 20, name: "scaffold ledge" }, // SPRING 2 host

      { x: 250, y: 700,  w: 200, h: 20, name: "scaffold ledge" },
      { x: 560, y: 610,  w: 200, h: 20, name: "scaffold ledge" },
      { x: 270, y: 520,  w: 200, h: 20, name: "window ledge" },
      { x: 530, y: 430,  w: 200, h: 20, name: "scaffold ledge" }, // SPRING 3 host

      { x: 250, y: 250,  w: 200, h: 20, name: "window ledge" },
      { x: 560, y: 180,  w: 200, h: 20, name: "window ledge" },
      { x: 720, y: 120,  w: 240, h: 24, name: "roof lip" },
    ],
    springboards: [
      { x: 560, y: 1496, w: 72, h: 14, name: "askew plank", launchToX: 360 },
      { x: 560, y: 856,  w: 72, h: 14, name: "askew plank", launchToX: 350 },
      { x: 530, y: 406,  w: 72, h: 14, name: "askew plank", launchToX: 350 },
    ],
    collectibles: [
      { x: 300, y: 1920 }, { x: 580, y: 1825 }, { x: 810, y: 1730 },
      { x: 580, y: 1635 }, { x: 300, y: 1540 }, { x: 580, y: 1445 },
      { x: 810, y: 1350 }, { x: 580, y: 1195 }, { x: 300, y: 1100 },
      { x: 580, y: 1005 }, { x: 810, y: 910  }, { x: 580, y: 815  },
      { x: 530, y: 650  }, { x: 780, y: 560  }, { x: 550, y: 470  },
      { x: 790, y: 380  }, { x: 820, y: 160  }, { x: 840, y: 95   },
      { x: 840, y: 60   },
    ],
    bugs: [
      { x: 760, y: 1753, min: 740, max: 900, vx: 1.2 },
      { x: 460, y: 948,  min: 440, max: 600, vx: 1.3 },
      { x: 250, y: 743,  min: 230, max: 390, vx: 1.4 },
      { x: 730, y: 408,  min: 710, max: 870, vx: 1.5 },
    ],
    squirrels: [],
    birds: [
      { x: 600, baseY: 980, vy: 0, min: 430, max: 900, vx: 2.1, phase: 0.4 },
      { x: 1200, baseY: 640, vy: 0, min: 930, max: 1470, vx: 2.4, phase: 1.3 },
    ],
  },
];

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

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
    ctx.arc(p.x, p.y, Math.max(0.3, size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMountainBackdrop(ctx, level, cameraX) {
  // Far range — dusty blue silhouette, slow parallax
  ctx.save();
  ctx.translate(-cameraX * 0.35, 0);
  ctx.fillStyle = level.id === "pond" ? "#5b88c0" : "#7290bf";
  ctx.beginPath();
  ctx.moveTo(0, GAME_H);
  for (let x = 0; x <= level.width + 100; x += 50) {
    const h = 220 + Math.sin(x * 0.0083) * 50 + Math.sin(x * 0.025 + 0.7) * 25;
    ctx.lineTo(x, GAME_H - h);
  }
  ctx.lineTo(level.width + 100, GAME_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Near range — tropical green ridges, faster parallax
  ctx.save();
  ctx.translate(-cameraX * 0.55, 0);
  ctx.fillStyle = level.id === "pond" ? "#4f7e3a" : "#3f6b32";
  ctx.beginPath();
  ctx.moveTo(0, GAME_H);
  for (let x = 0; x <= level.width + 100; x += 40) {
    const h = 130 + Math.sin(x * 0.012 + 1.7) * 35 + Math.sin(x * 0.04 + 2) * 18;
    ctx.lineTo(x, GAME_H - h);
  }
  ctx.lineTo(level.width + 100, GAME_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx, text, x, y, size = 18, color = "white", align = "left") {
  ctx.save();
  ctx.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawDad(ctx) {
  // legs
  ctx.strokeStyle = "#27364a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-8, 44); ctx.lineTo(-12, 66);
  ctx.moveTo(8, 44); ctx.lineTo(11, 66);
  ctx.stroke();

  // shoes
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(-18, 64, 15, 5);
  ctx.fillRect(4, 64, 15, 5);

  // shirt
  ctx.fillStyle = "#0ea5e9";
  drawRoundedRect(ctx, -17, 25, 34, 25, 8);
  ctx.fill();

  // arms (one extended in shaka pose)
  ctx.strokeStyle = "#8b5e3c";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-17, 31); ctx.lineTo(-30, 42);
  ctx.moveTo(17, 31); ctx.lineTo(31, 23);
  ctx.stroke();

  // head
  ctx.fillStyle = "#9a6a45";
  ctx.beginPath();
  ctx.arc(0, 16, 15, 0, Math.PI * 2);
  ctx.fill();

  // beard
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(0, 20, 13, 0.05, Math.PI - 0.05);
  ctx.fill();

  // short dark hair
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(0, 14, 15, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();

  // sunglasses
  ctx.fillStyle = "#111827";
  ctx.fillRect(-10, 12, 8, 5);
  ctx.fillRect(3, 12, 8, 5);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(-9, 13, 6, 3);
  ctx.fillRect(4, 13, 6, 3);
}

function drawBigSis(ctx) {
  // back hair (long, behind shoulders)
  ctx.fillStyle = "#2b1810";
  ctx.beginPath();
  ctx.ellipse(0, 28, 17, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  ctx.fillStyle = "#f4d4b0";
  ctx.fillRect(-7, 54, 5, 11);
  ctx.fillRect(2, 54, 5, 11);

  // socks
  ctx.fillStyle = "#e0f2fe";
  ctx.fillRect(-8, 60, 7, 4);
  ctx.fillRect(1, 60, 7, 4);

  // shoes (white sneakers)
  ctx.fillStyle = "#f8fafc";
  drawRoundedRect(ctx, -10, 63, 11, 5, 2);
  ctx.fill();
  drawRoundedRect(ctx, -1, 63, 11, 5, 2);
  ctx.fill();

  // dress (A-line, light blue)
  ctx.fillStyle = "#7dd3fc";
  ctx.beginPath();
  ctx.moveTo(-12, 26);
  ctx.lineTo(12, 26);
  ctx.lineTo(20, 56);
  ctx.lineTo(-20, 56);
  ctx.closePath();
  ctx.fill();

  // dress hem trim
  ctx.fillStyle = "#bae6fd";
  ctx.beginPath();
  ctx.moveTo(-20, 53);
  ctx.lineTo(20, 53);
  ctx.lineTo(20, 56);
  ctx.lineTo(-20, 56);
  ctx.closePath();
  ctx.fill();

  // dress floral spots
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (const [sx, sy] of [[-8, 33], [6, 36], [-3, 42], [11, 44], [-12, 47], [4, 50]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // arms (skin tone)
  ctx.strokeStyle = "#f4d4b0";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12, 30); ctx.lineTo(-17, 42);
  ctx.moveTo(12, 30); ctx.lineTo(17, 42);
  ctx.stroke();
  ctx.lineCap = "butt";

  // head
  ctx.fillStyle = "#f4d4b0";
  ctx.beginPath();
  ctx.arc(0, 14, 13, 0, Math.PI * 2);
  ctx.fill();

  // hair top + bangs
  ctx.fillStyle = "#2b1810";
  ctx.beginPath();
  ctx.arc(0, 11, 13, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  drawRoundedRect(ctx, -11, 7, 22, 6, 3);
  ctx.fill();

  // side hair locks down past cheeks
  ctx.beginPath();
  ctx.moveTo(-13, 14);
  ctx.quadraticCurveTo(-15, 22, -12, 28);
  ctx.lineTo(-9, 28);
  ctx.quadraticCurveTo(-11, 22, -10, 14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13, 14);
  ctx.quadraticCurveTo(15, 22, 12, 28);
  ctx.lineTo(9, 28);
  ctx.quadraticCurveTo(11, 22, 10, 14);
  ctx.fill();

  // pink hibiscus hair clip
  ctx.save();
  ctx.translate(-9, 8);
  ctx.fillStyle = "#ec4899";
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -2.6, 1.6, 2.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fef08a";
  ctx.beginPath();
  ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // eyes
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(-4.5, 15, 1.8, 0, Math.PI * 2);
  ctx.arc(4.5, 15, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-4, 14.4, 0.6, 0, Math.PI * 2);
  ctx.arc(5, 14.4, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // cheek blush
  ctx.fillStyle = "rgba(251,113,133,.5)";
  ctx.beginPath();
  ctx.arc(-7, 19, 1.8, 0, Math.PI * 2);
  ctx.arc(7, 19, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // smile
  ctx.strokeStyle = "#7c2d12";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 20, 2.5, 0.3, Math.PI - 0.3);
  ctx.stroke();
}

function drawLilSis(ctx) {
  // tiny back hair tuft (mostly covered by pigtails)
  ctx.fillStyle = "#8b3a1f";
  ctx.beginPath();
  ctx.ellipse(0, 22, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  ctx.fillStyle = "#f8e0c0";
  ctx.fillRect(-7, 54, 5, 11);
  ctx.fillRect(2, 54, 5, 11);

  // socks (pink)
  ctx.fillStyle = "#fce7f3";
  ctx.fillRect(-8, 60, 7, 4);
  ctx.fillRect(1, 60, 7, 4);

  // shoes
  ctx.fillStyle = "#f8fafc";
  drawRoundedRect(ctx, -10, 63, 11, 5, 2);
  ctx.fill();
  drawRoundedRect(ctx, -1, 63, 11, 5, 2);
  ctx.fill();

  // dress (A-line, pink, slightly puffier)
  ctx.fillStyle = "#fbcfe8";
  ctx.beginPath();
  ctx.moveTo(-12, 28);
  ctx.lineTo(12, 28);
  ctx.lineTo(22, 56);
  ctx.lineTo(-22, 56);
  ctx.closePath();
  ctx.fill();

  // hem
  ctx.fillStyle = "#fda4af";
  ctx.beginPath();
  ctx.moveTo(-22, 53);
  ctx.lineTo(22, 53);
  ctx.lineTo(22, 56);
  ctx.lineTo(-22, 56);
  ctx.closePath();
  ctx.fill();

  // floral spots with yellow centers
  for (const [sx, sy] of [[-9, 35], [8, 38], [-3, 44], [13, 46], [-15, 48], [4, 51]]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sx, sy, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(sx, sy, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // arms
  ctx.strokeStyle = "#f8e0c0";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12, 32); ctx.lineTo(-16, 44);
  ctx.moveTo(12, 32); ctx.lineTo(16, 44);
  ctx.stroke();
  ctx.lineCap = "butt";

  // head (slightly bigger ratio for younger look)
  ctx.fillStyle = "#f8e0c0";
  ctx.beginPath();
  ctx.arc(0, 14, 14, 0, Math.PI * 2);
  ctx.fill();

  // hair top
  ctx.fillStyle = "#8b3a1f";
  ctx.beginPath();
  ctx.arc(0, 11, 14, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  // bangs
  drawRoundedRect(ctx, -12, 6, 24, 8, 4);
  ctx.fill();

  // pigtail puffs
  ctx.beginPath();
  ctx.arc(-15, 14, 5, 0, Math.PI * 2);
  ctx.arc(15, 14, 5, 0, Math.PI * 2);
  ctx.fill();

  // pigtail ribbons
  ctx.fillStyle = "#ec4899";
  ctx.beginPath();
  ctx.ellipse(-14, 11, 2, 1.2, 0, 0, Math.PI * 2);
  ctx.ellipse(14, 11, 2, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyes (bigger and rounder)
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(-4.5, 16, 2.2, 0, Math.PI * 2);
  ctx.arc(4.5, 16, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-4, 15.3, 0.8, 0, Math.PI * 2);
  ctx.arc(5, 15.3, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // cheek blush
  ctx.fillStyle = "rgba(251,113,133,.55)";
  ctx.beginPath();
  ctx.arc(-7, 20, 2.2, 0, Math.PI * 2);
  ctx.arc(7, 20, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // little open smile
  ctx.strokeStyle = "#9f1239";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 21, 2.5, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawMom(ctx) {
  // back hair (medium length, frames the face)
  ctx.fillStyle = "#5b3920";
  ctx.beginPath();
  ctx.ellipse(0, 22, 17, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs (jeans)
  ctx.strokeStyle = "#1e3a5f";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-7, 44); ctx.lineTo(-10, 66);
  ctx.moveTo(7, 44); ctx.lineTo(10, 66);
  ctx.stroke();

  // shoes
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(-16, 64, 13, 5);
  ctx.fillRect(3, 64, 13, 5);

  // cream top
  ctx.fillStyle = "#fef3c7";
  drawRoundedRect(ctx, -16, 25, 32, 25, 7);
  ctx.fill();

  // top hem trim
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(-16, 47, 32, 3);

  // arms
  ctx.strokeStyle = "#e8c4a0";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-16, 31); ctx.lineTo(-22, 44);
  ctx.moveTo(16, 31); ctx.lineTo(22, 44);
  ctx.stroke();
  ctx.lineCap = "butt";

  // head
  ctx.fillStyle = "#e8c4a0";
  ctx.beginPath();
  ctx.arc(0, 16, 14, 0, Math.PI * 2);
  ctx.fill();

  // hair top
  ctx.fillStyle = "#5b3920";
  ctx.beginPath();
  ctx.arc(0, 13, 14, Math.PI * 0.92, Math.PI * 2.08);
  ctx.fill();

  // side hair locks framing the face
  ctx.beginPath();
  ctx.moveTo(-14, 14);
  ctx.quadraticCurveTo(-16, 22, -13, 28);
  ctx.lineTo(-10, 28);
  ctx.quadraticCurveTo(-12, 22, -11, 14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.quadraticCurveTo(16, 22, 13, 28);
  ctx.lineTo(10, 28);
  ctx.quadraticCurveTo(12, 22, 11, 14);
  ctx.fill();

  // small earrings
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(-13, 22, 1.2, 0, Math.PI * 2);
  ctx.arc(13, 22, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(-5, 16, 1.8, 0, Math.PI * 2);
  ctx.arc(5, 16, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-4.5, 15.4, 0.6, 0, Math.PI * 2);
  ctx.arc(5.5, 15.4, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // cheek blush
  ctx.fillStyle = "rgba(244,114,182,.35)";
  ctx.beginPath();
  ctx.arc(-7, 21, 1.6, 0, Math.PI * 2);
  ctx.arc(7, 21, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // smile
  ctx.strokeStyle = "#7c2d12";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 21, 3, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

const CHARACTERS = [
  { id: "big",  name: "Big Sis", draw: drawBigSis },
  { id: "lil",  name: "Lil Sis", draw: drawLilSis },
  { id: "dad",  name: "Dad",     draw: drawDad },
  { id: "mom",  name: "Mom",     draw: drawMom },
];

function loadCharacterIndex() {
  try {
    const v = parseInt(localStorage.getItem("fairy-finder-character"), 10);
    if (Number.isInteger(v) && v >= 0 && v < CHARACTERS.length) return v;
  } catch {}
  return 0;
}

function saveCharacterIndex(i) {
  try { localStorage.setItem("fairy-finder-character", String(i)); } catch {}
}

function drawFamilyPlayer(ctx, p, frame, character) {
  if (p.inv > 0 && Math.floor(frame / 4) % 2 === 0) return;
  const cx = p.x + p.w / 2;
  const bob = Math.sin(frame / 8) * (Math.abs(p.vx) > 0.2 ? 1.8 : 0.7);

  ctx.save();
  ctx.translate(cx, p.y + bob);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(0, p.h + 4, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  character.draw(ctx);

  ctx.restore();
}

function drawCharacterPreview(ctx, character, cx, topY, frame, selected) {
  if (selected) {
    const grad = ctx.createRadialGradient(cx, topY + 35, 5, cx, topY + 35, 75);
    grad.addColorStop(0, "rgba(250,204,21,.45)");
    grad.addColorStop(0.7, "rgba(250,204,21,.12)");
    grad.addColorStop(1, "rgba(250,204,21,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 75, topY - 30, 150, 140);
  }
  const fakeP = { x: cx - 17, y: topY, w: 34, h: 70, vx: 0, vy: 0, inv: 0 };
  drawFamilyPlayer(ctx, fakeP, frame, character);
}

function drawCollectible(ctx, c, frame) {
  const y = c.y + Math.sin(frame / 12 + c.x) * 4;
  ctx.save();
  ctx.translate(c.x, y);
  ctx.fillStyle = "#facc15";
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -8, 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fb923c";
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBug(ctx, b, frame) {
  ctx.save();
  ctx.translate(b.x + 14, b.y + 10);
  ctx.fillStyle = "#84cc16";
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#bef264";
  ctx.beginPath();
  ctx.arc(8, -2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.fillRect(9, -5, 2, 2);
  ctx.strokeStyle = "#365314";
  ctx.lineWidth = 2;
  const wiggle = Math.sin(frame / 5) * 3;
  ctx.beginPath();
  ctx.moveTo(-8, 7); ctx.lineTo(-14, 12 + wiggle);
  ctx.moveTo(0, 8); ctx.lineTo(0, 14 - wiggle);
  ctx.moveTo(8, 6); ctx.lineTo(14, 11 + wiggle);
  ctx.stroke();
  ctx.restore();
}

function drawBird(ctx, b, frame) {
  // b.x, b.y (computed by caller with sine wave), b.vx for facing
  ctx.save();
  ctx.translate(b.x + 14, b.y + 10);
  if (b.vx < 0) ctx.scale(-1, 1);
  const flapAngle = Math.sin(frame / 5) * 0.55;

  // body
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // wing
  ctx.save();
  ctx.rotate(flapAngle);
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.ellipse(-5, 0, 16, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // tail
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(-22, -3);
  ctx.lineTo(-22, 4);
  ctx.closePath();
  ctx.fill();

  // head
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(12, -3, 7, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(18, -3);
  ctx.lineTo(26, -1);
  ctx.lineTo(18, 1);
  ctx.closePath();
  ctx.fill();

  // eye
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(14, -5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(14.5, -5.5, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSquirrel(ctx, s, frame) {
  ctx.save();
  ctx.translate(s.x + (s.climbing ? s.w / 2 : 12), s.y + (s.climbing ? s.h / 2 : 8));
  if (s.climbing) {
    // rotate so squirrel faces up (head pointing in direction of travel)
    ctx.rotate(s.vy <= 0 ? -Math.PI / 2 : Math.PI / 2);
  } else if (s.vx < 0) {
    ctx.scale(-1, 1);
  }
  const scurry = s.pauseTimer > 0 ? 0 : Math.sin(frame / 4) * 2;

  // fluffy tail (behind body)
  ctx.fillStyle = "#92400e";
  ctx.beginPath();
  ctx.ellipse(-8, -10 + scurry, 7, 14, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.ellipse(-8, -10 + scurry, 4, 10, -0.6, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = "#92400e";
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 8, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // legs
  ctx.strokeStyle = "#78350f";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-5, 6); ctx.lineTo(-7, 14 + scurry);
  ctx.moveTo(5, 6); ctx.lineTo(7, 14 - scurry);
  ctx.stroke();

  // head
  ctx.fillStyle = "#b45309";
  ctx.beginPath();
  ctx.arc(10, -5, 7, 0, Math.PI * 2);
  ctx.fill();

  // ear
  ctx.fillStyle = "#92400e";
  ctx.beginPath();
  ctx.arc(14, -11, 3, 0, Math.PI * 2);
  ctx.fill();

  // eye
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(13, -6, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(13.5, -6.5, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // nose
  ctx.fillStyle = "#f9a8d4";
  ctx.beginPath();
  ctx.arc(17, -4, 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function getSpringDirection(s) {
  if (Number.isFinite(s.launchToX)) return s.launchToX >= (s.x + s.w / 2) ? 1 : -1;
  return s.tilt === -1 ? -1 : 1;
}

function drawSpringboard(ctx, s, frame) {
  const dir = getSpringDirection(s);
  const wobble = Math.sin(frame / 7 + s.x * 0.01) * 0.05;
  ctx.save();
  ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
  ctx.rotate(0.32 * dir + wobble * dir);
  drawRoundedRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, 4);
  ctx.fillStyle = "#f59e0b";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.fillRect(-s.w / 2 + 5, -s.h / 2 + 2, s.w - 10, 3);
  ctx.restore();
}

function drawFairy(ctx, f, frame) {
  const glow = 12 + Math.sin(frame / 8) * 5;
  ctx.save();
  ctx.translate(f.x, f.y + Math.sin(frame / 15) * 5);
  const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 45 + glow);
  g.addColorStop(0, "rgba(255,255,255,.95)");
  g.addColorStop(0.35, "rgba(250,204,21,.75)");
  g.addColorStop(1, "rgba(250,204,21,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 48 + glow, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(191,219,254,.85)";
  ctx.beginPath();
  ctx.ellipse(-12, -4, 13, 22, -0.5, 0, Math.PI * 2);
  ctx.ellipse(12, -4, 13, 22, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f9a8d4";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.arc(0, -11, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNYCBackdrop(ctx, level, cameraY) {
  const cityHeight = level.height || GAME_H;
  ctx.save();
  ctx.translate(0, -cameraY * 0.25);
  const grad = ctx.createLinearGradient(0, 0, 0, cityHeight);
  grad.addColorStop(0, "#7aa7ff");
  grad.addColorStop(1, "#dbeafe");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, level.width, cityHeight);

  ctx.fillStyle = "rgba(30,41,59,.35)";
  for (let x = 40; x < level.width; x += 140) {
    const h = 700 + (x % 280) + (x % 5) * 60;
    ctx.fillRect(x, cityHeight - h - 60, 110, h);
  }
  ctx.restore();
}

function drawScene(ctx, level, game, frame) {
  ctx.clearRect(0, 0, GAME_W, GAME_H);

  // 1) Sky (no scroll)
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
  if (level.id === "nyc") {
    grad.addColorStop(0, "#7aa7ff"); grad.addColorStop(1, "#e9f1ff");
  } else if (level.id === "pond") {
    grad.addColorStop(0, "#38bdf8"); grad.addColorStop(1, "#d9f99d");
  } else if (level.id === "school") {
    grad.addColorStop(0, "#93c5fd"); grad.addColorStop(1, "#fef9c3");
  } else if (level.id === "park") {
    grad.addColorStop(0, "#60b8ff"); grad.addColorStop(1, "#d4f5a0");
  } else if (level.id === "beach") {
    grad.addColorStop(0, "#1e90ff"); grad.addColorStop(1, "#fffbe0");
  } else if (level.id === "forest") {
    grad.addColorStop(0, "#1a2a4a"); grad.addColorStop(1, "#2d5a1b");
  } else {
    grad.addColorStop(0, "#7dd3fc"); grad.addColorStop(1, "#fde68a");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // 2) Parallax clouds (0.3x camera)
  ctx.save();
  if (level.vertical) ctx.translate(0, -game.cameraY * 0.3);
  else ctx.translate(-game.cameraX * 0.3, 0);
  ctx.fillStyle = "rgba(255,255,255,.75)";
  const cloudSpacing = 200;
  const cloudCount = Math.ceil(level.width / cloudSpacing) + 2;
  for (let i = 0; i < cloudCount; i++) {
    const x = i * cloudSpacing + (frame * 0.15) % cloudSpacing - 80;
    const y = 90 + (i % 3) * 35;
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.arc(x + 25, y + 8, 18, 0, Math.PI * 2);
    ctx.arc(x - 28, y + 12, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 2b) Mountain backdrop for outdoor levels (its own parallax inside)
  if (level.id === "nyc") {
    drawNYCBackdrop(ctx, level, game.cameraY || 0);
  } else if (level.id !== "home") {
    drawMountainBackdrop(ctx, level, game.cameraX);
  }

  // 3) World layer (full camera scroll)
  ctx.save();
  if (level.vertical) ctx.translate(0, -(game.cameraY || 0));
  else ctx.translate(-game.cameraX, 0);

  if (level.id === "home") {
    for (const baseX of [0, 960]) {
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.fillRect(55 + baseX, 145, 95, 85);
      ctx.fillRect(690 + baseX, 130, 115, 100);
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(70 + baseX, 160, 25, 25); ctx.fillRect(105 + baseX, 160, 25, 25);
      ctx.fillRect(705 + baseX, 145, 30, 30); ctx.fillRect(750 + baseX, 145, 30, 30);
    }
  } else if (level.id === "school") {
    ctx.fillStyle = "#f97316";
    ctx.fillRect(55, 185, 180, 120);
    ctx.fillStyle = "#eab308";
    ctx.fillRect(85, 215, 35, 35); ctx.fillRect(135, 215, 35, 35); ctx.fillRect(185, 215, 35, 35);
    ctx.fillStyle = "#14532d";
    ctx.beginPath(); ctx.arc(780, 220, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f"; ctx.fillRect(765, 245, 25, 235);
    ctx.fillStyle = "#14532d";
    ctx.beginPath(); ctx.arc(1200, 200, 58, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f"; ctx.fillRect(1188, 230, 22, 250);
    ctx.fillStyle = "#14532d";
    ctx.beginPath(); ctx.arc(1700, 215, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f"; ctx.fillRect(1685, 245, 25, 235);
  } else if (level.id === "pond") {
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(0, 430, level.width, 70);
    ctx.fillStyle = "rgba(255,255,255,.3)";
    for (let x = 0; x < level.width; x += 55) ctx.fillRect(x + ((frame / 2) % 55), 455, 28, 3);
    ctx.fillStyle = "#14532d";
    ctx.beginPath(); ctx.arc(780, 225, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f"; ctx.fillRect(770, 285, 20, 145);
    ctx.fillStyle = "#14532d";
    ctx.beginPath(); ctx.arc(1450, 230, 65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f"; ctx.fillRect(1439, 295, 22, 135);
  } else if (level.id === "park") {
    // fountain
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath(); ctx.ellipse(2200, 460, 60, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#bae6fd";
    ctx.fillRect(2195, 380, 10, 80);
    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath(); ctx.arc(2200, 370, 18, 0, Math.PI * 2); ctx.fill();
    // park trees
    for (const [tx, ty, r] of [[600, 210, 65], [1000, 195, 58], [1400, 205, 62], [1800, 200, 68], [2100, 215, 55]]) {
      ctx.fillStyle = "#15803d";
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#166534";
      ctx.beginPath(); ctx.arc(tx - r * 0.3, ty - r * 0.2, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#78350f"; ctx.fillRect(tx - 11, ty + r - 10, 22, 480 - (ty + r - 10));
    }
  } else if (level.id === "beach") {
    // sea
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(0, 390, level.width, 90);
    ctx.fillStyle = "rgba(255,255,255,.25)";
    for (let x = 0; x < level.width; x += 70) ctx.fillRect(x + ((frame / 2) % 70), 410, 38, 4);
    // pier posts
    for (let px = 650; px < 2000; px += 130) {
      ctx.fillStyle = "#78350f";
      ctx.fillRect(px, 340, 12, 140);
    }
    // sand dunes
    ctx.fillStyle = "#d4a855";
    ctx.beginPath();
    ctx.moveTo(0, 480);
    for (let x = 0; x <= level.width; x += 40) {
      const dy = Math.sin(x * 0.006) * 20 + Math.sin(x * 0.015 + 1) * 10;
      ctx.lineTo(x, 465 + dy);
    }
    ctx.lineTo(level.width, 480); ctx.closePath(); ctx.fill();
  } else if (level.id === "forest") {
    // dense forest canopy backdrop
    for (const [tx, ty, r, hue] of [
      [200, 160, 90, "#145214"], [450, 140, 80, "#1a6b1a"], [700, 155, 85, "#166516"],
      [950, 145, 78, "#1e7a1e"], [1200, 135, 88, "#145214"], [1450, 150, 82, "#1a6b1a"],
      [1700, 140, 86, "#1e7a1e"], [1950, 155, 80, "#145214"], [2200, 145, 84, "#166516"],
      [2450, 140, 88, "#1a6b1a"], [2700, 150, 76, "#145214"],
    ]) {
      ctx.fillStyle = hue;
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0f3d0f";
      ctx.beginPath(); ctx.arc(tx - r * 0.25, ty - r * 0.25, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3d2008";
      ctx.fillRect(tx - 13, ty + r - 15, 26, 480 - (ty + r - 15));
    }
    // forest floor moss
    ctx.fillStyle = "#2d6a1f";
    ctx.fillRect(0, 465, level.width, 15);
  } else if (level.id === "nyc") {
    // Main building shell
    ctx.fillStyle = "#475569";
    ctx.fillRect(220, 120, 1560, (level.height || GAME_H) - 120);
    // Window grid
    ctx.fillStyle = "#1e293b";
    for (let y = 160; y < (level.height || GAME_H) - 100; y += 78) {
      for (let x = 280; x < 1710; x += 120) {
        ctx.fillRect(x, y, 56, 42);
      }
    }
    // Scaffolding uprights
    ctx.fillStyle = "#94a3b8";
    for (const x of [160, 390, 680, 980, 1280, 1580, 1830]) {
      ctx.fillRect(x, 160, 14, (level.height || GAME_H) - 210);
    }
    // Scaffolding cross-braces
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    for (let y = 220; y < (level.height || GAME_H) - 120; y += 120) {
      ctx.beginPath();
      ctx.moveTo(160, y); ctx.lineTo(390, y + 80);
      ctx.moveTo(390, y); ctx.lineTo(680, y + 80);
      ctx.moveTo(680, y); ctx.lineTo(980, y + 80);
      ctx.moveTo(980, y); ctx.lineTo(1280, y + 80);
      ctx.moveTo(1280, y); ctx.lineTo(1580, y + 80);
      ctx.moveTo(1580, y); ctx.lineTo(1830, y + 80);
      ctx.stroke();
    }
  }

  for (const p of level.platforms) {
    ctx.fillStyle = p.name === "floor" || p.name === "street" ? "#374151"
      : p.name === "dumpster" ? "#15803d"
      : p.name === "roof lip" ? "#64748b"
      : p.name.includes("scaffold") || p.name.includes("window") ? "#92400e"
      : p.name.includes("lily") ? "#65a30d"
      : p.name.includes("log") ? "#92400e"
      : p.name.includes("dock") ? "#a16207"
      : "#b45309";
    drawRoundedRect(ctx, p.x, p.y, p.w, p.h, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect(p.x + 8, p.y + 3, Math.max(10, p.w - 16), 3);
  }

  if (game.springboards) {
    game.springboards.forEach(s => drawSpringboard(ctx, s, frame));
  }

  game.collectibles.forEach(c => !c.got && drawCollectible(ctx, c, frame));
  game.bugs.forEach(b => !b.bonked && drawBug(ctx, b, frame));
  if (game.birds) game.birds.forEach(b => drawBird(ctx, b, frame));
  if (game.squirrels) game.squirrels.forEach(s => !s.bonked && drawSquirrel(ctx, s, frame));
  drawFairy(ctx, level.fairy, frame);
  drawFamilyPlayer(ctx, game.player, frame, CHARACTERS[game.selectedCharacter] ?? CHARACTERS[0]);
  if (game.particles) drawParticles(ctx, game.particles);

  ctx.restore();

  // 4) HUD (no scroll)
  drawRoundedRect(ctx, 22, 18, 560, 70, 16);
  ctx.fillStyle = "rgba(30,41,59,.72)";
  ctx.fill();
  drawText(ctx, level.title, 42, 48, 24, "#fde68a");
  drawText(ctx, level.sign, 42, 76, 15, "#f8fafc");

  drawRoundedRect(ctx, 735, 18, 200, 70, 16);
  ctx.fillStyle = "rgba(30,41,59,.72)";
  ctx.fill();
  drawText(ctx, `Flowers: ${game.score}/${game.total}`, 755, 48, 20, "#f9a8d4");
  drawText(ctx, `Fairies: ${game.levelIndex}/${levels.length}`, 755, 76, 16, "#bfdbfe");

  if (game.message) {
    drawRoundedRect(ctx, 190, 102, 580, 74, 18);
    ctx.fillStyle = "rgba(88,28,135,.85)";
    ctx.fill();
    drawText(ctx, game.message, GAME_W / 2, 148, 26, "#fff7ed", "center");
  }

  if (game.mode === "title") {
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawText(ctx, "FAIRY FINDER", GAME_W / 2, 90, 50, "#facc15", "center");
    drawText(ctx, "Ohana Quest", GAME_W / 2, 128, 24, "#f9a8d4", "center");
    drawText(ctx, "Choose your character", GAME_W / 2, 178, 22, "#bfdbfe", "center");

    const spacing = CHARACTERS.length > 3 ? 185 : 200;
    const startX = GAME_W / 2 - (spacing * (CHARACTERS.length - 1)) / 2;
    const previewY = 220;
    CHARACTERS.forEach((ch, i) => {
      const cx = startX + i * spacing;
      drawCharacterPreview(ctx, ch, cx, previewY, frame, i === game.selectedCharacter);
      const nameColor = i === game.selectedCharacter ? "#facc15" : "#f8fafc";
      drawText(ctx, ch.name, cx, previewY + 105, 22, nameColor, "center");
      drawText(ctx, `[${i + 1}]`, cx, previewY + 128, 14, "#94a3b8", "center");
    });

    drawText(ctx, "← → to choose  •  SPACE to start", GAME_W / 2, 478, 20, "#86efac", "center");
    drawText(ctx, "ESC: Back to Game Select", GAME_W / 2, 508, 16, "#475569", "center");
  }

  if (game.mode === "complete") {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawText(ctx, "LEVEL CLEAR!", GAME_W / 2, 220, 58, "#facc15", "center");
    drawText(ctx, "You found the hidden fairy!", GAME_W / 2, 270, 28, "white", "center");
    drawText(ctx, "Press SPACE for the next level", GAME_W / 2, 335, 24, "#86efac", "center");
  }

  if (game.mode === "win") {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawText(ctx, "OHANA QUEST COMPLETE!", GAME_W / 2, 220, 48, "#facc15", "center");
    drawText(ctx, "You found all the fairies together.", GAME_W / 2, 270, 27, "white", "center");
    drawText(ctx, "Press R to play again", GAME_W / 2, 335, 24, "#86efac", "center");
  }
}

function makeGame(levelIndex = 0, mode = "title", selectedCharacter) {
  const level = levels[levelIndex];
  const levelHeight = level.height || GAME_H;
  return {
    mode,
    levelIndex,
    selectedCharacter: selectedCharacter ?? loadCharacterIndex(),
    player: { x: level.start.x, y: level.start.y, w: 34, h: 70, vx: 0, vy: 0, onGround: false, inv: 0 },
    collectibles: level.collectibles.map(c => ({ ...c, got: false })),
    bugs: level.bugs.map(b => ({ ...b, w: 28, h: 20, bonked: false })),
    birds: (level.birds || []).map(b => ({ ...b, w: 32, h: 18, bonked: false })),
    squirrels: (level.squirrels || []).map(s => ({ ...s, w: s.climbing ? 20 : 26, h: s.climbing ? 26 : 20, bonked: false })),
    springboards: (level.springboards || []).map(s => ({ ...s })),
    score: 0,
    total: level.collectibles.length,
    message: "",
    messageTimer: 0,
    prevJump: false,
    jumpHeld: false,
    hangFrames: 0,
    coyote: 0,
    jumpBuffer: 0,
    springCooldown: 0,
    springAirborne: false,
    prevTitleLeft: false,
    prevTitleRight: false,
    cameraX: 0,
    cameraY: Math.max(0, levelHeight - GAME_H),
    particles: makeParticlePool(),
  };
}

export default function FairyFinder({ onBack }) {
  const canvasRef = useRef(null);
  const keys = useRef({});
  const gameRef = useRef(makeGame());
  const [muted, setMutedUI] = useState(isMuted());
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  const onMuteToggle = () => {
    const v = toggleMute();
    setMutedUI(v);
    if (v) stopMusic();
    else restartMusicIfMuted();
  };

  useEffect(() => {
    const down = (e) => {
      const key = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) e.preventDefault();
      if (e.repeat) return;
      primeAudio();
      if (key === "escape") {
        if (gameRef.current.mode === "title") {
          onBackRef.current?.();
          return;
        }
      }
      if (key === "m") {
        const v = toggleMute();
        setMutedUI(v);
        return;
      }
      keys.current[key] = true;
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    let raf;

    const reset = () => {
      stopMusic();
      gameRef.current = makeGame(0, "title");
    };

    const nextLevel = () => {
      const g = gameRef.current;
      const next = g.levelIndex + 1;
      if (next >= levels.length) {
        g.mode = "win";
      } else {
        gameRef.current = makeGame(next, "playing", g.selectedCharacter);
      }
    };

    const tick = () => {
      frame++;
      const g = gameRef.current;
      const level = levels[g.levelIndex];
      const k = keys.current;

      if (k["r"]) reset();

      if (g.mode === "title") {
        const tLeft = !!(k["arrowleft"] || k["a"]);
        const tRight = !!(k["arrowright"] || k["d"]);
        if (tLeft && !g.prevTitleLeft) {
          g.selectedCharacter = (g.selectedCharacter - 1 + CHARACTERS.length) % CHARACTERS.length;
          saveCharacterIndex(g.selectedCharacter);
        }
        if (tRight && !g.prevTitleRight) {
          g.selectedCharacter = (g.selectedCharacter + 1) % CHARACTERS.length;
          saveCharacterIndex(g.selectedCharacter);
        }
        g.prevTitleLeft = tLeft;
        g.prevTitleRight = tRight;
        for (let i = 0; i < CHARACTERS.length; i++) {
          if (k[String(i + 1)]) {
            g.selectedCharacter = i;
            saveCharacterIndex(g.selectedCharacter);
          }
        }
      }

      if ((g.mode === "title" || g.mode === "complete") && (k[" "] || k["space"])) {
        if (g.mode === "title") { g.mode = "playing"; startMusic(); }
        else nextLevel();
        k[" "] = false; k["space"] = false;
      }

      if (g.mode === "playing") {
        const p = g.player;
        const levelHeight = level.height || GAME_H;
        const left = k["arrowleft"] || k["a"];
        const right = k["arrowright"] || k["d"];
        const jumpDown = !!(k[" "] || k["space"] || k["arrowup"] || k["w"]);
        const jumpPressed = jumpDown && !g.prevJump;
        g.prevJump = jumpDown;

        if (jumpPressed) g.jumpBuffer = JUMP_BUFFER_FRAMES;

        if (g.jumpHeld && !jumpDown && p.vy < 0) {
          p.vy *= JUMP_CUT;
          g.jumpHeld = false;
        }
        if (p.vy >= 0) g.jumpHeld = false;

        const airSpeed = g.springAirborne ? SPRING_AIR_SPEED : MOVE_SPEED;
        if (left) p.vx = -airSpeed;
        else if (right) p.vx = airSpeed;
        else if (!g.springAirborne || p.onGround) p.vx = 0;

        const hangWindow = g.springAirborne ? SPRING_HANG_VY_WINDOW : HANG_VY_WINDOW;
        const hangGravity = g.springAirborne ? SPRING_HANG_GRAVITY : HANG_GRAVITY;
        const hangMaxFrames = g.springAirborne ? SPRING_HANG_MAX_FRAMES : HANG_MAX_FRAMES;
        const nearApex = !p.onGround && Math.abs(p.vy) < hangWindow;
        if (nearApex && jumpDown && g.hangFrames < hangMaxFrames) {
          p.vy += hangGravity;
          g.hangFrames++;
        } else {
          p.vy += GRAVITY;
        }

        // X axis: move and resolve
        p.x += p.vx;
        const xMax = (level.vertical ? GAME_W : level.width) - p.w;
        p.x = Math.max(0, Math.min(xMax, p.x));
        for (const plat of level.platforms) {
          if (rectsOverlap(p, plat)) {
            if (p.vx > 0) p.x = plat.x - p.w;
            else if (p.vx < 0) p.x = plat.x + plat.w;
          }
        }

        // Y axis: move and resolve
        const preLandVy = p.vy;
        p.y += p.vy;
        p.onGround = false;
        for (const plat of level.platforms) {
          if (rectsOverlap(p, plat)) {
            if (p.vy > 0) {
              p.y = plat.y - p.h;
              p.onGround = true;
            } else if (p.vy < 0) {
              p.y = plat.y + plat.h;
            }
            p.vy = 0;
          }
        }
        if (p.onGround && g.springAirborne) g.springAirborne = false;

        if (p.onGround && preLandVy > 6) {
          emitParticles(g.particles, p.x + p.w / 2, p.y + p.h - 2, 5, {
            angleMin: Math.PI * 0.1, angleMax: Math.PI * 0.9,
            speedMin: 0.5, speedMax: 1.6,
            life: 18, colors: ["#a8a29e", "#d6d3d1", "#fef3c7"],
            size: 2, gravity: -0.05, shrink: true, spread: 6,
          });
        }

        // Coyote refresh + buffered jump
        if (p.onGround) { g.coyote = COYOTE_FRAMES; g.hangFrames = 0; }
        else if (g.coyote > 0) g.coyote--;

        if (g.jumpBuffer > 0 && g.coyote > 0) {
          p.vy = JUMP_VELOCITY;
          p.onGround = false;
          g.coyote = 0;
          g.jumpBuffer = 0;
          g.jumpHeld = true;
          sfxJump();
        } else if (g.jumpBuffer > 0) {
          g.jumpBuffer--;
        }

        if (p.y > levelHeight + 80) {
          p.x = level.start.x; p.y = level.start.y; p.vx = 0; p.vy = 0;
          g.cameraX = 0;
          g.cameraY = Math.max(0, levelHeight - GAME_H);
          g.springAirborne = false;
        }

        if (level.vertical) {
          const targetCamY = Math.max(0, Math.min(levelHeight - GAME_H, p.y + p.h / 2 - GAME_H / 2));
          if (!g.springAirborne) g.cameraY += (targetCamY - g.cameraY) * 0.22;
          g.cameraX = 0;
        } else {
          const targetCamX = Math.max(0, Math.min(level.width - GAME_W, p.x + p.w / 2 - GAME_W / 2));
          g.cameraX += (targetCamX - g.cameraX) * 0.12;
          g.cameraY = 0;
        }

        if (p.inv > 0) p.inv--;

        g.collectibles.forEach(c => {
          if (!c.got && rectsOverlap(p, { x: c.x - 12, y: c.y - 12, w: 24, h: 24 })) {
            c.got = true;
            g.score++;
            g.message = g.score === g.total ? "All flowers found! Now find the fairy!" : "Flower found!";
            g.messageTimer = 70;
            sfxCollect();
            emitParticles(g.particles, c.x, c.y, 10, {
              angleMin: -Math.PI, angleMax: 0,
              speedMin: 1.5, speedMax: 3.2,
              life: 28, colors: ["#facc15", "#fff7ed", "#fbbf24", "#fde68a"],
              size: 2.5, gravity: 0.08, shrink: true,
            });
          }
        });

        g.bugs.forEach(b => {
          if (b.bonked) return;
          b.x += b.vx;
          if (b.x < b.min || b.x > b.max) b.vx *= -1;
          const bugRect = { x: b.x, y: b.y, w: b.w, h: b.h };
          if (rectsOverlap(p, bugRect)) {
            const stomp = (p.y + p.h - b.y) < (b.h * 0.6);
            if (stomp) {
              b.bonked = true;
              p.y = b.y - p.h;
              p.vy = -8;
              g.message = "Boop! Bug bonked.";
              g.messageTimer = 70;
              sfxBonk();
              emitParticles(g.particles, b.x + b.w / 2, b.y + b.h / 2, 8, {
                angleMin: -Math.PI, angleMax: 0,
                speedMin: 1, speedMax: 2.5,
                life: 22, colors: ["#84cc16", "#bef264", "#365314"],
                size: 2.5, gravity: 0.18, shrink: true,
              });
            } else if (p.inv <= 0) {
              p.vy = -5;
              p.inv = INV_FRAMES;
              const lastGot = [...g.collectibles].reverse().find(c => c.got);
              if (lastGot) {
                lastGot.got = false;
                g.score--;
                g.message = "Ouch! Lost a flower.";
              } else {
                g.message = "Oof! Try jumping on bugs.";
              }
              g.messageTimer = 70;
              sfxHurt();
            }
          }
        });

        // Super-jump planks (askew scaffold boards)
        if (g.springCooldown > 0) g.springCooldown--;

        if (g.springboards) {
          g.springboards.forEach(s => {
            const sRect = { x: s.x, y: s.y, w: s.w, h: s.h };
            if (g.springCooldown <= 0 && rectsOverlap(p, sRect)) {
              const launchDir = getSpringDirection(s);
              const springCenterX = s.x + s.w / 2;
              const targetX = Number.isFinite(s.launchToX) ? s.launchToX : (springCenterX + launchDir * 180);
              const launchDx = Math.abs(targetX - springCenterX);
              const launchSpeed = Math.max(
                SPRING_LAUNCH_SPEED_MIN,
                Math.min(SPRING_LAUNCH_SPEED_MAX, 4.2 + launchDx / 55)
              );
              if (p.y > s.y - p.h) p.y = s.y - p.h;
              p.vy = SUPER_JUMP_VELOCITY;
              p.vx = launchDir * launchSpeed;
              p.onGround = false;
              g.coyote = 0;
              g.jumpHeld = false;
              g.springAirborne = true;
              g.hangFrames = 0;
              g.springCooldown = 12;
              g.message = "Super jump!";
              g.messageTimer = 46;
              sfxJump();
              emitParticles(g.particles, s.x + s.w / 2, s.y + 2, 12, {
                angleMin: Math.PI * 0.75, angleMax: Math.PI * 2.25,
                speedMin: 1.2, speedMax: 3.6,
                life: 20, colors: ["#f59e0b", "#fde68a", "#fff7ed"],
                size: 2.4, gravity: 0.06, shrink: true,
              });
            }
          });
        }

        // Birds — horizontal patrol with sine-wave vertical drift
        g.birds.forEach(b => {
          if (b.bonked) return;
          b.x += b.vx;
          if (b.x < b.min || b.x > b.max) b.vx *= -1;
          b.phase = (b.phase || 0) + 0.04;
          b.y = b.baseY + Math.sin(b.phase) * 28;
          const bRect = { x: b.x, y: b.y, w: b.w, h: b.h };
          if (rectsOverlap(p, bRect)) {
            const stomp = (p.y + p.h - b.y) < (b.h * 0.55);
            if (stomp) {
              b.bonked = true;
              p.vy = -8;
              g.message = "Tweet! Bird bonked.";
              g.messageTimer = 70;
              sfxBirdSquawk();
              emitParticles(g.particles, b.x + b.w / 2, b.y, 8, {
                angleMin: -Math.PI, angleMax: 0,
                speedMin: 1, speedMax: 2.5,
                life: 22, colors: ["#f8fafc", "#e2e8f0", "#fbbf24"],
                size: 2.5, gravity: 0.12, shrink: true,
              });
            } else if (p.inv <= 0) {
              p.vy = -5; p.inv = INV_FRAMES;
              const lastGot = [...g.collectibles].reverse().find(c => c.got);
              if (lastGot) { lastGot.got = false; g.score--; g.message = "A bird got you! Lost a flower."; }
              else g.message = "Watch out for birds!";
              g.messageTimer = 70;
              sfxHurt();
            }
          }
        });

        // Squirrels — tree climbers (vertical) or ground runners
        g.squirrels.forEach(s => {
          if (s.bonked) return;
          if (s.pauseTimer > 0) {
            s.pauseTimer--;
            return;
          }
          if (s.climbing) {
            s.y += s.vy;
            if (s.y < s.minY || s.y > s.maxY) {
              s.vy *= -1;
              s.pauseTimer = Math.floor(Math.random() * 35);
              if (Math.random() < 0.35) sfxSquirrelChitter();
            }
          } else {
            s.x += s.vx;
            if (s.x < s.min || s.x > s.max) {
              s.vx *= -1;
              s.pauseTimer = Math.floor(Math.random() * 40);
              if (Math.random() < 0.3) sfxSquirrelChitter();
            }
          }
          const sRect = { x: s.x, y: s.y, w: s.w, h: s.h };
          if (rectsOverlap(p, sRect)) {
            const stomp = (p.y + p.h - s.y) < (s.h * 0.55);
            if (stomp) {
              s.bonked = true;
              p.vy = -8;
              g.message = "Gotcha, squirrel!";
              g.messageTimer = 70;
              sfxBonk();
              emitParticles(g.particles, s.x + s.w / 2, s.y, 8, {
                angleMin: -Math.PI, angleMax: 0,
                speedMin: 1, speedMax: 2.5,
                life: 22, colors: ["#92400e", "#fde68a", "#b45309"],
                size: 2.5, gravity: 0.15, shrink: true,
              });
            } else if (p.inv <= 0) {
              p.vy = -5; p.inv = INV_FRAMES;
              const lastGot = [...g.collectibles].reverse().find(c => c.got);
              if (lastGot) { lastGot.got = false; g.score--; g.message = "Squirrel attack! Lost a flower."; }
              else g.message = "Jump on the squirrel!";
              g.messageTimer = 70;
              sfxHurt();
            }
          }
        });

        const f = level.fairy;
        if (rectsOverlap(p, { x: f.x - 24, y: f.y - 35, w: 48, h: 70 })) {
          const isWin = g.levelIndex === levels.length - 1;
          g.mode = isWin ? "win" : "complete";
          if (isWin) stopMusic();
          sfxFairy();
          setTimeout(sfxLevelClear, 500);
          emitParticles(g.particles, f.x, f.y, 30, {
            angleMin: 0, angleMax: Math.PI * 2,
            speedMin: 1, speedMax: 4.5,
            life: 50, colors: ["#facc15", "#fff7ed", "#f9a8d4", "#fbcfe8", "#bfdbfe"],
            size: 3, gravity: -0.02, shrink: true,
          });
        }

        if (g.messageTimer > 0) g.messageTimer--;
        else g.message = "";
      }

      if (g.particles) updateParticles(g.particles);
      drawScene(ctx, level, g, frame);
      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => { cancelAnimationFrame(raf); stopMusic(); };
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-4 gap-4">
      <div className="max-w-[960px] w-full flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-yellow-300">Fairy Finder</h1>
          <p className="text-slate-300">A tiny playable side-scrolling ohana quest prototype.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <BackButton onBack={onBack} />
            <button
              type="button"
              onClick={onMuteToggle}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs text-slate-200 transition"
            >
              Sound: {muted ? "OFF" : "ON"} (M)
            </button>
          </div>
          <div className="hidden md:block text-right text-sm text-slate-300">
            Move: ← → or A/D<br />Jump: Space/W/↑<br />Restart: R
          </div>
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black">
        <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="w-full max-w-[960px] aspect-video block" />
      </div>
      <TouchControls
        keysRef={keys}
        jumpKey=" "
        showRestart
        onPress={primeAudio}
        onRestart={() => {
          keys.current["r"] = true;
          setTimeout(() => { keys.current["r"] = false; }, 50);
        }}
      />
      <div className="max-w-[960px] w-full rounded-2xl bg-white/10 border border-white/10 p-4 text-sm text-slate-200">
        <b>Prototype notes:</b> first version — three levels, collectibles, moving bugs you can bonk by jumping on them, fairy goals, restart, kid-friendly keyboard controls. See PLAN.md for the upgrade roadmap.
      </div>
    </div>
  );
}
