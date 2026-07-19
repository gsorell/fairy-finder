let ctx = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;

const MUTE_KEY = "ring-swinger-muted";
const MUSIC_BPM = 96;
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

// Slower, wider synthwave: deep sub bass, dreamy pad swells, glittery arp.
function playMusicStep(step) {
  // 16-step bar, repeats 2 bars = 32 steps total pattern.
  const i16 = step % 16;
  const i32 = step % 32;

  // Bass — Am / F / C / G feel (root pulses on downbeat + 8)
  const bassRoots = [110.00, 110.00, 87.31, 87.31, 130.81, 130.81, 98.00, 98.00];
  if (i16 === 0 || i16 === 8) {
    const root = bassRoots[(Math.floor(i32 / 2)) % bassRoots.length];
    tone({ freq: root, dur: 0.42, type: "sawtooth", gain: 0.05 });
    tone({ freq: root * 0.5, dur: 0.5, type: "sine", gain: 0.045 });
  }

  // Pad swell on bar start
  if (i32 === 0 || i32 === 16) {
    [261.63, 329.63, 392.00].forEach((f, k) =>
      tone({ freq: f, dur: 1.6, type: "triangle", gain: 0.018, delay: k * 0.01 })
    );
  }

  // Arp — pentatonic glitter
  const arpA = [659.25, 783.99, 987.77, 783.99, 1046.50, 783.99, 987.77, 659.25];
  const arpB = [587.33, 698.46, 880.00, 698.46, 1046.50, 880.00, 698.46, 587.33];
  const arp = (i32 < 16) ? arpA : arpB;
  if (i16 % 2 === 0) {
    tone({ freq: arp[(i16 / 2) | 0], dur: 0.18, type: "triangle", gain: 0.022 });
  }

  // Hats — every 16th, off-beats brighter
  noise({ dur: 0.018, gain: i16 % 4 === 2 ? 0.022 : 0.013, cutoff: 7200 });

  // Snare-ish on 4 and 12
  if (i16 === 4 || i16 === 12) {
    noise({ dur: 0.05, gain: 0.034, cutoff: 1900 });
    tone({ freq: 220, freqEnd: 110, dur: 0.05, type: "triangle", gain: 0.02 });
  }
}

function startMusicLoop() {
  const ac = getCtx();
  if (!ac || muted || musicTimer) return;
  playMusicStep(musicStep);
  musicTimer = setInterval(() => {
    if (muted) return;
    playMusicStep(musicStep);
    musicStep = (musicStep + 1) % 32;
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
    osc.frequency.linearRampToValueAtTime(freqEnd, t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur, gain = 0.2, cutoff = 800, delay = 0 }) {
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
  filter.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export function sfxRelease() {
  tone({ freq: 520, freqEnd: 760, dur: 0.10, type: "triangle", gain: 0.14 });
}

export function sfxGrab() {
  tone({ freq: 880, dur: 0.06, type: "square", gain: 0.10 });
  tone({ freq: 1320, dur: 0.07, type: "triangle", gain: 0.08, delay: 0.04 });
}

export function sfxPump() {
  tone({ freq: 360, freqEnd: 480, dur: 0.05, type: "sine", gain: 0.05 });
}

export function sfxBigSwing() {
  [523, 659, 784].forEach((f, i) =>
    tone({ freq: f, dur: 0.12, type: "triangle", gain: 0.10, delay: i * 0.05 })
  );
}

export function sfxFall() {
  tone({ freq: 320, freqEnd: 90, dur: 0.45, type: "sawtooth", gain: 0.18 });
}

export function sfxMenuMove() {
  tone({ freq: 640, dur: 0.05, type: "square", gain: 0.10 });
  tone({ freq: 820, dur: 0.06, type: "square", gain: 0.09, delay: 0.025 });
}
