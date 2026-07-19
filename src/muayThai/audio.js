// Synthesized 16-bit-style SFX via WebAudio. No samples shipped.

let ctx = null
let master = null

function ensureCtx() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.55
  master.connect(ctx.destination)
  return ctx
}

export function unlockAudio() {
  const c = ensureCtx()
  if (c && c.state === 'suspended') c.resume()
}

export function setVolume(v) {
  if (!master) return
  master.gain.value = Math.max(0, Math.min(1, v))
}

function tone({ freq = 220, type = 'sine', dur = 0.1, vol = 0.3, attack = 0.005, decay = 0.05, freqEnd = null, q = 0 }) {
  const c = ensureCtx()
  if (!c) return
  const t0 = c.currentTime
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  let last = g
  if (q > 0) {
    const filt = c.createBiquadFilter()
    filt.type = 'bandpass'
    filt.frequency.value = freq
    filt.Q.value = q
    g.connect(filt); filt.connect(master)
  } else {
    g.connect(master)
  }
  osc.connect(g)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise({ dur = 0.12, vol = 0.25, lp = 2200, hp = 80 }) {
  const c = ensureCtx()
  if (!c) return
  const t0 = c.currentTime
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const gn = c.createGain()
  gn.gain.value = vol
  const lpf = c.createBiquadFilter()
  lpf.type = 'lowpass'; lpf.frequency.value = lp
  const hpf = c.createBiquadFilter()
  hpf.type = 'highpass'; hpf.frequency.value = hp
  src.connect(hpf); hpf.connect(lpf); lpf.connect(gn); gn.connect(master)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

// ===== Public SFX =====

export const sfx = {
  jab() {
    tone({ freq: 380, freqEnd: 110, type: 'square', dur: 0.07, vol: 0.18 })
    noise({ dur: 0.08, vol: 0.22, lp: 1600, hp: 200 })
  },
  cross() {
    tone({ freq: 280, freqEnd: 70, type: 'square', dur: 0.10, vol: 0.24 })
    noise({ dur: 0.12, vol: 0.30, lp: 1200, hp: 150 })
  },
  elbow() {
    tone({ freq: 540, freqEnd: 160, type: 'square', dur: 0.06, vol: 0.22 })
    noise({ dur: 0.05, vol: 0.20, lp: 3200, hp: 600 })
  },
  knee() {
    tone({ freq: 200, freqEnd: 50, type: 'sawtooth', dur: 0.13, vol: 0.30 })
    noise({ dur: 0.10, vol: 0.28, lp: 900, hp: 90 })
  },
  kick() {
    tone({ freq: 240, freqEnd: 60, type: 'sawtooth', dur: 0.16, vol: 0.32 })
    noise({ dur: 0.13, vol: 0.32, lp: 1100, hp: 100 })
  },
  teep() {
    tone({ freq: 160, freqEnd: 80, type: 'triangle', dur: 0.10, vol: 0.20 })
    noise({ dur: 0.07, vol: 0.18, lp: 700, hp: 60 })
  },
  block() {
    tone({ freq: 880, freqEnd: 740, type: 'square', dur: 0.05, vol: 0.18 })
    noise({ dur: 0.05, vol: 0.18, lp: 4200, hp: 1200 })
  },
  miss() {
    tone({ freq: 700, freqEnd: 1400, type: 'sine', dur: 0.08, vol: 0.10 })
  },
  hit() {
    // Layer: snap (mid-noise) + thump (sub) + crack (high transient)
    noise({ dur: 0.04, vol: 0.45, lp: 8000, hp: 1200 })       // slap snap
    tone({ freq: 60, freqEnd: 28, type: 'sine', dur: 0.22, vol: 0.55 })  // sub thump
    tone({ freq: 180, freqEnd: 80, type: 'square', dur: 0.06, vol: 0.20 }) // body
    noise({ dur: 0.18, vol: 0.28, lp: 700, hp: 50 })          // body rumble
  },
  bigHit() {
    noise({ dur: 0.05, vol: 0.55, lp: 9000, hp: 1500 })       // attack crack
    tone({ freq: 50, freqEnd: 22, type: 'sine', dur: 0.40, vol: 0.70 })  // deep sub
    tone({ freq: 130, freqEnd: 50, type: 'square', dur: 0.10, vol: 0.30 })
    noise({ dur: 0.32, vol: 0.42, lp: 500, hp: 40 })
  },
  bell() {
    tone({ freq: 880, type: 'sine', dur: 0.45, vol: 0.30, decay: 0.4 })
    tone({ freq: 1320, type: 'sine', dur: 0.45, vol: 0.18, decay: 0.4 })
    setTimeout(() => {
      tone({ freq: 880, type: 'sine', dur: 0.45, vol: 0.28, decay: 0.4 })
      tone({ freq: 1320, type: 'sine', dur: 0.45, vol: 0.16, decay: 0.4 })
    }, 280)
  },
  ko() {
    tone({ freq: 880, freqEnd: 110, type: 'sawtooth', dur: 0.7, vol: 0.35 })
    setTimeout(() => tone({ freq: 660, freqEnd: 80, type: 'sawtooth', dur: 0.9, vol: 0.30 }), 200)
  },
  countTick() {
    tone({ freq: 1200, type: 'square', dur: 0.06, vol: 0.18 })
  },
  crowd() {
    noise({ dur: 1.8, vol: 0.07, lp: 1400, hp: 200 })
  },
}
