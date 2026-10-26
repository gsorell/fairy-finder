// Synthesized carnival SFX via WebAudio, plus a voice via speechSynthesis.

let ctx = null
let master = null

function ensureCtx() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.6
  master.connect(ctx.destination)
  return ctx
}

export function unlockAudio() {
  const c = ensureCtx()
  if (c && c.state === 'suspended') c.resume()
}

function tone({ freq = 440, type = 'sine', dur = 0.12, vol = 0.2, delay = 0, freqEnd = null, attack = 0.004 }) {
  const c = ensureCtx()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise({ dur = 0.1, vol = 0.3, lp = 4000, hp = 200, delay = 0 }) {
  const c = ensureCtx()
  if (!c) return
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const low = c.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = lp
  const high = c.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = hp
  const g = c.createGain()
  g.gain.value = vol
  src.connect(high)
  high.connect(low)
  low.connect(g)
  g.connect(master)
  src.start(t0)
}

export const sfx = {
  clack(force) {
    tone({ freq: 900 + force * 400, type: 'triangle', dur: 0.05, vol: 0.05 + force * 0.15 })
  },
  gem() {
    ;[1319, 1760].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.14, delay: i * 0.06 }))
  },
  fall() {
    tone({ freq: 600, freqEnd: 90, type: 'sine', dur: 0.6, vol: 0.2 })
  },
  goal() {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: i === 4 ? 0.5 : 0.14, vol: 0.18, delay: i * 0.1 }))
  },
  tick() {
    tone({ freq: 1500, type: 'square', dur: 0.03, vol: 0.05 })
  },
  click() {
    tone({ freq: 700, type: 'square', dur: 0.04, vol: 0.08 })
  },
  ready() {
    tone({ freq: 880, type: 'sine', dur: 0.12, vol: 0.14 })
  },
  heartbeat() {
    tone({ freq: 70, type: 'sine', dur: 0.12, vol: 0.35 })
    tone({ freq: 60, type: 'sine', dur: 0.14, vol: 0.25, delay: 0.16 })
  },
  fire() {
    tone({ freq: 1568, type: 'square', dur: 0.35, vol: 0.12 })
    tone({ freq: 2093, type: 'square', dur: 0.35, vol: 0.08 })
  },
  pop() {
    noise({ dur: 0.18, vol: 0.6, lp: 3000, hp: 120 })
    tone({ freq: 300, freqEnd: 900, type: 'triangle', dur: 0.15, vol: 0.2 })
  },
  foul() {
    tone({ freq: 220, freqEnd: 110, type: 'sawtooth', dur: 0.45, vol: 0.12 })
  },
  win() {
    ;[784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.6 : 0.15, vol: 0.18, delay: i * 0.12 }))
  },
  ding() {
    tone({ freq: 1568, type: 'sine', dur: 0.6, vol: 0.2 })
    tone({ freq: 1568 * 2.76, type: 'sine', dur: 0.3, vol: 0.04 })
  },
}

let voice = null
function pickVoice() {
  const vs = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'))
  voice = vs.find((v) => /natural|google us/i.test(v.name)) || vs[0] || null
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice()
  window.speechSynthesis.addEventListener('voiceschanged', pickVoice)
}

export function say(text) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1.05
  if (voice) u.voice = voice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function hush() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
