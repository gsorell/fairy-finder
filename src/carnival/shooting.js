// Quick Draw's shooting: crosshairs, targets, the Duel desert and the Target Gallery
// booth. Logic and drawing only; QuickDraw.jsx turns events into sound and rumble.

export const W = 960
export const H = 540
export const SIDE_COLOR = { L: '#3bb4ff', R: '#ff5a5f', M: '#3bb4ff' }
const INK = '#2a1a3e'

const rand = (a, b) => a + Math.random() * (b - a)

// ---------- shared drawing ----------
export function drawCrosshair(ctx, x, y, color, flash = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ring(ctx, 22)
  ctx.lineWidth = 3.5
  ctx.strokeStyle = color
  ring(ctx, 22)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.beginPath()
    ctx.moveTo(dx * 12, dy * 12)
    ctx.lineTo(dx * 32, dy * 32)
    ctx.stroke()
  }
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
  ctx.fill()
  if (flash > 0) {
    ctx.globalAlpha = flash
    ctx.fillStyle = '#fff6b0'
    ctx.beginPath()
    ctx.arc(0, 0, 30 * (1.4 - flash), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
function ring(ctx, r) {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()
}

export function drawBullseye(ctx, x, y, r, rings = ['#ff5a5f', '#ffffff']) {
  for (let i = 5; i >= 1; i--) {
    ctx.fillStyle = rings[i % 2]
    ctx.beginPath()
    ctx.arc(x, y, (r * i) / 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}

function emoji(ctx, ch, x, y, size, flip = false) {
  ctx.save()
  ctx.translate(x, y)
  if (flip) ctx.scale(-1, 1)
  ctx.font = `${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, 0, 0)
  ctx.restore()
}

export function bigText(ctx, text, color = '#ffd23f', size = 110, y = H / 2) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${size}px system-ui, sans-serif`
  ctx.lineWidth = size / 9
  ctx.strokeStyle = INK
  ctx.strokeText(text, W / 2, y)
  ctx.fillStyle = color
  ctx.fillText(text, W / 2, y)
  ctx.textBaseline = 'alphabetic'
}

// Puffs, splinters and floating scores, shared by both scenes.
export function createFx() {
  return { parts: [], floaters: [], puffs: [] }
}
export function burst(fx, x, y, colors, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = speed * rand(0.3, 1)
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: rand(0.4, 0.9), max: 0.9, size: rand(3, 8), color: colors[i % colors.length] })
  }
}
export function floater(fx, x, y, text, color) {
  fx.floaters.push({ x, y, text, color, life: 1 })
}
export function puff(fx, x, y) {
  fx.puffs.push({ x, y, life: 0.4 })
}
export function stepFx(fx, dt) {
  for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt }
  fx.parts = fx.parts.filter((p) => p.life > 0)
  for (const f of fx.floaters) { f.y -= 50 * dt; f.life -= dt }
  fx.floaters = fx.floaters.filter((f) => f.life > 0)
  for (const p of fx.puffs) p.life -= dt
  fx.puffs = fx.puffs.filter((p) => p.life > 0)
}
export function drawFx(ctx, fx) {
  for (const p of fx.puffs) {
    ctx.globalAlpha = p.life / 0.4
    ctx.fillStyle = '#d8d0c0'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 10 + (0.4 - p.life) * 40, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const p of fx.parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2)
    ctx.font = '900 30px system-ui, sans-serif'
    ctx.lineWidth = 6
    ctx.strokeStyle = INK
    ctx.strokeText(f.text, f.x, f.y)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1
  ctx.textBaseline = 'alphabetic'
}

// ---------- Duel scene ----------
// Ready stars, one per player, in the middle band of the screen.
export const READY_STAR = { L: { x: 0.33, y: 0.5 }, R: { x: 0.67, y: 0.5 }, M: { x: 0.5, y: 0.5 } }
export const DUEL_TARGET_R = 58

export function randomDuelTarget() {
  return { x: rand(0.22, 0.78) * W, y: rand(0.28, 0.68) * H, born: 0 }
}

export function renderDuelScene(ctx, now, { stars = [], target = null, targetAge = 0, holster = false }) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#ff9a5a')
  sky.addColorStop(0.55, '#ffd27a')
  sky.addColorStop(1, '#e9b56b')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)
  // sun and mesas
  ctx.fillStyle = '#fff1c2'
  ctx.beginPath()
  ctx.arc(W * 0.8, H * 0.32, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#c9744a'
  ctx.beginPath()
  ctx.moveTo(0, H * 0.62)
  ctx.lineTo(120, H * 0.62); ctx.lineTo(150, H * 0.5); ctx.lineTo(300, H * 0.5); ctx.lineTo(330, H * 0.62)
  ctx.lineTo(620, H * 0.62); ctx.lineTo(650, H * 0.44); ctx.lineTo(760, H * 0.44); ctx.lineTo(790, H * 0.62)
  ctx.lineTo(W, H * 0.62); ctx.lineTo(W, H); ctx.lineTo(0, H)
  ctx.fill()
  ctx.fillStyle = '#e2a865'
  ctx.fillRect(0, H * 0.7, W, H * 0.3)
  emoji(ctx, '🌵', 70, H * 0.78, 70)
  emoji(ctx, '🌵', W - 80, H * 0.82, 56)
  emoji(ctx, '🌵', W * 0.55, H * 0.9, 40)

  for (const s of stars) {
    const pulse = 1 + Math.sin(now / 200) * 0.08
    emoji(ctx, s.done ? '✅' : '⭐', s.x * W, s.y * H, 64 * pulse)
    ctx.strokeStyle = s.color
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(s.x * W, s.y * H, 46, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (target) {
    const pop = Math.min(1, targetAge / 0.12)
    ctx.fillStyle = '#7a4a22'
    ctx.fillRect(target.x - 6, target.y + DUEL_TARGET_R * pop - 4, 12, H - target.y)
    drawBullseye(ctx, target.x, target.y, DUEL_TARGET_R * pop)
  }

  if (holster) {
    // the holster zone: point down here and keep still
    ctx.fillStyle = 'rgba(42,26,62,0.18)'
    ctx.fillRect(0, H * 0.86, W, H * 0.14)
    ctx.fillStyle = INK
    ctx.font = '800 20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⬇ point at the floor ⬇', W / 2, H * 0.95)
  }
}

// ---------- Target Gallery ----------
export const GALLERY_MS = 60000
const RAILS = [0.36, 0.6, 0.84].map((f) => f * H)
const KINDS = {
  target: { r: 36, pts: 10 },
  duck: { r: 30, pts: 15 },
  gold: { r: 22, pts: 30 },
  bunny: { r: 34, pts: -20 },
}

export function createGallery(sides) {
  const score = {}
  for (const s of sides) score[s] = { points: 0, hits: 0, shots: 0, combo: 0, best: 0, bunnies: 0 }
  return { clock: -3200, phase: 'countdown', items: [], nextSpawn: 0, nextId: 1, score, fx: createFx(), lastCount: 4 }
}

const multiplier = (c) => Math.min(3, 1 + Math.floor(c / 5))

function spawn(g) {
  const p = Math.min(1, g.clock / GALLERY_MS)
  const r = Math.random()
  const kind = r < 0.5 ? 'target' : r < 0.75 ? 'duck' : r < 0.86 ? 'gold' : 'bunny'
  const row = Math.floor(Math.random() * 3)
  const item = { id: g.nextId++, kind, row, age: 0, hit: false, gone: false }
  if (kind === 'duck') {
    const fromLeft = Math.random() < 0.5
    item.x = fromLeft ? -40 : W + 40
    item.vx = (fromLeft ? 1 : -1) * rand(110, 170) * (1 + p * 0.6)
    item.life = 99
  } else {
    item.x = rand(90, W - 90)
    item.vx = 0
    item.life = (kind === 'gold' ? 1.2 : 2.4) - p * (kind === 'gold' ? 0.4 : 1.0)
  }
  // keep pop-ups from stacking on each other in a row
  if (kind !== 'duck' && g.items.some((o) => !o.gone && o.row === row && Math.abs(o.x - item.x) < 90)) return
  g.items.push(item)
}

// Where an item's disc is right now (it rises from behind its rail, then sinks back).
export function itemPos(it) {
  const k = KINDS[it.kind]
  const rise = it.kind === 'duck' ? 1 : Math.min(1, it.age / 0.15) * (it.age > it.life ? Math.max(0, 1 - (it.age - it.life) / 0.2) : 1)
  return { x: it.x, y: RAILS[it.row] - (k.r + 12) * rise, r: k.r, shown: rise }
}

export function stepGallery(g, dt) {
  const events = []
  g.clock += dt * 1000
  stepFx(g.fx, dt)
  if (g.phase === 'countdown') {
    const n = Math.ceil(-g.clock / 1000)
    if (n !== g.lastCount && n >= 1 && n <= 3) events.push('count')
    g.lastCount = n
    if (g.clock >= 0) { g.phase = 'play'; events.push('go') }
    return events
  }
  if (g.phase === 'play') {
    if (g.clock >= GALLERY_MS) { g.phase = 'done'; events.push('end') }
    else if (g.clock >= g.nextSpawn) {
      const p = g.clock / GALLERY_MS
      const live = g.items.filter((i) => !i.gone).length
      if (live < 3 + Math.floor(p * 4)) spawn(g)
      g.nextSpawn = g.clock + (900 - p * 450) * rand(0.7, 1.2)
    }
  }
  for (const it of g.items) {
    if (it.gone) continue
    it.age += dt
    it.x += it.vx * dt
    if (it.kind === 'duck' && (it.x < -60 || it.x > W + 60)) it.gone = true
    if (it.kind !== 'duck' && it.age > it.life + 0.2) it.gone = true
  }
  g.items = g.items.filter((it) => !it.gone)
  return events
}

// A shot from one player at (x, y) in canvas pixels. Returns the event names.
export function shootGallery(g, side, x, y) {
  if (g.phase !== 'play') return []
  const s = g.score[side]
  s.shots++
  // front rows are drawn over back rows, so check front to back
  const hitItem = [...g.items].filter((it) => !it.gone).sort((a, b) => b.row - a.row)
    .find((it) => { const p = itemPos(it); return p.shown > 0.4 && Math.hypot(p.x - x, p.y - y) < p.r + 4 })
  if (!hitItem) {
    s.combo = 0
    puff(g.fx, x, y)
    return ['miss']
  }
  const p = itemPos(hitItem)
  hitItem.gone = true
  hitItem.hit = true
  const k = KINDS[hitItem.kind]
  if (hitItem.kind === 'bunny') {
    s.points = Math.max(0, s.points + k.pts)
    s.combo = 0
    s.bunnies++
    burst(g.fx, p.x, p.y, ['#ffffff', '#ffc0d8'], 16, 220)
    floater(g.fx, p.x, p.y - 30, 'Not the bunny! -20', '#ffb4c8')
    return ['bunny']
  }
  s.combo++
  s.best = Math.max(s.best, s.combo)
  s.hits++
  const pts = k.pts * multiplier(s.combo)
  s.points += pts
  burst(g.fx, p.x, p.y, hitItem.kind === 'gold' ? ['#ffd23f', '#ffffff', '#ffb020'] : ['#ff5a5f', '#ffffff', '#c98a4a'], 22, 300)
  floater(g.fx, p.x, p.y - 30, `+${pts}${multiplier(s.combo) > 1 ? ` x${multiplier(s.combo)}` : ''}`, SIDE_COLOR[side])
  return [hitItem.kind === 'gold' ? 'gold' : hitItem.kind === 'duck' ? 'duck' : 'hit']
}

export function renderGallery(ctx, g, now) {
  // back wall and curtain
  ctx.fillStyle = '#2b3f8c'
  ctx.fillRect(0, 0, W, H)
  for (let x = 0; x < W; x += 60) {
    ctx.fillStyle = (x / 60) % 2 ? '#e8384f' : '#fff1e0'
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 60, 0)
    ctx.lineTo(x + 60, 62)
    ctx.quadraticCurveTo(x + 30, 92, x, 62)
    ctx.fill()
  }
  for (let x = 30; x < W; x += 60) {
    const on = Math.floor(now / 300 + x / 60) % 2
    ctx.fillStyle = on ? '#fff6a8' : '#c9b860'
    ctx.beginPath()
    ctx.arc(x, 82, 6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  for (let i = 0; i < 12; i++) ctx.fillRect(i * 85, 100, 40, H)

  // back to front: each row's items, then the rail in front of them
  for (let row = 0; row < 3; row++) {
    for (const it of g.items) if (it.row === row && !it.gone) drawItem(ctx, it, now)
    const y = RAILS[row]
    ctx.fillStyle = '#8b5a2b'
    ctx.fillRect(0, y, W, 26)
    ctx.fillStyle = '#b07a3e'
    ctx.fillRect(0, y, W, 7)
    ctx.fillStyle = '#5c3a18'
    ctx.fillRect(0, y + 22, W, 4)
  }
  drawFx(ctx, g.fx)

  if (g.phase === 'countdown') {
    const n = Math.ceil(-g.clock / 1000)
    bigText(ctx, n > 3 ? 'Get ready!' : n >= 1 ? String(n) : 'GO!', '#ffd23f', n > 3 ? 70 : 150)
  } else if (g.phase === 'play' && g.clock < 600) {
    bigText(ctx, 'GO!', '#ffd23f', 150)
  } else if (g.phase === 'done') {
    bigText(ctx, "TIME'S UP!", '#ffd23f', 100)
  }
}

function drawItem(ctx, it, now) {
  const p = itemPos(it)
  if (p.shown <= 0) return
  // the stick it pops up on
  ctx.fillStyle = '#6b4220'
  ctx.fillRect(p.x - 4, p.y, 8, RAILS[it.row] - p.y + 4)
  if (it.kind === 'target') {
    drawBullseye(ctx, p.x, p.y, p.r)
  } else if (it.kind === 'gold') {
    ctx.fillStyle = `rgba(255,230,120,${0.4 + 0.3 * Math.sin(now / 80)})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r + 10, 0, Math.PI * 2)
    ctx.fill()
    emoji(ctx, '⭐', p.x, p.y + 2, p.r * 2.1)
  } else if (it.kind === 'duck') {
    const bob = Math.sin(now / 120 + it.id) * 3
    emoji(ctx, '🦆', p.x, p.y + bob, p.r * 2.3, it.vx > 0)
  } else if (it.kind === 'bunny') {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ff7ac8'
    ctx.lineWidth = 4
    ctx.stroke()
    emoji(ctx, '🐰', p.x, p.y + 2, p.r * 1.6)
  }
  // a shrinking ring shows how long a pop-up has left
  if (it.kind !== 'duck' && it.age < it.life) {
    ctx.strokeStyle = it.kind === 'bunny' ? '#ff7ac8' : '#ffffff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - it.age / it.life))
    ctx.stroke()
  }
}
