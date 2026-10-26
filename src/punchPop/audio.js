// Synthesized party SFX via WebAudio, plus the coach's voice via speechSynthesis.

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

function tone({ freq = 440, type = 'sine', dur = 0.12, vol = 0.25, delay = 0, freqEnd = null, attack = 0.004 }) {
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
  pop() {
    noise({ dur: 0.07, vol: 0.55, lp: 6000, hp: 900 })
    tone({ freq: 1100, freqEnd: 320, type: 'triangle', dur: 0.12, vol: 0.22 })
  },
  // rises with the streak, so a hot run sounds like it is climbing
  streak(n) {
    tone({ freq: 520 * Math.pow(2, Math.min(n, 24) / 24), type: 'square', dur: 0.08, vol: 0.06, delay: 0.03 })
  },
  gold() {
    ;[988, 1319, 1568, 1976].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.16, delay: i * 0.05 }))
  },
  rainbow() {
    ;[523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.14, delay: i * 0.045 }))
  },
  half() {
    tone({ freq: 660, type: 'sine', dur: 0.1, vol: 0.12 })
  },
  skunk() {
    noise({ dur: 0.35, vol: 0.4, lp: 700, hp: 60 })
    tone({ freq: 180, freqEnd: 70, type: 'sawtooth', dur: 0.4, vol: 0.12 })
  },
  miss() {
    tone({ freq: 330, freqEnd: 196, type: 'triangle', dur: 0.25, vol: 0.12 })
  },
  niceWait() {
    tone({ freq: 784, type: 'sine', dur: 0.1, vol: 0.12 })
    tone({ freq: 1047, type: 'sine', dur: 0.14, vol: 0.12, delay: 0.08 })
  },
  // the rear hand rings a little higher, so you can hear which fist landed
  ding(side) {
    const f = side === 'L' ? 1320 : 1568
    tone({ freq: f, type: 'sine', dur: 0.5, vol: 0.22, attack: 0.003 })
    tone({ freq: f * 2.76, type: 'sine', dur: 0.3, vol: 0.05, attack: 0.003 })
  },
  count() {
    tone({ freq: 660, type: 'square', dur: 0.12, vol: 0.1 })
  },
  go() {
    tone({ freq: 990, type: 'square', dur: 0.32, vol: 0.12 })
  },
  buzzer() {
    tone({ freq: 140, type: 'sawtooth', dur: 0.5, vol: 0.14 })
  },
  fanfare() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.6 : 0.16, vol: 0.18, delay: i * 0.13 }))
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

// Speaks a line; onStart / onEnd fire when the voice really starts and stops.
export function speak(text, { onStart, onEnd, rate = 1.05 } = {}) {
  if (!('speechSynthesis' in window)) {
    onStart?.()
    setTimeout(() => onEnd?.(), 600)
    return
  }
  // Some browsers never fire onstart / onend (no voices installed, background tab).
  // Each callback runs once, from the voice if it reports in, or from a timer if not.
  let started = false
  let ended = false
  const start = () => { if (!started) { started = true; onStart?.() } }
  const end = () => { if (!ended) { ended = true; start(); onEnd?.() } }
  setTimeout(start, 400)
  setTimeout(end, 1500 + text.length * 80)

  const u = new SpeechSynthesisUtterance(text)
  u.rate = rate
  if (voice) u.voice = voice
  u.onstart = start
  u.onend = end
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function hush() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
