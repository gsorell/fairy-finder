// Orientation from raw Joy-Con IMU frames: a gravity estimate, gyro bias learned
// whenever the controller sits still, tilt against a calibrated "level", and an
// air pointer driven by the gyro.
//
// Nothing here assumes which way the IMU's axes face inside the controller. Tilt
// learns "forward" from the player tipping it toward the screen; the pointer learns
// its up/down axis from a raise and its left/right sign from a turn. That keeps it
// working however the Joy-Con is held, and for left and right controllers alike.

const DT = 0.005   // IMU frames are 5 ms apart

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const norm = (a) => {
  const m = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / m, a[1] / m, a[2] / m]
}
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const along = (v, n) => { const d = dot(v, n); return [n[0] * d, n[1] * d, n[2] * d] }
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

export function createMotion() {
  return {
    grav: null,          // fast-smoothed accelerometer (g): what tilt reads
    up: null,            // world "up" in the controller's frame: gyro-tracked, gravity-corrected
    bias: [0, 0, 0],     // gyro offset, deg/s
    stillMs: 0,
    w: [0, 0, 0],        // bias-corrected gyro, deg/s
  }
}

export function feedMotion(m, a, w) {
  if (!m.grav) { m.grav = [...a]; m.up = norm(a) }
  const raw = minus(w, m.bias)
  const kFast = DT / 0.06
  for (let i = 0; i < 3; i++) m.grav[i] += (a[i] - m.grav[i]) * kFast
  // "Up" turns with the controller at once (a fixed world direction seen from a turning
  // body moves as -w × up), and leans slowly toward the accelerometer to cancel drift.
  // Smoothing the accelerometer alone lags a fast swing by most of a second.
  const wr = raw.map((v) => (v * Math.PI) / 180)
  const turn = cross(wr, m.up)
  const kGrav = DT / 0.5
  const g = norm(a)
  m.up = norm(m.up.map((v, i) => v - turn[i] * DT + (g[i] - v) * kGrav))
  // Still: about 1 g of pure gravity and barely turning. After a moment of that,
  // creep the bias toward the reading, so the pointer stops drifting on its own.
  const still = Math.abs(Math.hypot(...a) - 1) < 0.06 && Math.hypot(...raw) < 6
  m.stillMs = still ? m.stillMs + DT * 1000 : 0
  if (m.stillMs > 400) for (let i = 0; i < 3; i++) m.bias[i] += (w[i] - m.bias[i]) * 0.02
  m.w = raw
}

export const isStill = (m, ms = 600) => m.stillMs >= ms

// ---------- tilt ----------
// cal.level: "up" while the player held it flat. cal.forward: the direction it rolls
// when tipped toward the screen, learned from the first big tip.
export function levelNow(m) {
  return { level: norm(m.grav), forward: null }
}

// Which way, and how hard, a marble on top would roll: screen x right, y down,
// each roughly sin(tilt angle). Before forward is known, x / y are null.
export function tilt(m, cal) {
  const d = minus(m.grav, along(m.grav, cal.level))
  const roll = [-d[0], -d[1], -d[2]]
  const mag = Math.hypot(...roll)
  if (!cal.forward) {
    if (mag > 0.22) cal.forward = norm(roll)   // about 13 degrees of tip
    return { x: null, y: null, mag }
  }
  const right = cross(cal.forward, cal.level)
  return { x: dot(roll, right), y: -dot(roll, cal.forward), mag }
}

// ---------- air pointer ----------
export function createPointer() {
  return { x: 0.5, y: 0.5, aim: null, yawDir: 1, fov: 42, learn: null }
}

// Calibration, step by step: 'floor' learns which way the wand points (whatever faces
// down while it is held still at the floor); 'turn' learns which way is right.
// Returns true when a step is done.
//
// Up/down is not learned from a motion: an earlier version took the first big swing
// as "raise", and a player who lowered the wand to the floor first got it backwards.
export function learnPointer(p, m, step) {
  if (!p.learn || p.learn.step !== step) p.learn = { step, yaw: 0 }
  const L = p.learn
  if (step === 'floor') {
    if (!isStill(m, 1000)) return false   // long enough to learn the gyro bias too
    p.aim = norm(m.up).map((v) => -v)
    return true
  }
  if (step === 'turn') {
    L.yaw += dot(m.w, norm(m.up)) * DT
    if (Math.abs(L.yaw) < 25) return false
    p.yawDir = Math.sign(L.yaw)   // that turn was to the right, so it moves the pointer right
    return true
  }
  return false
}

// How far above the horizon the wand points, in degrees: absolute, so it never drifts.
export function elevation(p, m) {
  if (!p.aim || !m.up) return 0
  return (Math.asin(Math.max(-1, Math.min(1, dot(p.aim, m.up)))) * 180) / Math.PI
}

// Re-centres on wherever the wand points now. Pass the motion tracker so the screen's
// middle is remembered as this height too.
export function centerPointer(p, m) {
  pointAt(p, m, 0.5, 0.5)
}

// Re-centres so wherever the wand points now reads as (x, y) on screen: used when a
// player aims at an on-screen mark and pulls the trigger. aspect = width / height.
export function pointAt(p, m, x, y, aspect = 16 / 9) {
  p.x = x
  p.y = y
  if (m) p.elev0 = elevation(p, m) - (0.5 - y) * (p.fov / aspect)
}

// Moves the pointer by one IMU frame. aspect = screen width / height.
//
// Left/right is the gyro alone (nothing measures heading), so it drifts slowly and
// pins at the screen edges, which doubles as a way to recentre. Up/down is the
// absolute elevation, so it never drifts: point at the floor and back, and the
// pointer comes back to the same height.
export function stepPointer(p, m, aspect) {
  if (!p.aim) return
  let yawRate = dot(m.w, m.up)
  if (Math.abs(yawRate) < 1.2) yawRate = 0      // tiny deadzone keeps a resting hand still
  p.x += (yawRate * p.yawDir * DT) / p.fov
  p.x = Math.min(1, Math.max(0, p.x))
  p.y = Math.min(1, Math.max(0, 0.5 - (elevation(p, m) - (p.elev0 ?? 0)) / (p.fov / aspect)))
}
