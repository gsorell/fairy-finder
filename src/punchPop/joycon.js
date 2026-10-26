// Joy-Con strikes over WebHID: IMU in, HD rumble out, plus the strike detector
// that was tuned by hand in a punch-feedback prototype. WebHID is desktop
// Chrome / Edge only; everywhere else the game falls back to keys and taps.
//
// Listeners get { type: 'strike', side, t, speed } the moment a strike is
// detected, { type: 'peak', side, speed } once its peak speed is known, and
// { type: 'status' } when a controller connects or drops.

export const hidSupported = typeof navigator !== 'undefined' && 'hid' in navigator

const NINTENDO = 0x057e
const PRODUCT = { L: 0x2006, R: 0x2007 }
const NEUTRAL = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40]
const ACC_G = 0.000244      // ±8 g range, g per LSB
const SAMPLE_S = 0.005      // IMU frames are 5 ms apart
const VEL_TAU_S = 0.15      // velocity estimate leaks back to zero on this scale, bounding drift
const GRAVITY_TAU_S = 1.0   // slow average of raw acceleration = gravity (a punch nets to zero)
const REARM_DIP = 0.6       // re-arm once speed falls to 60% of the last strike's peak
const RETRACT_DOT = -0.5    // motion this opposed to the hand's last strike is the pull-back
const RETRACT_MS = 400      // ...but only shortly after it
const EARLY_FLOOR = 0.5     // a projected crossing needs real speed at half the threshold

// What a landed strike feels like: short and front-loaded, so it reads as contact
// at full extension rather than a buzz that runs on through the pull-back.
export const IMPACTS = {
  thud: [[100, 200, 1.0, 35], [80, 160, 0.35, 35]],
  snap: [[180, 360, 1.0, 25], [160, 320, 0.25, 20]],
  buzz: [[160, 320, 1.0, 160]],
}

// speedThr is set per player by the game; the rest persist across sessions.
export const tuning = { speedThr: 3.0, refractory: 110, leadMs: 50, impact: 'thud', buzz: true }
const TUNING_KEY = 'punch-pop-tuning'
try {
  const saved = JSON.parse(localStorage.getItem(TUNING_KEY) || '{}')
  for (const k of ['refractory', 'leadMs', 'impact', 'buzz']) if (k in saved) tuning[k] = saved[k]
} catch { /* storage unavailable: defaults */ }
export function saveTuning() {
  try {
    const { refractory, leadMs, impact, buzz } = tuning
    localStorage.setItem(TUNING_KEY, JSON.stringify({ refractory, leadMs, impact, buzz }))
  } catch { /* not persisted */ }
}

const listeners = new Set()
export function onJoyCon(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit(ev) {
  for (const fn of listeners) fn(ev)
}

// ---------- rumble encoding (dekuNukem's Switch reverse-engineering notes) ----------
function encodeRumble(lowHz, highHz, amp) {
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b)
  const hf = (Math.round(32 * Math.log2(clamp(highHz, 81.75, 1252.57) / 10)) - 0x60) * 4
  const lf = Math.round(32 * Math.log2(clamp(lowHz, 40.88, 626.29) / 10)) - 0x40
  amp = clamp(amp, 0, 1)
  let hfAmp
  if (amp === 0) hfAmp = 0
  else if (amp < 0.117) hfAmp = (Math.log2(amp * 1000) * 32 - 0x60) / (5 - amp * amp) - 1
  else if (amp < 0.23) hfAmp = Math.log2(amp * 1000) * 32 - 0x60 - 0x5c
  else hfAmp = (Math.log2(amp * 1000) * 32 - 0x60) * 2 - 0xf6
  hfAmp = Math.max(0, Math.round(hfAmp / 2) * 2)   // HF amplitude codes are even
  let lfAmp = hfAmp / 2
  const odd = lfAmp % 2
  lfAmp = ((lfAmp - odd) >> 1) + 0x40
  if (odd) lfAmp |= 0x8000
  const half = [hf & 0xff, (hfAmp + ((hf >>> 8) & 0xff)) & 0xff, (lf + ((lfAmp >>> 8) & 0xff)) & 0xff, lfAmp & 0xff]
  return [...half, ...half]
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Pad {
  constructor(device, side) {
    this.device = device
    this.side = side
    this.counter = 0
    this.chain = Promise.resolve()
    this.stopTimer = null
    this.battery = null
  }
  send(reportId, bytes) {
    this.chain = this.chain
      .then(() => this.device.sendReport(reportId, new Uint8Array(bytes)))
      .catch((e) => console.warn(`Joy-Con ${this.side} write failed`, e))
    return this.chain
  }
  tick() {
    const c = this.counter
    this.counter = (c + 1) & 0x0f
    return c
  }
  subcommand(id, args) {
    return this.send(0x01, [this.tick(), ...NEUTRAL, id, ...args])
  }
  // steps of [lowHz, highHz, amp, ms], played back to back, then silence
  pattern(steps) {
    clearTimeout(this.stopTimer)
    let i = 0
    const next = () => {
      if (i >= steps.length) {
        // A Joy-Con keeps rumbling until told to stop, so a lost stop packet turns a
        // short thud into a long buzz. Send it twice.
        this.send(0x10, [this.tick(), ...NEUTRAL])
        this.stopTimer = setTimeout(() => this.send(0x10, [this.tick(), ...NEUTRAL]), 30)
        return
      }
      const [lowHz, highHz, amp, ms] = steps[i++]
      this.send(0x10, [this.tick(), ...encodeRumble(lowHz, highHz, amp)])
      this.stopTimer = setTimeout(next, ms)
    }
    next()
  }
  async init() {
    if (!this.device.opened) await this.device.open()
    this.device.addEventListener('inputreport', (e) => this.onReport(e))
    await this.subcommand(0x48, [0x01]); await sleep(60)   // enable vibration
    await this.subcommand(0x40, [0x01]); await sleep(60)   // enable IMU
    await this.subcommand(0x03, [0x30]); await sleep(60)   // full report mode: 60 Hz, 3 IMU frames each
    await this.subcommand(0x30, [this.side === 'L' ? 0x01 : 0x02])   // player light, stops the pairing sweep
  }
  onReport(e) {
    if (e.reportId !== 0x30 || e.data.byteLength < 48) return
    const d = e.data
    const now = performance.now()
    this.battery = d.getUint8(1) >> 4
    for (let i = 0; i < 3; i++) {
      const o = 12 + i * 12
      const a = [d.getInt16(o, true) * ACC_G, d.getInt16(o + 2, true) * ACC_G, d.getInt16(o + 4, true) * ACC_G]
      sample(this.side, now - (2 - i) * 5, a)
    }
  }
}

export const pads = { L: null, R: null }
const sideOf = (device) => (device.productId === PRODUCT.L ? 'L' : device.productId === PRODUCT.R ? 'R' : null)
const BATTERY = { 8: 'full', 6: 'good', 4: 'low', 2: 'very low', 0: 'empty' }

export function padStatus(side) {
  const p = pads[side]
  if (!p) return null
  return p.battery === null ? 'connected' : `battery ${BATTERY[p.battery & 0x0e] ?? '?'}`
}

async function attach(device) {
  const side = sideOf(device)
  if (!side || (pads[side] && pads[side].device === device)) return
  const pad = new Pad(device, side)
  try {
    await pad.init()
  } catch (e) {
    console.error(e)
    return
  }
  pads[side] = pad
  pad.pattern(IMPACTS.thud)
  emit({ type: 'status' })
}

export async function connectJoyCon() {
  if (!hidSupported) return
  const devices = await navigator.hid.requestDevice({
    filters: [{ vendorId: NINTENDO, productId: PRODUCT.L }, { vendorId: NINTENDO, productId: PRODUCT.R }],
  })
  for (const d of devices) await attach(d)
}

// Reattach controllers this site was already granted, and follow plug / unplug.
let watching = false
export function watchJoyCons() {
  if (!hidSupported || watching) return
  watching = true
  navigator.hid.getDevices().then((ds) => ds.forEach(attach))
  navigator.hid.addEventListener('connect', (e) => attach(e.device))
  navigator.hid.addEventListener('disconnect', (e) => {
    const side = sideOf(e.device)
    if (side && pads[side]?.device === e.device) {
      pads[side] = null
      emit({ type: 'status' })
    }
  })
}

export function buzz(side, kind = tuning.impact) {
  pads[side]?.pattern(IMPACTS[kind] ?? IMPACTS.thud)
}

// ---------- strike detection ----------
// Velocity estimate: acceleration minus gravity, integrated as a vector with a slow
// leak back to zero. A twitch spikes hard but briefly, a committed punch sustains it.
// Keeping direction makes the stop at full extension cancel the drive (so speed dips
// between tight doubles) and lets the pull-back, which points the other way, be ignored.
const newDet = () => ({ armed: true, last: -1e9, top: 0, peak: null, vel: [0, 0, 0], lin: [0, 0, 0], grav: null, dir: null })
const det = { L: newDet(), R: newDet() }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function sample(side, t, a) {
  const s = det[side]
  if (!s.grav) s.grav = [...a]
  const k = SAMPLE_S / GRAVITY_TAU_S
  const leak = Math.exp(-SAMPLE_S / VEL_TAU_S)
  for (let i = 0; i < 3; i++) {
    s.grav[i] += (a[i] - s.grav[i]) * k
    s.lin[i] = (a[i] - s.grav[i]) * 9.81
    s.vel[i] = s.vel[i] * leak + s.lin[i] * SAMPLE_S
  }
  const vel = s.vel
  const speed = Math.hypot(...vel)

  if (s.peak) {
    if (t - s.peak.t0 < 150) s.peak.v = Math.max(s.peak.v, speed)
    else {
      emit({ type: 'peak', side, speed: s.peak.v })
      s.peak = null
    }
  }

  // Fire on where speed is heading, not where it is: while the fist is still speeding
  // up, project it leadMs ahead so the buzz lands at extension after the Bluetooth trip.
  const thr = tuning.speedThr
  const lead = tuning.leadMs / 1000
  const projected = Math.hypot(vel[0] + s.lin[0] * lead, vel[1] + s.lin[1] * lead, vel[2] + s.lin[2] * lead)
  const early = dot(vel, s.lin) > 0 && speed >= thr * EARLY_FLOOR && projected >= thr
  const over = speed >= thr || early
  const calm = speed < thr * 0.4

  if (!s.armed) {
    s.top = Math.max(s.top, speed)
    if (calm || speed < s.top * REARM_DIP) s.armed = true
  }
  if (over && s.armed && t - s.last >= tuning.refractory) {
    s.armed = false
    s.top = speed
    const dir = speed > 0.5 ? vel.map((v) => v / speed) : null
    const pullBack = dir && s.dir && t - s.last < RETRACT_MS && dot(dir, s.dir) < RETRACT_DOT
    if (!pullBack) {
      s.last = t
      s.peak = { t0: t, v: speed }
      if (dir) s.dir = dir
      strike(side, t, speed)
    }
  }
}

function strike(side, t, speed) {
  if (tuning.buzz) buzz(side)
  emit({ type: 'strike', side, t, speed })
}

// Keyboard and touch stand in for a punch; a connected Joy-Con still buzzes.
export function simulateStrike(side) {
  strike(side, performance.now(), null)
}
