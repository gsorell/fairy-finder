// Joy-Con device layer over WebHID, shared by every Joy-Con game in the arcade:
// connecting, motion (IMU), buttons, player lights and HD rumble.
// WebHID is desktop Chrome / Edge only; games fall back to keys, mouse and touch.
//
// Subscribers to onHid() get:
//   { type: 'imu', side, t, a: [x, y, z] in g, w: [x, y, z] in deg/s }   200 per second per Joy-Con
//   { type: 'button', side, t, name, down }                              on every press and release
//   { type: 'status' }                                                   when a Joy-Con connects or drops

export const hidSupported = typeof navigator !== 'undefined' && 'hid' in navigator

const NINTENDO = 0x057e
const PRODUCT = { L: 0x2006, R: 0x2007 }
const NEUTRAL_HALF = [0x00, 0x01, 0x40, 0x40]
const NEUTRAL = [...NEUTRAL_HALF, ...NEUTRAL_HALF]
const ACC_G = 0.000244      // ±8 g range, g per LSB
const GYRO_DPS = 0.061      // ±2000 dps range, deg/s per LSB

// Button bits in report 0x30, per dekuNukem's Switch reverse-engineering notes. Face
// buttons are named by compass position, so a game reads the same on either Joy-Con
// (right: X north, A east, B south, Y west; left: the four arrow buttons).
const BUTTONS = {
  R: [[2, 0x80, 'trigger'], [2, 0x40, 'bumper'], [2, 0x10, 'sr'], [2, 0x20, 'sl'],
    [2, 0x02, 'north'], [2, 0x08, 'east'], [2, 0x04, 'south'], [2, 0x01, 'west'],
    [3, 0x02, 'plus'], [3, 0x04, 'stick'], [3, 0x10, 'home']],
  L: [[4, 0x80, 'trigger'], [4, 0x40, 'bumper'], [4, 0x10, 'sr'], [4, 0x20, 'sl'],
    [4, 0x02, 'north'], [4, 0x04, 'east'], [4, 0x01, 'south'], [4, 0x08, 'west'],
    [3, 0x01, 'minus'], [3, 0x08, 'stick'], [3, 0x20, 'capture']],
}

const listeners = new Set()
export function onHid(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit(ev) {
  for (const fn of listeners) fn(ev)
}

// ---------- rumble encoding ----------
export function encodeRumble(lowHz, highHz, amp) {
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
    this.battery = null
    this.held = new Set()
    // rumble: a one-shot pattern plays over the continuous "hum", then the hum resumes
    this.hum = NEUTRAL
    this.humSent = null
    this.humBusy = false
    this.patternTimer = null
    this.inPattern = false
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
  sendRumble(bytes) {
    return this.send(0x10, [this.tick(), ...bytes])
  }
  // steps of [lowHz, highHz, amp, ms], played back to back
  pattern(steps) {
    clearTimeout(this.patternTimer)
    this.inPattern = true
    let i = 0
    const next = () => {
      if (i >= steps.length) {
        // A Joy-Con keeps rumbling until told otherwise, so a lost packet would leave a
        // short thud buzzing on. Settle back to the hum (or silence) twice.
        this.inPattern = false
        this.humSent = null
        this.sendRumble(this.hum)
        this.patternTimer = setTimeout(() => { if (!this.inPattern) this.flushHum() }, 30)
        return
      }
      const [lowHz, highHz, amp, ms] = steps[i++]
      this.sendRumble(encodeRumble(lowHz, highHz, amp))
      this.patternTimer = setTimeout(next, ms)
    }
    next()
  }
  // A continuous rumble that stays until changed. Updates are coalesced so a game can
  // call this every frame without queueing a backlog of Bluetooth writes.
  setHum(bytes) {
    this.hum = bytes
    if (!this.inPattern) this.flushHum()
  }
  flushHum() {
    if (this.humBusy) return
    const same = this.humSent && this.humSent.every((b, i) => b === this.hum[i])
    if (same) return
    this.humBusy = true
    const bytes = this.hum
    this.sendRumble(bytes).then(() => sleep(15)).then(() => {
      this.humBusy = false
      this.humSent = bytes
      if (!this.inPattern) this.flushHum()
    })
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

    for (const [byte, bit, name] of BUTTONS[this.side]) {
      const down = (d.getUint8(byte) & bit) !== 0
      if (down === this.held.has(name)) continue
      if (down) this.held.add(name)
      else this.held.delete(name)
      emit({ type: 'button', side: this.side, t: now, name, down })
    }

    for (let i = 0; i < 3; i++) {
      const o = 12 + i * 12
      emit({
        type: 'imu',
        side: this.side,
        t: now - (2 - i) * 5,
        a: [d.getInt16(o, true) * ACC_G, d.getInt16(o + 2, true) * ACC_G, d.getInt16(o + 4, true) * ACC_G],
        w: [d.getInt16(o + 6, true) * GYRO_DPS, d.getInt16(o + 8, true) * GYRO_DPS, d.getInt16(o + 10, true) * GYRO_DPS],
      })
    }
  }
}

export const pads = { L: null, R: null }
const sideOf = (device) => (device.productId === PRODUCT.L ? 'L' : device.productId === PRODUCT.R ? 'R' : null)
const BATTERY = { 8: 'full', 6: 'good', 4: 'low', 2: 'very low', 0: 'empty' }

export function padStatus(side) {
  const p = pads[side]
  if (!p) return null
  return p.battery == null ? 'connected' : `battery ${BATTERY[p.battery & 0x0e] ?? '?'}`
}

export function isHeld(side, name) {
  return pads[side]?.held.has(name) ?? false
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
  pads[side] = pad   // no hello buzz: the player light going steady confirms the connection
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

// ---------- rumble API ----------
export function rumblePattern(side, steps) {
  pads[side]?.pattern(steps)
}
export function rumbleHum(side, lowHz, highHz, amp) {
  pads[side]?.setHum(amp > 0.01 ? encodeRumble(lowHz, highHz, amp) : NEUTRAL)
}
export function rumbleStop(side) {
  pads[side]?.setHum(NEUTRAL)
}

// Dev-only hook so a headless browser can drive games without hardware: inject
// events, and stand a fake controller in pads[side] (held, pattern, setHum).
export function injectHid(ev) {
  emit({ t: performance.now(), ...ev })
}
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__joycon = { inject: injectHid, pads }
