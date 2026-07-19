// Whale game audio — soft, bubbly, and cheerful. Bright bloops for eating
// shrimp, a happy jingle on level-up, a gentle boing on bumps, and a slow
// underwater lullaby loop. Nothing harsh — it's for a very small captain.

let ctx = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;

const MUTE_KEY = "whale-game-muted";
const MUSIC_BPM = 80;
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

// A slow, floaty tune — warm sine bass, marimba-ish plucks, a sprinkle of
// high twinkles. Pentatonic so nothing ever clashes.
function playMusicStep(step) {
  const i16 = step % 16;
  const i32 = step % 32;

  // Rolling bass — C / A / F / G, one soft note per half-bar.
  const bassRoots = [65.41, 65.41, 55.00, 55.00, 43.65, 43.65, 49.00, 49.00];
  if (i16 === 0 || i16 === 8) {
    const root = bassRoots[(Math.floor(i32 / 2)) % bassRoots.length];
    tone({ freq: root, dur: 0.6, type: "sine", gain: 0.05 });
  }

  // Warm pad swell at the top of each bar.
  if (i32 === 0 || i32 === 16) {
    [261.63, 329.63, 392.00].forEach((f, k) =>
      tone({ freq: f, dur: 2.0, type: "triangle", gain: 0.014, delay: k * 0.02 })
    );
  }

  // Marimba-ish melody — gentle pentatonic bounce.
  const melA = [523.25, 0, 659.25, 0, 587.33, 0, 783.99, 0];
  const melB = [659.25, 0, 587.33, 0, 523.25, 0, 440.00, 0];
  const mel = (i32 < 16) ? melA : melB;
  if (i16 % 2 === 0) {
    const f = mel[(i16 / 2) | 0];
    if (f) tone({ freq: f, dur: 0.24, type: "triangle", gain: 0.03 });
  }

  // Occasional high twinkle like a rising bubble.
  if (i16 === 6 || i16 === 14) {
    tone({ freq: 1046.5, dur: 0.14, type: "sine", gain: 0.018, delay: 0.02 });
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
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
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

// Yummy little "nom" — a quick rising bloop with a soft bubble tail.
export function sfxEat() {
  tone({ freq: 440, freqEnd: 880, dur: 0.10, type: "triangle", gain: 0.12 });
  tone({ freq: 1200, dur: 0.06, type: "sine", gain: 0.05, delay: 0.06 });
}

// Extra-sparkly eat for rainbow/star treats.
export function sfxTreat() {
  [660, 880, 1320, 1760].forEach((f, i) =>
    tone({ freq: f, dur: 0.12, type: "sine", gain: 0.08, delay: i * 0.045 })
  );
}

// Happy climbing jingle when a new level begins.
export function sfxLevel() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.10, delay: i * 0.10 })
  );
}

// Big triumphant fanfare for finishing the whole adventure (level 30).
export function sfxWin() {
  const melody = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1046.5, 1318.5, 1568.0];
  melody.forEach((f, i) =>
    tone({ freq: f, dur: 0.3, type: "triangle", gain: 0.11, delay: i * 0.14 })
  );
  // sparkly top layer
  [1046.5, 1318.5, 1568.0].forEach((f, i) =>
    tone({ freq: f * 2, dur: 0.5, type: "sine", gain: 0.03, delay: 0.5 + i * 0.14 })
  );
}

// Friendly boing when the whale bumps a jelly/puffer. Never scary.
export function sfxBounce() {
  tone({ freq: 300, freqEnd: 520, dur: 0.10, type: "sine", gain: 0.10 });
  tone({ freq: 520, freqEnd: 260, dur: 0.12, type: "sine", gain: 0.08, delay: 0.09 });
}

// Soft twinkle for sparkles and menu taps.
export function sfxSparkle() {
  tone({ freq: 1320, dur: 0.07, type: "sine", gain: 0.05 });
  tone({ freq: 1760, dur: 0.08, type: "sine", gain: 0.04, delay: 0.03 });
}

export function sfxButton() {
  tone({ freq: 620, dur: 0.05, type: "triangle", gain: 0.08 });
  tone({ freq: 880, dur: 0.06, type: "triangle", gain: 0.06, delay: 0.03 });
}

// A gentle bubble "pop" used for little UI blips.
export function sfxPop() {
  tone({ freq: 900, freqEnd: 1400, dur: 0.05, type: "sine", gain: 0.06 });
  noise({ dur: 0.02, gain: 0.02, cutoff: 3000, delay: 0.01 });
}
