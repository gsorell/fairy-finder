let ctx = null;
let muted = false;

try {
  if (typeof localStorage !== 'undefined') {
    muted = localStorage.getItem('fairy-finder-muted') === '1';
  }
} catch {}

function getCtx() {
  if (!ctx) {
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return null;
    try { ctx = new Ctx(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function primeAudio() { getCtx(); }
export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('fairy-finder-muted', muted ? '1' : '0'); } catch {}
  return muted;
}

function tone({ freq, dur, type = 'sine', gain = 0.15, freqEnd, delay = 0 }) {
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
  filter.type = 'lowpass';
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
  tone({ freq: 280, freqEnd: 440, dur: 0.09, type: 'sine', gain: 0.18 });
}

export function sfxCollect() {
  tone({ freq: 523, dur: 0.07, type: 'square', gain: 0.12 });
  tone({ freq: 659, dur: 0.09, type: 'square', gain: 0.12, delay: 0.06 });
}

export function sfxBonk() {
  noise({ dur: 0.06, gain: 0.3, cutoff: 900 });
}

export function sfxHurt() {
  tone({ freq: 200, freqEnd: 110, dur: 0.22, type: 'sawtooth', gain: 0.2 });
}

export function sfxFairy() {
  [659, 784, 988, 1175].forEach((f, i) =>
    tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.16, delay: i * 0.08 })
  );
}

export function sfxLevelClear() {
  [
    [523, 0.00],
    [659, 0.12],
    [784, 0.24],
    [1046, 0.36],
    [1318, 0.55],
  ].forEach(([f, d]) =>
    tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.15, delay: d })
  );
}

export function sfxBirdSquawk() {
  tone({ freq: 900, freqEnd: 650, dur: 0.08, type: 'square', gain: 0.10 });
  tone({ freq: 650, freqEnd: 850, dur: 0.07, type: 'square', gain: 0.08, delay: 0.07 });
}

export function sfxSquirrelChitter() {
  [0, 0.04, 0.08].forEach(d =>
    tone({ freq: 1200 + Math.random() * 200, dur: 0.04, type: 'triangle', gain: 0.09, delay: d })
  );
}

// ── Background Music ─────────────────────────────────────────────────────────
let musicNodes = [];
let musicScheduler = null;
let musicPlaying = false;
let musicBeat = 0;

const SCALE = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
// pentatonic indices into SCALE
const PENTA = [0, 1, 2, 4, 5];

function scheduleNote(ac, freq, startTime, dur, gainVal, type = 'triangle') {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(gainVal, startTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + dur * 0.85);
  osc.connect(g).connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + dur);
  musicNodes.push(osc, g);
}

function scheduleChunk(ac, startTime) {
  const tempo = 0.22; // seconds per beat
  const beatsPerChunk = 16;

  // melody patterns (two 8-beat phrases that alternate)
  const phraseA = [4, 5, 4, 2, 1, 0, 2, 4];
  const phraseB = [5, 4, 2, 4, 6, 5, 4, 2];
  const phrase = (musicBeat % 32 < 16) ? phraseA : phraseB;

  for (let i = 0; i < beatsPerChunk; i++) {
    const t = startTime + i * tempo;
    const noteIdx = phrase[i % 8];
    const freq = SCALE[noteIdx % SCALE.length] * 2; // upper octave melody
    scheduleNote(ac, freq, t, tempo * 0.82, 0.07, 'triangle');

    // bass on beats 0 and 2 of each 4-beat bar
    if (i % 4 === 0) {
      scheduleNote(ac, SCALE[PENTA[Math.floor(i / 4) % PENTA.length]] * 0.5, t, tempo * 1.8, 0.09, 'sine');
    }

    // chord stabs on offbeats (beat 1 and 3)
    if (i % 4 === 2) {
      const chord = [SCALE[2], SCALE[4], SCALE[6]];
      chord.forEach(f => scheduleNote(ac, f, t, tempo * 0.6, 0.035, 'sine'));
    }

    // hi-hat pulse
    {
      const noiseLen = Math.max(1, Math.floor(ac.sampleRate * 0.045));
      const buf = ac.createBuffer(1, noiseLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < noiseLen; j++) data[j] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const filt = ac.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 7000;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      src.connect(filt).connect(g).connect(ac.destination);
      src.start(t);
      src.stop(t + 0.05);
      musicNodes.push(src, g, filt);
    }
  }
  musicBeat += beatsPerChunk;
  return startTime + beatsPerChunk * tempo;
}

export function startMusic() {
  if (musicPlaying) return;
  const ac = getCtx();
  if (!ac || muted) return;
  musicPlaying = true;
  musicBeat = 0;
  let nextTime = ac.currentTime + 0.05;

  // pre-schedule two chunks so there's no gap
  nextTime = scheduleChunk(ac, nextTime);
  nextTime = scheduleChunk(ac, nextTime);

  musicScheduler = setInterval(() => {
    if (!musicPlaying) return;
    const acNow = getCtx();
    if (!acNow || muted) return;
    nextTime = scheduleChunk(acNow, nextTime);
    // trim stale completed nodes
    musicNodes = musicNodes.filter(n => {
      try { return n.context && n.context.state !== 'closed'; } catch { return false; }
    });
  }, 2500);
}

export function stopMusic() {
  musicPlaying = false;
  if (musicScheduler) { clearInterval(musicScheduler); musicScheduler = null; }
  musicNodes.forEach(n => { try { n.disconnect(); } catch {} });
  musicNodes = [];
  musicBeat = 0;
}

export function restartMusicIfMuted() {
  // called when user un-mutes so music can resume
  if (!muted && !musicPlaying) startMusic();
}
