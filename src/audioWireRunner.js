let ctx = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;

const MUTE_KEY = "wire-runner-muted";
const MUSIC_BPM = 108;
const STEP_MS = Math.round((60_000 / MUSIC_BPM) / 2); // 8th-note grid

try {
  if (typeof localStorage !== "undefined") {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  }
} catch {}

function getCtx() {
  if (!ctx) {
    const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return null;
    try {
      ctx = new Ctx();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function primeAudio() {
  getCtx();
  if (!muted) startMusicLoop();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
  if (muted) stopMusicLoop();
  else startMusicLoop();
  return muted;
}

function playMusicStep(step) {
  // C minor synthwave-ish loop: bass pulse + airy arp + light hats.
  const bass = [130.81, 130.81, 155.56, 155.56, 174.61, 174.61, 155.56, 155.56];
  const arp = [523.25, 622.25, 659.25, 783.99, 698.46, 783.99, 659.25, 622.25];
  const i8 = step % 8;
  const i16 = step % 16;

  // Bass on quarter notes.
  if (i16 % 4 === 0) {
    const root = bass[i8];
    tone({ freq: root, dur: 0.28, type: "sawtooth", gain: 0.045 });
    tone({ freq: root * 0.5, dur: 0.22, type: "sine", gain: 0.03, delay: 0.01 });
  }

  // Arp every 8th note.
  tone({ freq: arp[i8], dur: 0.12, type: "triangle", gain: 0.028 });

  // Off-beat hats.
  if (i16 % 2 === 1) {
    noise({ dur: 0.02, gain: 0.018, cutoff: 6400 });
  }

  // Light snare-ish noise on 2 and 4.
  if (i16 === 4 || i16 === 12) {
    noise({ dur: 0.04, gain: 0.028, cutoff: 2100 });
  }
}

function startMusicLoop() {
  const ac = getCtx();
  if (!ac || muted || musicTimer) return;
  playMusicStep(musicStep);
  musicTimer = setInterval(() => {
    if (muted) return;
    playMusicStep(musicStep);
    musicStep = (musicStep + 1) % 16;
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

export function sfxJump() {
  tone({ freq: 280, freqEnd: 440, dur: 0.09, type: "sine", gain: 0.18 });
}

export function sfxMenuMove() {
  tone({ freq: 640, dur: 0.05, type: "square", gain: 0.1 });
  tone({ freq: 820, dur: 0.06, type: "square", gain: 0.09, delay: 0.025 });
}

export function sfxApex() {
  [659, 784, 988].forEach((f, i) => tone({ freq: f, dur: 0.13, type: "triangle", gain: 0.13, delay: i * 0.06 }));
}

export function sfxLand() {
  noise({ dur: 0.04, gain: 0.18, cutoff: 1200 });
}

export function sfxBonk() {
  noise({ dur: 0.06, gain: 0.3, cutoff: 900 });
}

export function sfxHurt() {
  tone({ freq: 200, freqEnd: 110, dur: 0.22, type: "sawtooth", gain: 0.2 });
}
