// Marble Maze: tilt the Joy-Con like a tray to roll a marble to the flag. Holes
// swallow it (back to the start), gems are optional bonus. step() returns events
// for sound and rumble; render() draws a wooden tray.

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

// # wall · . floor · S start · G goal · O hole · * gem
export const LEVELS = [
  {
    name: 'First Roll',
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
    name: 'Zigzag',
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
    name: 'Hole Lot of Trouble',
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
    name: 'Narrow Pass',
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
    name: 'Gem Garden',
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
    name: 'Spiral',
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

export function loadLevel(index) {
  const map = LEVELS[index].map
  const L = { index, map, holes: [], gems: [], start: null, goal: null, t: 0, falls: 0, state: 'play', fallT: 0, near: 0, speed: 0 }
  map.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'S') L.start = center(c, r)
    if (ch === 'G') L.goal = center(c, r)
    if (ch === 'O') L.holes.push(center(c, r))
    if (ch === '*') L.gems.push({ ...center(c, r), got: false })
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

// tiltX / tiltY: how hard the tray leans, roughly sin(angle), screen x right / y down.
export function step(L, tiltX, tiltY, dt) {
  const events = []
  const b = L.ball
  if (L.state === 'won') return events
  if (L.state === 'falling') {
    L.fallT += dt
    if (L.fallT > 0.7) {
      L.state = 'play'
      Object.assign(b, { x: L.start.x, y: L.start.y, vx: 0, vy: 0 })
      events.push({ type: 'respawn' })
    }
    return events
  }
  L.t += dt

  const SUB = 4
  const h = dt / SUB
  let hit = 0
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
  if (hit > 50) events.push({ type: 'wall', force: Math.min(1, hit / 600) })
  L.speed = Math.hypot(b.vx, b.vy)

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
      events.push({ type: 'gem' })
    }
  }
  if (Math.hypot(L.goal.x - b.x, L.goal.y - b.y) < 20) {
    L.state = 'won'
    events.push({ type: 'win' })
  }
  return events
}

// ---------- drawing ----------
export function render(ctx, L, now) {
  ctx.fillStyle = '#5a3a1e'
  ctx.fillRect(0, 0, W, H)

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL, y = OY + r * CELL
      if (L.map[r][c] === '#') {
        ctx.fillStyle = '#7a4a22'
        ctx.fillRect(x, y, CELL, CELL)
        ctx.fillStyle = '#9a6332'
        ctx.fillRect(x, y, CELL, 5)
        ctx.fillStyle = '#4e2e12'
        ctx.fillRect(x, y + CELL - 4, CELL, 4)
      } else {
        ctx.fillStyle = (r + c) % 2 ? '#f3dcb2' : '#efd5a6'
        ctx.fillRect(x, y, CELL, CELL)
      }
    }
  }

  for (const o of L.holes) {
    const g = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, HOLE_R)
    g.addColorStop(0, '#000')
    g.addColorStop(0.75, '#1a0f05')
    g.addColorStop(1, '#6b4a2a')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(o.x, o.y, HOLE_R, 0, Math.PI * 2)
    ctx.fill()
  }

  // goal: a pulsing target with a flag
  const pulse = 1 + Math.sin(now / 250) * 0.08
  ctx.fillStyle = '#3ddc84'
  ctx.beginPath()
  ctx.arc(L.goal.x, L.goal.y, 20 * pulse, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(L.goal.x, L.goal.y, 12 * pulse, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('⛳', L.goal.x + 4, L.goal.y - 6)

  ctx.font = '24px system-ui, sans-serif'
  for (const g of L.gems) if (!g.got) ctx.fillText('💎', g.x, g.y + 1 + Math.sin(now / 300 + g.x) * 2)

  const b = L.ball
  let bx = b.x, by = b.y, br = R
  if (L.state === 'falling') {
    const k = Math.min(1, L.fallT / 0.4)
    bx = b.x + (L.fallAt.x - b.x) * k
    by = b.y + (L.fallAt.y - b.y) * k
    br = R * (1 - k * 0.85)
  }
  if (L.state !== 'falling') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(bx + 4, by + 6, br, br * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.4, 1, bx, by, br)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.35, '#9fd8ff')
  g.addColorStop(1, '#2a6fb0')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(bx, by, br, 0, Math.PI * 2)
  ctx.fill()
  ctx.textBaseline = 'alphabetic'
}
