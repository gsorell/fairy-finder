// Punch Pop's strike detector, tuned by hand in a punch-feedback prototype, on top of
// the shared Joy-Con layer in ../joycon/hid.js. It only listens while Punch Pop is
// on screen (startStrikes), so other Joy-Con games never get punch buzzes.
//
// Listeners get { type: 'strike', side, t, speed } the moment a strike is
// detected, { type: 'peak', side, speed } once its peak speed is known, and
// { type: 'status' } when a controller connects or drops.

import { onHid, rumblePattern } from '../joycon/hid.js'
export { hidSupported, connectJoyCon, watchJoyCons, padStatus } from '../joycon/hid.js'

const SAMPLE_S = 0.005      // IMU frames are 5 ms apart
const VEL_TAU_S = 0.15      // velocity estimate leaks back to zero on this scale, bounding drift
const GRAVITY_TAU_S = 1.0   // slow average of raw acceleration = gravity (a punch nets to zero)
const REARM_DIP = 0.6       // re-arm once speed falls to 60% of the last strike's peak
const RETRACT_DOT = -0.5    // motion this opposed to the hand's last strike is the pull-back
const RETRACT_MS = 400      // ...but only shortly after it

// What a landed strike feels like: short and front-loaded, so it reads as contact
// at full extension rather than a buzz that runs on through the pull-back.
export const IMPACTS = {
  thud: [[100, 200, 1.0, 35], [80, 160, 0.35, 35]],
  snap: [[180, 360, 1.0, 25], [160, 320, 0.25, 20]],
  buzz: [[160, 320, 1.0, 160]],
}

// speedThr is set per player by the game; the rest persist across sessions.
export const tuning = { speedThr: 3.0, refractory: 110, impact: 'thud', buzz: true, graph: true }
const TUNING_KEY = 'punch-pop-tuning'
const SAVED_TUNING = ['refractory', 'impact', 'buzz', 'graph']
try {
  const saved = JSON.parse(localStorage.getItem(TUNING_KEY) || '{}')
  for (const k of SAVED_TUNING) if (k in saved) tuning[k] = saved[k]
} catch { /* storage unavailable: defaults */ }
export function saveTuning() {
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(Object.fromEntries(SAVED_TUNING.map((k) => [k, tuning[k]]))))
  } catch { /* not persisted */ }
}

// Recent history for the punch graph: speed per hand, plus a mark for every
// strike (counted) and every pull-back (ignored).
export const TRACE_MS = 5000
export const traces = { L: [], R: [] }
export const marks = []
function trace(side, t, speed) {
  const tr = traces[side]
  tr.push([t, speed])
  while (tr.length && tr[0][0] < t - TRACE_MS - 500) tr.shift()
}
function mark(side, t, ignored = false) {
  marks.push({ side, t, ignored })
  while (marks.length && marks[0].t < t - TRACE_MS - 500) marks.shift()
}

const listeners = new Set()
export function onJoyCon(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit(ev) {
  for (const fn of listeners) fn(ev)
}

export function buzz(side, kind = tuning.impact) {
  rumblePattern(side, IMPACTS[kind] ?? IMPACTS.thud)
}

// Turns the detector on; returns the function that turns it off again.
export function startStrikes() {
  return onHid((ev) => {
    if (ev.type === 'imu') sample(ev.side, ev.t, ev.a)
    else if (ev.type === 'status') emit(ev)
  })
}

// ---------- strike detection ----------
// Velocity estimate: acceleration minus gravity, integrated as a vector with a slow
// leak back to zero. A twitch spikes hard but briefly, a committed punch sustains it.
// Keeping direction makes the stop at full extension cancel the drive (so speed dips
// between tight doubles) and lets the pull-back, which points the other way, be ignored.
const newDet = () => ({ armed: true, last: -1e9, top: 0, peak: null, vel: [0, 0, 0], grav: null, dir: null })
const det = { L: newDet(), R: newDet() }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function sample(side, t, a) {
  const s = det[side]
  if (!s.grav) s.grav = [...a]
  const k = SAMPLE_S / GRAVITY_TAU_S
  const leak = Math.exp(-SAMPLE_S / VEL_TAU_S)
  for (let i = 0; i < 3; i++) {
    s.grav[i] += (a[i] - s.grav[i]) * k
    s.vel[i] = s.vel[i] * leak + (a[i] - s.grav[i]) * 9.81 * SAMPLE_S
  }
  const vel = s.vel
  const speed = Math.hypot(...vel)
  trace(side, t, speed)

  if (s.peak) {
    if (t - s.peak.t0 < 150) s.peak.v = Math.max(s.peak.v, speed)
    else {
      emit({ type: 'peak', side, speed: s.peak.v })
      s.peak.mark.peak = s.peak.v   // the graph labels the strike with it
      s.peak = null
    }
  }

  // Only a punch that really reaches the threshold counts (and buzzes). An earlier
  // version fired on a projected crossing to buzz sooner, but that buzzed punches
  // that peaked just under the line. For an earlier buzz, lower the threshold.
  const thr = tuning.speedThr
  const over = speed >= thr
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
    if (pullBack) {
      mark(side, t, true)
    } else {
      s.last = t
      if (dir) s.dir = dir
      strike(side, t, speed)
      s.peak = { t0: t, v: speed, mark: marks[marks.length - 1] }
    }
  }
}

function strike(side, t, speed) {
  mark(side, t)
  if (tuning.buzz) buzz(side)
  emit({ type: 'strike', side, t, speed })
}

// Keyboard and touch stand in for a punch; a connected Joy-Con still buzzes.
// The graph gets a spike just over the line so a key press reads like a punch.
export function simulateStrike(side) {
  const t = performance.now()
  const peak = tuning.speedThr * 1.3
  trace(side, t - 10, 0)
  trace(side, t, peak)
  trace(side, t + 10, 0)
  strike(side, t, null)
}
