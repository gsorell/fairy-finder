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
    up: null,            // slow-smoothed accelerometer: world "up" in the controller's frame
    bias: [0, 0, 0],     // gyro offset, deg/s
    stillMs: 0,
    w: [0, 0, 0],        // bias-corrected gyro, deg/s
  }
}

export function feedMotion(m, a, w) {
  if (!m.grav) { m.grav = [...a]; m.up = [...a] }
  const kFast = DT / 0.06
  const kSlow = DT / 0.4
  for (let i = 0; i < 3; i++) {
    m.grav[i] += (a[i] - m.grav[i]) * kFast
    m.up[i] += (a[i] - m.up[i]) * kSlow
  }
  const raw = minus(w, m.bias)
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
  return { x: 0.5, y: 0.5, pitchAxis: null, yawDir: 1, fov: 42, learn: null }
}

// Calibration, step by step: 'raise' learns the up/down axis from pointing at the floor
// then up at the screen; 'turn' learns which way is right. Returns true when a step is done.
export function learnPointer(p, m, step) {
  if (!p.learn || p.learn.step !== step) p.learn = { step, sum: [0, 0, 0], yaw: 0 }
  const L = p.learn
  if (step === 'raise') {
    if (Math.hypot(...m.w) < 25) return false
    for (let i = 0; i < 3; i++) L.sum[i] += m.w[i] * DT
    if (Math.hypot(...L.sum) < 50) return false
    const up = norm(m.up)
    p.pitchAxis = norm(minus(L.sum, along(L.sum, up)))   // keep it horizontal
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

export function centerPointer(p) {
  p.x = 0.5
  p.y = 0.5
}

// Moves the pointer by one IMU frame. aspect = screen width / height.
export function stepPointer(p, m, aspect) {
  if (!p.pitchAxis) return
  const up = norm(m.up)
  let yawRate = dot(m.w, up)
  let pitchRate = dot(m.w, p.pitchAxis)
  if (Math.abs(yawRate) < 1.2) yawRate = 0      // tiny deadzone keeps a resting hand still
  if (Math.abs(pitchRate) < 1.2) pitchRate = 0
  p.x += (yawRate * p.yawDir * DT) / p.fov
  p.y -= (pitchRate * DT) / (p.fov / aspect)
  // pinning at the edges doubles as recentring: push past the edge and come back
  p.x = Math.min(1, Math.max(0, p.x))
  p.y = Math.min(1, Math.max(0, p.y))
}
