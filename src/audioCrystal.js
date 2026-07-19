// Crystal Quest audio — bright, punchy arcade sounds in the spirit of an
// old vector shooter. Chirpy blips for grabbing crystals, a fat smart-bomb
// boom, a descending zap on death, a rising fanfare between waves, and a
// driving synth bassline loop. Built on a tiny WebAudio helper, no assets.

let ctx = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;

const MUTE_KEY = "crystal-quest-muted";
const MUSIC_BPM = 132;
const STEP_MS = Math.round((60_000 / MUSIC_BPM) / 4); // 16th-note grid

try {
  if (typeof localStorage !== "undefined") {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  }
} catch {}

function getCtx() {
  if (!ctx) {
    const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return null;
    try { ctx = new Ctx(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function primeAudio() {
  getCtx();
  if (!muted) startMusicLoop();
}

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch {}
  if (muted) stopMusicLoop();
  else startMusicLoop();
  return muted;
}

// A driving little synth loop — a minor-key arpeggio bass with an off-beat
// blip and the occasional high ping. Relentless but not fatiguing.
function playMusicStep(step) {
  const i16 = step % 16;
  const i64 = step % 64;

  // Pumping eighth-note bass — A minor / F / G / E progression.
  const bassRoots = [55.00, 55.00, 43.65, 43.65, 49.00, 49.00, 41.20, 41.20];
  if (i16 % 2 === 0) {
    const root = bassRoots[(Math.floor(i64 / 8)) % bassRoots.length];
    tone({ freq: root, dur: 0.12, type: "sawtooth", gain: 0.05 });
  }

  // Off-beat stab for groove.
  if (i16 === 2 || i16 === 6 || i16 === 10 || i16 === 14) {
    tone({ freq: 220, dur: 0.05, type: "square", gain: 0.018 });
  }

  // Sparse arpeggio lead riding on top.
  const lead = [440, 523.25, 659.25, 880, 659.25, 523.25, 587.33, 440];
  if (i16 === 0 || i16 === 4 || i16 === 8 || i16 === 12) {
    const f = lead[(Math.floor(i64 / 4)) % lead.length];
    tone({ freq: f, dur: 0.16, type: "triangle", gain: 0.03, delay: 0.01 });
  }

  // Tick shimmer.
  if (i16 === 7 || i16 === 15) {
    tone({ freq: 1568, dur: 0.05, type: "sine", gain: 0.012 });
  }
}

function startMusicLoop() {
  const ac = getCtx();
  if (!ac || muted || musicTimer) return;
  playMusicStep(musicStep);
  musicTimer = setInterval(() => {
    if (muted) return;
    playMusicStep(musicStep);
    musicStep = (musicStep + 1) % 64;
  }, STEP_MS);
}

function stopMusicLoop() {
  if (!musicTimer) return;
  clearInterval(musicTimer);
  musicTimer = null;
}

function tone({ freq, dur, type = "sine", gain = 0.15, freqEnd, delay = 0 }) {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd && freqEnd !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur, gain = 0.2, cutoff = 800, sweep, delay = 0 }) {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, t);
  if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// Bright chirp when you scoop up a crystal. Pitch climbs with your combo so a
// fast sweep sounds like an ascending run.
export function sfxCrystal(combo = 0) {
  const base = 660 * Math.pow(2, Math.min(combo, 18) / 18); // up to ~+1 octave
  tone({ freq: base, freqEnd: base * 1.5, dur: 0.08, type: "square", gain: 0.06 });
  tone({ freq: base * 2, dur: 0.05, type: "sine", gain: 0.03, delay: 0.04 });
}

// Fat smart-bomb detonation — a filtered noise boom under a falling sine.
export function sfxBomb() {
  noise({ dur: 0.5, gain: 0.28, cutoff: 1800, sweep: 120 });
  tone({ freq: 180, freqEnd: 40, dur: 0.5, type: "sawtooth", gain: 0.12 });
  tone({ freq: 90, freqEnd: 30, dur: 0.6, type: "sine", gain: 0.10, delay: 0.02 });
}

// Firing the ship's little shot.
export function sfxShoot() {
  tone({ freq: 880, freqEnd: 240, dur: 0.10, type: "square", gain: 0.05 });
}

// An enemy fizzling out when a bomb or shot catches it.
export function sfxZap() {
  tone({ freq: 520, freqEnd: 1200, dur: 0.08, type: "sawtooth", gain: 0.05 });
  noise({ dur: 0.06, gain: 0.05, cutoff: 3000 });
}

// A new enemy warping into the arena.
export function sfxSpawn() {
  tone({ freq: 200, freqEnd: 700, dur: 0.14, type: "triangle", gain: 0.035 });
}

// Losing a ship — a nasty descending crunch.
export function sfxDeath() {
  tone({ freq: 400, freqEnd: 50, dur: 0.55, type: "sawtooth", gain: 0.12 });
  noise({ dur: 0.5, gain: 0.2, cutoff: 2400, sweep: 100, delay: 0.02 });
  tone({ freq: 120, freqEnd: 30, dur: 0.6, type: "square", gain: 0.06, delay: 0.05 });
}

// The gate swinging open once every crystal is cleared.
export function sfxGate() {
  [440, 587.33, 659.25, 880].forEach((f, i) =>
    tone({ freq: f, dur: 0.18, type: "triangle", gain: 0.06, delay: i * 0.06 })
  );
}

// Rising fanfare between waves.
export function sfxWave() {
  const melody = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  melody.forEach((f, i) =>
    tone({ freq: f, dur: 0.22, type: "square", gain: 0.07, delay: i * 0.09 })
  );
  [1046.5, 1568.0].forEach((f, i) =>
    tone({ freq: f, dur: 0.4, type: "sine", gain: 0.03, delay: 0.4 + i * 0.1 })
  );
}

// Big triumphant sting when the whole run ends on a high note (final wave).
export function sfxWin() {
  const melody = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1046.5, 1318.5, 1568.0];
  melody.forEach((f, i) =>
    tone({ freq: f, dur: 0.3, type: "square", gain: 0.08, delay: i * 0.13 })
  );
}

export function sfxButton() {
  tone({ freq: 620, dur: 0.05, type: "triangle", gain: 0.08 });
  tone({ freq: 880, dur: 0.06, type: "triangle", gain: 0.06, delay: 0.03 });
}

// Menu blip while flipping through the title screen.
export function sfxMenuMove() {
  tone({ freq: 740, dur: 0.05, type: "square", gain: 0.05 });
}
