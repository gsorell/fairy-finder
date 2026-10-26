// Balloon Pop: balloons rise up a left lane (blue, left fist) and a right lane
// (red, right fist). Punch to pop the lowest one in your lane. Gold pays triple,
// rainbow needs both fists together, and skunks must be left to float away.
//
// update() and hit() return a list of event names; the screen turns them into
// sounds, so this file stays free of audio and React.

export const W = 960
export const H = 540
export const ROUND_MS = 60000
const LANE_X = { L: 280, R: 680, B: 480 }
const BOTH_WINDOW_MS = 450   // both fists must land this close together on a rainbow

export const LEVELS = {
  easy:   { label: 'Little Kicker', spawn: [1700, 1050], rise: [85, 140],  skunkFrom: 20000, skunk: 0.10, both: 0.08 },
  normal: { label: 'Fighter',       spawn: [1300, 650],  rise: [115, 210], skunkFrom: 10000, skunk: 0.14, both: 0.10 },
  hard:   { label: 'Champion',      spawn: [950, 430],   rise: [160, 290], skunkFrom: 4000,  skunk: 0.18, both: 0.12 },
}

const LEFT_COLORS = ['#3bb4ff', '#5b8cff', '#7c6cff', '#2ad1d1']
const RIGHT_COLORS = ['#ff5a5f', '#ff7a3d', '#ff4f9a', '#ff9f1c']

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const lerp = (a, b, t) => a + (b - a) * t

export function createBalloonGame(level = 'normal') {
  return {
    level: LEVELS[level] ? level : 'normal',
    clock: -3200,          // countdown runs below zero
    phase: 'countdown',    // countdown | play | done
    balloons: [],
    parts: [],
    floaters: [],
    nextId: 1,
    nextSpawn: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    popped: 0,
    missed: 0,
    skunked: 0,
    fists: { L: 0, R: 0 },   // flash timers for the glove icons
    lastCount: 4,
  }
}

function spawn(s) {
  const lv = LEVELS[s.level]
  const p = Math.min(1, s.clock / ROUND_MS)
  const live = s.balloons.filter((b) => !b.done)
  let kind = 'normal'
  const r = Math.random()
  if (r < lv.both && live.length === 0) kind = 'both'
  else if (s.clock > lv.skunkFrom && r < lv.both + lv.skunk) kind = 'skunk'
  else if (r > 0.9) kind = 'gold'

  const lane = kind === 'both' ? 'B' : Math.random() < 0.5 ? 'L' : 'R'
  const rise = rand(...lv.rise) * (1 + p * 0.5) * (kind === 'skunk' ? 1.35 : kind === 'both' ? 0.8 : 1)
  s.balloons.push({
    id: s.nextId++,
    kind,
    lane,
    x: LANE_X[lane] + rand(-40, 40),
    y: H + 70,
    r: kind === 'both' ? 64 : 48,
    vy: rise,
    color: kind === 'gold' ? '#ffd23f' : kind === 'skunk' ? '#7bd389' : pick(lane === 'L' ? LEFT_COLORS : RIGHT_COLORS),
    phase: rand(0, Math.PI * 2),
    hits: { L: -1e9, R: -1e9 },
    done: false,
  })
  // a rainbow gets the screen to itself
  const gap = lerp(lv.spawn[0], lv.spawn[1], p) * rand(0.8, 1.2)
  s.nextSpawn = s.clock + (kind === 'both' ? gap * 2.2 : gap)
}

export function update(s, dt) {
  const events = []
  s.clock += dt
  for (const side of ['L', 'R']) s.fists[side] = Math.max(0, s.fists[side] - dt)

  if (s.phase === 'countdown') {
    const n = Math.ceil(-s.clock / 1000)
    if (n !== s.lastCount && n >= 1 && n <= 3) events.push('count')
    s.lastCount = n
    if (s.clock >= 0) {
      s.phase = 'play'
      events.push('go')
    }
  }
  if (s.phase === 'play') {
    if (s.clock >= ROUND_MS) {
      s.phase = 'done'
      events.push('end')
    } else if (s.clock >= s.nextSpawn) {
      spawn(s)
    }
  }

  for (const b of s.balloons) {
    if (b.done) continue
    b.y -= (b.vy * dt) / 1000
    if (b.y < -b.r * 2) {
      b.done = true
      if (b.kind === 'skunk') {
        s.score += 5
        floater(s, b.x, 60, 'Nice wait! +5', '#7bd389')
        events.push('niceWait')
      } else if (s.phase === 'play') {
        s.missed++
        s.streak = 0
        events.push('miss')
      }
    }
  }
  s.balloons = s.balloons.filter((b) => !b.done || b.y > -400)

  for (const p of s.parts) {
    p.x += (p.vx * dt) / 1000
    p.y += (p.vy * dt) / 1000
    p.vy += (p.g * dt) / 1000
    p.life -= dt
  }
  s.parts = s.parts.filter((p) => p.life > 0)
  for (const f of s.floaters) {
    f.y -= (40 * dt) / 1000
    f.life -= dt
  }
  s.floaters = s.floaters.filter((f) => f.life > 0)
  return events
}

// The target in a lane is its oldest live balloon that has come on screen.
function target(s, side) {
  return s.balloons.find((b) => !b.done && (b.lane === side || b.lane === 'B') && b.y - b.r < H)
}

export function hit(s, side, t) {
  s.fists[side] = 160
  if (s.phase !== 'play') return []
  const b = target(s, side)
  if (!b) return []

  if (b.kind === 'both') {
    b.hits[side] = t
    if (Math.abs(b.hits.L - b.hits.R) > BOTH_WINDOW_MS) return ['half']
    pop(s, b, 50, 'RAINBOW!')
    return ['rainbow']
  }
  if (b.kind === 'skunk') {
    b.done = true
    s.skunked++
    s.streak = 0
    s.score = Math.max(0, s.score - 20)
    burst(s, b, ['#7bd389', '#a3e635', '#c4f1a0'], 34, 0.6)
    floater(s, b.x, b.y, 'P-U! -20', '#a3e635')
    return ['skunk']
  }
  const base = b.kind === 'gold' ? 30 : 10
  const quick = b.y > H * 0.55   // popped low = popped fast
  pop(s, b, base + (quick ? 5 : 0), quick ? 'QUICK!' : null)
  return [b.kind === 'gold' ? 'gold' : 'pop']
}

function pop(s, b, base, label) {
  b.done = true
  s.streak++
  s.bestStreak = Math.max(s.bestStreak, s.streak)
  s.popped++
  const pts = base * multiplier(s)
  s.score += pts
  const colors = b.kind === 'both'
    ? ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ddc84', '#3bb4ff', '#a06bff']
    : [b.color, '#ffffff', '#ffd23f']
  burst(s, b, colors, b.kind === 'both' ? 60 : 28, 1)
  floater(s, b.x, b.y, `${label ? label + ' ' : ''}+${pts}`, b.kind === 'gold' ? '#ffd23f' : '#ffffff')
}

export function multiplier(s) {
  return Math.min(4, 1 + Math.floor(s.streak / 5))
}

function burst(s, b, colors, n, spread) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2)
    const v = rand(120, 420) * spread
    s.parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 520, life: rand(500, 1000), max: 1000, color: pick(colors), size: rand(4, 9) })
  }
}

function floater(s, x, y, text, color) {
  s.floaters.push({ x, y, text, color, life: 900 })
}

// ---------- drawing ----------
export function render(ctx, s, now) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#8fd3ff')
  sky.addColorStop(0.7, '#d7f1ff')
  sky.addColorStop(1, '#fff3d6')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  drawClouds(ctx, now)
  drawLanes(ctx, s)

  for (const b of s.balloons) if (!b.done) drawBalloon(ctx, b, now)

  for (const p of s.parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1

  ctx.textAlign = 'center'
  for (const f of s.floaters) {
    ctx.globalAlpha = Math.min(1, f.life / 400)
    ctx.font = '900 30px system-ui, sans-serif'
    ctx.lineWidth = 6
    ctx.strokeStyle = '#1b2440'
    ctx.strokeText(f.text, f.x, f.y)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1

  drawHud(ctx, s)

  if (s.phase === 'countdown') {
    const n = Math.ceil(-s.clock / 1000)
    bigText(ctx, n > 3 ? 'Get ready!' : n >= 1 ? String(n) : 'GO!', n > 3 ? 64 : 160)
  } else if (s.phase === 'play' && s.clock < 700) {
    bigText(ctx, 'GO!', 160)
  }
}

function drawClouds(ctx, now) {
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  for (let i = 0; i < 4; i++) {
    const x = ((now / 60 + i * 280) % (W + 240)) - 120
    const y = 70 + i * 55
    ctx.beginPath()
    ctx.ellipse(x, y, 60, 22, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 40, y - 12, 44, 24, 0, 0, Math.PI * 2)
    ctx.ellipse(x - 40, y - 4, 36, 18, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawLanes(ctx, s) {
  for (const side of ['L', 'R']) {
    const x = LANE_X[side]
    const col = side === 'L' ? '59,180,255' : '255,90,95'
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, `rgba(${col},0)`)
    g.addColorStop(1, `rgba(${col},0.18)`)
    ctx.fillStyle = g
    ctx.fillRect(x - 130, 0, 260, H)

    // glove at the bottom of each lane, punching up when that fist lands
    const kick = s.fists[side] / 160
    ctx.save()
    ctx.translate(x, H - 34 - kick * 26)
    ctx.scale(1 + kick * 0.3, 1 + kick * 0.3)
    ctx.font = '56px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (side === 'R') ctx.scale(-1, 1)
    ctx.fillText('🥊', 0, 0)
    ctx.restore()

    ctx.font = '900 22px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = side === 'L' ? '#1b6fd8' : '#d8323a'
    ctx.fillText(side === 'L' ? 'LEFT' : 'RIGHT', x + (side === 'L' ? -80 : 80), H - 22)
  }
  ctx.textBaseline = 'alphabetic'
}

function drawBalloon(ctx, b, now) {
  const sway = Math.sin(now / 420 + b.phase) * 10
  const x = b.x + sway
  const y = b.y

  ctx.strokeStyle = 'rgba(60,60,80,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y + b.r * 1.15)
  ctx.quadraticCurveTo(x - 12, y + b.r * 1.7, x + 4, y + b.r * 2.4)
  ctx.stroke()

  if (b.kind === 'both') {
    const g = ctx.createLinearGradient(x - b.r, y - b.r, x + b.r, y + b.r)
    ;['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ddc84', '#3bb4ff', '#a06bff'].forEach((c, i) => g.addColorStop(i / 5, c))
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = b.color
  }
  ctx.beginPath()
  ctx.ellipse(x, y, b.r * 0.86, b.r * 1.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 7, y + b.r * 1.1)
  ctx.lineTo(x + 7, y + b.r * 1.1)
  ctx.lineTo(x, y + b.r * 1.2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath()
  ctx.ellipse(x - b.r * 0.32, y - b.r * 0.45, b.r * 0.16, b.r * 0.28, -0.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (b.kind === 'skunk') {
    ctx.font = `${b.r}px system-ui, sans-serif`
    ctx.fillText('🦨', x, y + 4)
  } else if (b.kind === 'gold') {
    ctx.font = `${b.r * 0.8}px system-ui, sans-serif`
    ctx.fillText('⭐', x, y + 2)
  } else if (b.kind === 'both') {
    ctx.font = '900 22px system-ui, sans-serif'
    ctx.lineWidth = 5
    ctx.strokeStyle = '#1b2440'
    ctx.strokeText('BOTH!', x, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText('BOTH!', x, y)
    // a ring per fist that already landed
    for (const side of ['L', 'R']) {
      if (b.hits[side] < 0) continue
      ctx.strokeStyle = side === 'L' ? '#3bb4ff' : '#ff5a5f'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.ellipse(x, y, b.r * 0.86 + 8, b.r * 1.1 + 8, 0, side === 'L' ? Math.PI / 2 : -Math.PI / 2, side === 'L' ? Math.PI * 1.5 : Math.PI / 2)
      ctx.stroke()
    }
  }
  ctx.textBaseline = 'alphabetic'
}

function drawHud(ctx, s) {
  ctx.textAlign = 'left'
  ctx.font = '900 36px system-ui, sans-serif'
  ctx.lineWidth = 6
  ctx.strokeStyle = '#1b2440'
  ctx.strokeText(String(s.score), 24, 52)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(String(s.score), 24, 52)

  const left = Math.max(0, ROUND_MS - Math.max(0, s.clock))
  ctx.fillStyle = 'rgba(27,36,64,0.25)'
  roundRect(ctx, W / 2 - 160, 22, 320, 16, 8)
  ctx.fillStyle = left < 10000 ? '#ff5a5f' : '#3ddc84'
  roundRect(ctx, W / 2 - 160, 22, 320 * (left / ROUND_MS), 16, 8)
  ctx.textAlign = 'center'
  ctx.font = '800 18px system-ui, sans-serif'
  ctx.fillStyle = '#1b2440'
  ctx.fillText(`${Math.ceil(left / 1000)}s`, W / 2, 62)

  const m = multiplier(s)
  if (s.streak >= 2) {
    ctx.textAlign = 'right'
    ctx.font = '900 28px system-ui, sans-serif'
    ctx.lineWidth = 6
    ctx.strokeStyle = '#1b2440'
    const txt = `${s.streak} streak${m > 1 ? `  x${m}` : ''}`
    ctx.strokeText(txt, W - 24, 50)
    ctx.fillStyle = m > 1 ? '#ffd23f' : '#ffffff'
    ctx.fillText(txt, W - 24, 50)
  }
}

function bigText(ctx, text, size) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${size}px system-ui, sans-serif`
  ctx.lineWidth = 12
  ctx.strokeStyle = '#1b2440'
  ctx.strokeText(text, W / 2, H / 2)
  ctx.fillStyle = '#ffd23f'
  ctx.fillText(text, W / 2, H / 2)
  ctx.textBaseline = 'alphabetic'
}

function roundRect(ctx, x, y, w, h, r) {
  if (w <= 0) return
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2))
  ctx.fill()
}
