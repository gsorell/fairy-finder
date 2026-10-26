// Marble Maze: tilt the Joy-Con like a tray to roll a marble to the portal. Holes
// swallow it (back to the start), gems are bonus. Every maze is its own little world.
// step() returns events for sound and rumble; render() draws it all.

export const CELL = 48
export const COLS = 20
export const ROWS = 11
export const W = COLS * CELL           // 960
export const H = 540
const OY = (H - ROWS * CELL) / 2       // centre the 528 px board vertically
const R = 14                           // marble radius
const HOLE_R = 19
const G = 2300                         // px/s² at a full 90 degree tilt
const MAX_V = 950
const COUNTDOWN = 3                    // seconds of "3, 2, 1, ROLL!"

export const THEMES = {
  meadow: { name: 'Meadow', emoji: '🌼', bg: '#4f9e3a', floorA: '#effad2', floorB: '#e2f2bb', wall: '#3f8a3a', wallTop: '#7bd06c', wallLow: '#24561f', marble: ['#ffffff', '#ffd1e8', '#ff4fa0'], trail: '#ff8fc6', accent: '#ffd23f', deco: ['🌼', '🌸', '🍀'] },
  candy: { name: 'Candy Land', emoji: '🍭', bg: '#ff8cc6', floorA: '#fff0f8', floorB: '#ffe0f0', wall: '#ff5aa8', wallTop: '#ffb3d9', wallLow: '#b8337a', marble: ['#ffffff', '#bff3ff', '#21a6d6'], trail: '#7fe0ff', accent: '#7fe0ff', sprinkles: ['#ff5a5f', '#ffd23f', '#3ddc84', '#3bb4ff', '#a06bff'] },
  ice: { name: 'Ice Cave', emoji: '❄️', bg: '#2a6fa8', floorA: '#f2faff', floorB: '#e1f2ff', wall: '#5ea9dc', wallTop: '#d4eeff', wallLow: '#2f6d9a', marble: ['#ffffff', '#ffe3a6', '#ff9f1c'], trail: '#ffd36b', accent: '#ffffff', deco: ['❄️'] },
  jungle: { name: 'Jungle', emoji: '🌴', bg: '#1f4d1f', floorA: '#ecdcaa', floorB: '#e0cd96', wall: '#2f6b2f', wallTop: '#5aa84a', wallLow: '#173a17', marble: ['#ffffff', '#ffd2d2', '#ff4040'], trail: '#ff8a8a', accent: '#ffd23f', deco: ['🌿', '🍃', '🦋'] },
  space: { name: 'Outer Space', emoji: '🚀', bg: '#0b0820', floorA: '#221c48', floorB: '#1d1840', wall: '#5d43f0', wallTop: '#a58cff', wallLow: '#2d2190', marble: ['#ffffff', '#b9fff1', '#20d6b0'], trail: '#5cffd8', accent: '#5cffd8', stars: true, dark: true },
  lava: { name: 'Lava Lake', emoji: '🌋', bg: '#1a0604', floorA: '#3d2b25', floorB: '#352520', wall: '#4a1610', wallTop: '#ff6a2a', wallLow: '#1f0805', marble: ['#ffffff', '#d6f0ff', '#3b82f6'], trail: '#9ad1ff', accent: '#ff8a3d', cracks: true, dark: true },
}

// # wall · . floor · S start · G goal · O hole · * gem
export const LEVELS = [
  {
    name: 'First Roll', theme: 'meadow',
    map: [
      '####################',
      '#S.................#',
      '#..................#',
      '#######.######.....#',
      '#.....#......#.....#',
      '#..*..#..*...#..*..#',
      '#.....#......#.....#',
      '#.....########.....#',
      '#..................#',
      '#.................G#',
      '####################',
    ],
  },
  {
    name: 'Zigzag', theme: 'candy',
    map: [
      '####################',
      '#S....#.....#......#',
      '#.....#.....#......#',
      '#.....#..#..#..#...#',
      '#..#..#..#..#..#...#',
      '#..#.....#.....#.*.#',
      '#..#.....#.....#...#',
      '#..#######.....#...#',
      '#*.......#..*..#...#',
      '#........#.....#..G#',
      '####################',
    ],
  },
  {
    name: 'Hole Lot of Trouble', theme: 'ice',
    map: [
      '####################',
      '#S.......O.........#',
      '#........O....O....#',
      '#..O.....O.........#',
      '#........O....O....#',
      '#....O...O.........#',
      '#...........O..*...#',
      '#..O....O..........#',
      '#......O....O...O..#',
      '#..*.......O......G#',
      '####################',
    ],
  },
  {
    name: 'Narrow Pass', theme: 'jungle',
    map: [
      '####################',
      '#S.#...............#',
      '#..#.O.#######.O...#',
      '#..#...#.....#.....#',
      '#..#...#..*..#..#..#',
      '#......#.....O..#..#',
      '###O####..#..#..#..#',
      '#.........#.....#..#',
      '#.O..######.O####..#',
      '#........*.......OG#',
      '####################',
    ],
  },
  {
    name: 'Gem Garden', theme: 'space',
    map: [
      '####################',
      '#S..*....#....*....#',
      '#.####.#.#.#.####..#',
      '#.#*...#...#...*#..#',
      '#.#.#######O###.#..#',
      '#...#...*...#...#..#',
      '###.#.#####.#.###..#',
      '#*..#...O...#......#',
      '#.#####.###.######.#',
      '#.......*.........G#',
      '####################',
    ],
  },
  {
    name: 'Spiral', theme: 'lava',
    map: [
      '####################',
      '#S.................#',
      '#.################.#',
      '#.#..............#.#',
      '#.#.############.#.#',
      '#.#.#*.........#.#.#',
      '#.#.#.#######O.#.#.#',
      '#.#.#.......G#...#.#',
      '#.#.##########...#.#',
      '#...O..........O...#',
      '####################',
    ],
  },
]

const center = (c, r) => ({ x: c * CELL + CELL / 2, y: OY + r * CELL + CELL / 2 })

// Small seeded random, so each maze's decorations land in the same places every time.
function seeded(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export function loadLevel(index) {
  const { map, theme } = LEVELS[index]
  const L = {
    index, map, theme: THEMES[theme], holes: [], gems: [], deco: [], start: null, goal: null,
    t: 0, falls: 0, state: 'ready', readyT: COUNTDOWN, fallT: 0, near: 0, speed: 0,
    parts: [], floaters: [], shake: 0, roll: 0, heading: 0, lastCount: COUNTDOWN + 1,
  }
  const rnd = seeded(index * 977 + 13)
  map.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'S') L.start = center(c, r)
    if (ch === 'G') L.goal = center(c, r)
    if (ch === 'O') L.holes.push(center(c, r))
    if (ch === '*') L.gems.push({ ...center(c, r), got: false })
    if (ch === '.' && rnd() < 0.16) L.deco.push({ x: c * CELL + 8 + rnd() * 32, y: OY + r * CELL + 8 + rnd() * 32, k: rnd(), a: rnd() * 6.28 })
  }))
  L.ball = { x: L.start.x, y: L.start.y, vx: 0, vy: 0 }
  return L
}

const isWall = (L, c, r) => r < 0 || r >= ROWS || c < 0 || c >= COLS || L.map[r][c] === '#'

// Pushes the ball out of any wall it overlaps; returns the hardest hit's speed.
function collide(L) {
  const b = L.ball
  let hardest = 0
  const c0 = Math.floor((b.x - R) / CELL), c1 = Math.floor((b.x + R) / CELL)
  const r0 = Math.floor((b.y - OY - R) / CELL), r1 = Math.floor((b.y - OY + R) / CELL)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!isWall(L, c, r)) continue
      const x0 = c * CELL, y0 = OY + r * CELL
      const px = Math.max(x0, Math.min(b.x, x0 + CELL))
      const py = Math.max(y0, Math.min(b.y, y0 + CELL))
      const dx = b.x - px, dy = b.y - py
      const d = Math.hypot(dx, dy)
      if (d >= R || d === 0) continue
      const nx = dx / d, ny = dy / d
      b.x = px + nx * R
      b.y = py + ny * R
      const into = -(b.vx * nx + b.vy * ny)
      if (into > 0) {
        b.vx += nx * into * 1.35   // bounce back with 35% of the speed
        b.vy += ny * into * 1.35
        hardest = Math.max(hardest, into)
      }
    }
  }
  return hardest
}

function burst(L, x, y, colors, n, speed, life = 0.8, gravity = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.4 + Math.random() * 0.6)
    L.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity, life, max: life, size: 3 + Math.random() * 5, color: colors[i % colors.length], spark: true })
  }
}

function updateEffects(L, dt) {
  for (const p of L.parts) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += p.g * dt
    p.vx *= 0.98
    p.life -= dt
  }
  L.parts = L.parts.filter((p) => p.life > 0)
  for (const f of L.floaters) { f.y -= 40 * dt; f.life -= dt }
  L.floaters = L.floaters.filter((f) => f.life > 0)
  L.shake = Math.max(0, L.shake - dt * 30)
}

// tiltX / tiltY: how hard the tray leans, roughly sin(angle), screen x right / y down.
export function step(L, tiltX, tiltY, dt) {
  const events = []
  const b = L.ball
  updateEffects(L, dt)
  if (L.state === 'won') return events
  if (L.state === 'ready') {
    L.readyT -= dt
    const n = Math.ceil(L.readyT)
    if (n !== L.lastCount && n >= 1) events.push({ type: 'count' })
    L.lastCount = n
    if (L.readyT <= 0) { L.state = 'play'; events.push({ type: 'go' }) }
    return events
  }
  if (L.state === 'falling') {
    L.fallT += dt
    if (L.fallT > 0.7) {
      L.state = 'play'
      Object.assign(b, { x: L.start.x, y: L.start.y, vx: 0, vy: 0 })
      burst(L, b.x, b.y, [L.theme.trail, '#ffffff'], 12, 160, 0.5)
      events.push({ type: 'respawn' })
    }
    return events
  }
  L.t += dt

  const SUB = 4
  const h = dt / SUB
  let hit = 0
  const x0 = b.x, y0 = b.y
  for (let i = 0; i < SUB; i++) {
    b.vx += tiltX * G * h
    b.vy += tiltY * G * h
    // a hole pulls the marble in once it is right at the rim
    for (const o of L.holes) {
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy)
      if (d < HOLE_R + 10 && d > 0) { b.vx += (dx / d) * 900 * h; b.vy += (dy / d) * 900 * h }
    }
    const damp = Math.exp(-1.1 * h)   // rolling resistance
    b.vx *= damp
    b.vy *= damp
    const v = Math.hypot(b.vx, b.vy)
    if (v > MAX_V) { b.vx *= MAX_V / v; b.vy *= MAX_V / v }
    b.x += b.vx * h
    b.y += b.vy * h
    hit = Math.max(hit, collide(L))
  }
  // rolling: the decal turns by the distance travelled
  const moved = Math.hypot(b.x - x0, b.y - y0)
  L.roll += moved / R
  if (moved > 0.2) L.heading = Math.atan2(b.y - y0, b.x - x0)
  L.speed = Math.hypot(b.vx, b.vy)
  if (L.speed > 140 && Math.random() < 0.7) {
    L.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, g: 0, life: 0.35, max: 0.35, size: R * 0.9, color: L.theme.trail, trail: true })
  }
  if (hit > 50) {
    const force = Math.min(1, hit / 600)
    events.push({ type: 'wall', force })
    if (force > 0.35) L.shake = Math.max(L.shake, force * 9)
    burst(L, b.x, b.y, [L.theme.wallTop, '#ffffff'], Math.round(4 + force * 8), 120 + force * 200, 0.35)
  }

  L.near = 0
  for (const o of L.holes) {
    const d = Math.hypot(o.x - b.x, o.y - b.y)
    if (d < HOLE_R - 4) {
      L.state = 'falling'
      L.fallT = 0
      L.falls++
      L.fallAt = { ...o }
      events.push({ type: 'fall' })
      return events
    }
    L.near = Math.max(L.near, Math.min(1, Math.max(0, 1 - (d - HOLE_R) / 45)))
  }
  for (const g of L.gems) {
    if (!g.got && Math.hypot(g.x - b.x, g.y - b.y) < 24) {
      g.got = true
      burst(L, g.x, g.y, ['#7fe7ff', '#ffffff', '#c7a6ff', '#ffd23f'], 18, 260, 0.7)
      L.floaters.push({ x: g.x, y: g.y - 10, text: '+💎', life: 0.9 })
      events.push({ type: 'gem' })
    }
  }
  if (Math.hypot(L.goal.x - b.x, L.goal.y - b.y) < 20) {
    L.state = 'won'
    burst(L, L.goal.x, L.goal.y, ['#ff5a5f', '#ffd23f', '#3ddc84', '#3bb4ff', '#a06bff', '#ff7ac8'], 90, 520, 1.6, 420)
    events.push({ type: 'win' })
  }
  return events
}

// 3 stars: every gem and no falls. 2: one of those. 1: you made it.
export function starsFor(L) {
  const allGems = L.gems.every((g) => g.got)
  const clean = L.falls === 0
  return allGems && clean ? 3 : allGems || clean ? 2 : 1
}

// ---------- drawing ----------
export function render(ctx, L, now) {
  const th = L.theme
  ctx.save()
  if (L.shake > 0) ctx.translate((Math.random() - 0.5) * L.shake, (Math.random() - 0.5) * L.shake)
  ctx.fillStyle = th.bg
  ctx.fillRect(-20, -20, W + 40, H + 40)

  // floor
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (L.map[r][c] === '#') continue
      ctx.fillStyle = (r + c) % 2 ? th.floorA : th.floorB
      ctx.fillRect(c * CELL, OY + r * CELL, CELL, CELL)
    }
  }
  drawDeco(ctx, L, now)

  // walls cast a soft shadow down-right onto the floor, then stand up with a bevel
  ctx.fillStyle = th.dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.16)'
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (L.map[r][c] === '#') ctx.fillRect(c * CELL + 6, OY + r * CELL + 8, CELL, CELL)
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (L.map[r][c] !== '#') continue
      const x = c * CELL, y = OY + r * CELL
      ctx.fillStyle = th.wall
      ctx.fillRect(x, y, CELL, CELL)
      if (!isWall(L, c, r - 1)) { ctx.fillStyle = th.wallTop; ctx.fillRect(x, y, CELL, 7) }
      if (!isWall(L, c, r + 1)) { ctx.fillStyle = th.wallLow; ctx.fillRect(x, y + CELL - 6, CELL, 6) }
    }
  }
  if (th.cracks) {
    // lava glowing up between the stones
    ctx.strokeStyle = `rgba(255,${110 + Math.sin(now / 300) * 40},40,0.8)`
    ctx.lineWidth = 2
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (L.map[r][c] !== '#' || (r * 7 + c * 3) % 4) continue
      const x = c * CELL, y = OY + r * CELL
      ctx.beginPath()
      ctx.moveTo(x + 8, y + 14)
      ctx.lineTo(x + 22, y + 26)
      ctx.lineTo(x + 18, y + 38)
      ctx.stroke()
    }
  }

  // holes: glow red when the marble is close
  for (const o of L.holes) {
    const d = Math.hypot(o.x - L.ball.x, o.y - L.ball.y)
    if (d < 80 && L.state === 'play') {
      const k = 1 - d / 80
      ctx.fillStyle = `rgba(255,60,40,${0.35 * k * (0.6 + 0.4 * Math.sin(now / 60))})`
      ctx.beginPath()
      ctx.arc(o.x, o.y, HOLE_R + 14, 0, Math.PI * 2)
      ctx.fill()
    }
    const g = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, HOLE_R)
    g.addColorStop(0, '#000')
    g.addColorStop(0.7, '#0d0805')
    g.addColorStop(1, th.dark ? '#5b4a8a' : '#6b4a2a')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(o.x, o.y, HOLE_R, 0, Math.PI * 2)
    ctx.fill()
  }

  drawPortal(ctx, L, now)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const g of L.gems) {
    if (g.got) continue
    const bob = Math.sin(now / 300 + g.x) * 3
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(now / 200 + g.y)})`
    ctx.beginPath()
    ctx.arc(g.x, g.y + bob, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '24px system-ui, sans-serif'
    ctx.fillText('💎', g.x, g.y + 1 + bob)
  }

  // trail first, so the marble sits on top of it
  for (const p of L.parts) {
    if (!p.trail) continue
    ctx.globalAlpha = (p.life / p.max) * 0.45
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (p.life / p.max), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  drawMarble(ctx, L)
  for (const p of L.parts) {
    if (p.trail) continue
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
  for (const f of L.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2)
    ctx.font = '900 22px system-ui, sans-serif'
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1

  if (L.state === 'ready') {
    const n = Math.ceil(L.readyT)
    bigText(ctx, n >= 1 ? String(n) : 'ROLL!', th.accent)
  } else if (L.state === 'play' && L.t < 0.6) {
    bigText(ctx, 'ROLL!', th.accent)
  }
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
}

function drawDeco(ctx, L, now) {
  const th = L.theme
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const d of L.deco) {
    if (th.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(now / 700 + d.a * 3))})`
      ctx.fillRect(d.x, d.y, 2 + d.k * 2, 2 + d.k * 2)
    } else if (th.sprinkles) {
      ctx.save()
      ctx.translate(d.x, d.y)
      ctx.rotate(d.a)
      ctx.fillStyle = th.sprinkles[Math.floor(d.k * th.sprinkles.length)]
      ctx.fillRect(-5, -1.5, 10, 3)
      ctx.restore()
    } else if (th.cracks) {
      ctx.fillStyle = `rgba(255,120,40,${0.15 + 0.15 * Math.sin(now / 400 + d.a)})`
      ctx.beginPath()
      ctx.arc(d.x, d.y, 6 + d.k * 6, 0, Math.PI * 2)
      ctx.fill()
    } else if (th.deco) {
      ctx.globalAlpha = 0.35
      ctx.font = `${12 + d.k * 6}px system-ui, sans-serif`
      ctx.fillText(th.deco[Math.floor(d.k * th.deco.length)], d.x, d.y)
      ctx.globalAlpha = 1
    }
  }
}

function drawPortal(ctx, L, now) {
  const { x, y } = L.goal
  const th = L.theme
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(now / 600)
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = i % 2 ? th.accent : '#ffffff'
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(30, -7)
    ctx.lineTo(30, 7)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.globalAlpha = 1
  const pulse = 1 + Math.sin(now / 200) * 0.1
  const g = ctx.createRadialGradient(x, y, 2, x, y, 20 * pulse)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.6, '#3ddc84')
  g.addColorStop(1, 'rgba(61,220,132,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, 20 * pulse, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '24px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🏁', x + 6, y - 10)
}

function drawMarble(ctx, L) {
  const b = L.ball
  const th = L.theme
  let bx = b.x, by = b.y, br = R
  if (L.state === 'falling') {
    const k = Math.min(1, L.fallT / 0.4)
    bx = b.x + (L.fallAt.x - b.x) * k
    by = b.y + (L.fallAt.y - b.y) * k
    br = R * (1 - k * 0.85)
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(bx + 4, by + 6, br, br * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.4, 1, bx, by, br)
  g.addColorStop(0, th.marble[0])
  g.addColorStop(0.35, th.marble[1])
  g.addColorStop(1, th.marble[2])
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(bx, by, br, 0, Math.PI * 2)
  ctx.fill()
  // a stripe that rolls round with the marble, seen only on the near side
  const s = Math.sin(L.roll), c = Math.cos(L.roll)
  if (c > 0 && L.state !== 'falling') {
    const ox = Math.cos(L.heading) * s * br * 0.7, oy = Math.sin(L.heading) * s * br * 0.7
    ctx.save()
    ctx.beginPath()
    ctx.arc(bx, by, br, 0, Math.PI * 2)
    ctx.clip()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 3.5 * c
    ctx.beginPath()
    ctx.ellipse(bx + ox, by + oy, br * 0.95 * c * 0.45 + 0.5, br, L.heading, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.arc(bx - br * 0.38, by - br * 0.38, br * 0.22, 0, Math.PI * 2)
  ctx.fill()
}

function bigText(ctx, text, color) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 150px system-ui, sans-serif'
  ctx.lineWidth = 14
  ctx.strokeStyle = '#2a1a3e'
  ctx.strokeText(text, W / 2, H / 2)
  ctx.fillStyle = color
  ctx.fillText(text, W / 2, H / 2)
}
