// Canvas renderer — 480x270 virtual canvas, scaled with image-rendering: pixelated.
// Cartoonish 16-bit fighter built from a small set of fixed keyframe poses
// (no slow joint lerps — punches *snap*). Plus a big comic-book impact graphic
// that lingers during hitstop.

import { OPP_MAX_HP, PLAYER_MAX_HP, PLAYER_MAX_STAM, PLAYER_STRIKES } from './engine.js'

// Per-zone visual constants — sprite scale + Y offset (perspective)
const ZONE_SCALE = { close: 1.30, mid: 1.00, long: 0.65 }
const ZONE_YOFF  = { close:   18, mid:    0, long:  -22 }
function lerpScalar(a, b, t) { return a + (b - a) * t }
function smoothstep(t) { return t * t * (3 - 2 * t) }

export const CANVAS_W = 480
export const CANVAS_H = 270

const OPP_ANCHOR_X = CANVAS_W / 2
const OPP_ANCHOR_Y = 200       // feet line on the canvas

// Bold cartoon palette
const C = {
  outline: '#0a0509',
  outlineThick: '#000000',
  skin:    '#e0a070',
  skinSh:  '#9c5832',
  skinHi:  '#ffd0a0',
  hair:    '#1a0a0a',
  trunk:   '#e21030',
  trunkSh: '#900814',
  gold:    '#ffd24a',
  glove:   '#e21030',
  gloveSh: '#900814',
  laces:   '#fff4d0',
  ringMat: '#7a4632',
  ringHi:  '#a06848',
  rope1:   '#c93030',
  rope2:   '#e0c060',
  post:    '#1a1a1a',
  bgFar:   '#0e0612',
  bgNear:  '#3c1d20',
  blood:   '#c91d20',
}

export function setupPixelCanvas(canvas) {
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  return ctx
}

// ---------- Drawing helpers ----------

function fillCircle(ctx, x, y, r, fill, outline = C.outline, lw = 2) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (outline) {
    ctx.strokeStyle = outline
    ctx.lineWidth = lw
    ctx.stroke()
  }
}
function fillEllipse(ctx, x, y, rx, ry, fill, outline = C.outline, lw = 2) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (outline) {
    ctx.strokeStyle = outline
    ctx.lineWidth = lw
    ctx.stroke()
  }
}
function thickStroke(ctx, color, lw, fn) {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  fn()
}

// ---------- Background ----------

function drawRing(ctx, t) {
  const grd = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  grd.addColorStop(0, C.bgFar)
  grd.addColorStop(0.55, '#1c0f1a')
  grd.addColorStop(1, C.bgNear)
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  // Crowd silhouette band
  ctx.fillStyle = '#0a0509'
  ctx.fillRect(0, 80, CANVAS_W, 50)
  for (let i = 0; i < 220; i++) {
    const x = (i * 17 + (i * i * 3) % CANVAS_W) % CANVAS_W
    const y = 84 + ((i * 11) % 42)
    const flick = ((t * 0.005 + i) % 7) < 0.3 ? 0.7 : 0.25
    ctx.fillStyle = `rgba(80, 60, 80, ${flick})`
    ctx.fillRect(x, y, 2, 2)
  }

  const spot = ctx.createRadialGradient(CANVAS_W/2, 50, 10, CANVAS_W/2, 60, 240)
  spot.addColorStop(0, 'rgba(255, 240, 180, 0.32)')
  spot.addColorStop(0.6, 'rgba(255, 220, 160, 0.05)')
  spot.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = spot
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  // Ring canvas (mat trapezoid)
  ctx.fillStyle = C.ringMat
  ctx.beginPath()
  ctx.moveTo(60, 130)
  ctx.lineTo(CANVAS_W - 60, 130)
  ctx.lineTo(CANVAS_W + 80, CANVAS_H)
  ctx.lineTo(-80, CANVAS_H)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = C.ringHi
  ctx.beginPath()
  ctx.moveTo(60, 130)
  ctx.lineTo(CANVAS_W - 60, 130)
  ctx.lineTo(CANVAS_W - 40, 138)
  ctx.lineTo(80, 138)
  ctx.closePath()
  ctx.fill()

  // Ropes & posts
  const postL = { x: 30, yTop: 90 }
  const postR = { x: CANVAS_W - 30, yTop: 90 }
  ctx.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    const yL = postL.yTop + i * 14
    const yR = postR.yTop + i * 14
    ctx.strokeStyle = i === 1 ? C.rope2 : C.rope1
    ctx.beginPath()
    ctx.moveTo(postL.x, yL)
    ctx.lineTo(postR.x, yR)
    ctx.stroke()
  }
  ctx.fillStyle = C.post
  ctx.fillRect(postL.x - 4, postL.yTop - 6, 8, 60)
  ctx.fillRect(postR.x - 4, postR.yTop - 6, 8, 60)
  ctx.fillStyle = C.gold
  ctx.fillRect(postL.x - 4, postL.yTop - 8, 8, 3)
  ctx.fillRect(postR.x - 4, postR.yTop - 8, 8, 3)
}

// ---------- Opponent: keyframe pose drawing ----------
//
// Draw each pose directly with bold shapes — no joint interpolation. Each pose
// fills a similar visual envelope so transitions snap cleanly. Origin is feet.

// Phase resolver: idle | windup | strike | recover | hit | block | down | step
function phaseOf(opp) {
  if (opp.state === 'down') return 'down'
  if (opp.state === 'block') return 'block'
  if (opp.state === 'hit') return 'hit'
  if (opp.state === 'idle') return 'idle'
  if (opp.state === 'recover') return 'recover'
  if (opp.state === 'telegraph') return 'windup'
  if (opp.state === 'striking') return 'strike'
  return 'idle'
}

function drawOpponent(ctx, opp, t, zone = 'mid', zonePrev = 'mid', zoneT = 1) {
  // Lerp scale + y-offset between zones during transition
  const tt = smoothstep(Math.min(1, Math.max(0, zoneT)))
  const scale = lerpScalar(ZONE_SCALE[zonePrev] ?? 1, ZONE_SCALE[zone] ?? 1, tt)
  const yOff  = lerpScalar(ZONE_YOFF[zonePrev]  ?? 0, ZONE_YOFF[zone]  ?? 0, tt)
  const ax = OPP_ANCHOR_X
  const ay = OPP_ANCHOR_Y + yOff

  // Recoil offset on hit
  let recoilX = 0, recoilY = 0
  if (opp.state === 'hit') {
    const k = 1 - Math.min(1, opp.stateT / 320)
    recoilX = -8 * k
    recoilY = -3 * k
  }
  // Idle bob
  let bobY = 0
  if (opp.state === 'idle') bobY = Math.abs(Math.sin(t * 0.008)) * 2
  // Windup shake
  if (opp.state === 'telegraph') recoilX += Math.sin(t * 0.06) * 0.6

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.beginPath()
  ctx.ellipse(ax + recoilX, ay + 4 * scale, 38 * scale, 6 * scale, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(ax + recoilX, ay + recoilY + bobY)
  ctx.scale(scale, scale)

  const phase = phaseOf(opp)
  const move = opp.move?.name
  const flashing = opp.hitFlash > 0 && Math.floor(t / 60) % 2 === 0

  if (phase === 'down') drawSakDown(ctx, t)
  else if (phase === 'block') drawSakBlock(ctx, t)
  else if (phase === 'hit') drawSakHit(ctx, t)
  else if (phase === 'idle') drawSakIdle(ctx, t)
  else if (phase === 'recover') drawSakIdle(ctx, t, /*lowGuard*/ true)
  else if (phase === 'windup') drawSakWindup(ctx, t, move)
  else if (phase === 'strike') drawSakStrike(ctx, t, move, opp.stateT, opp.move?.active ?? 130)
  else drawSakIdle(ctx, t)

  // Flash overlay during hit (ignores child draws, repaints in white)
  if (flashing) {
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(-100, -200, 200, 220)
    ctx.globalCompositeOperation = 'source-over'
  }

  ctx.restore()

  // Telegraph cue arrow above head — accounts for scale
  if (opp.state === 'telegraph' && opp.move && opp.move.target !== 'none') {
    const m = opp.move
    const flash = Math.floor(t / 90) % 2 === 0
    if (flash) {
      ctx.fillStyle = m.target === 'low' ? '#ffae3a' : '#ff3a3a'
      const cueX = ax + (m.side === 'L' ? -34 : (m.side === 'R' ? 34 : 0)) * scale
      const cueY = (ay + bobY) - 130 * scale
      ctx.beginPath()
      ctx.moveTo(cueX, cueY)
      ctx.lineTo(cueX - 7, cueY - 9)
      ctx.lineTo(cueX + 7, cueY - 9)
      ctx.closePath()
      ctx.fill()
      // dodge dir hint
      ctx.fillStyle = '#ffe04a'
      const dy = cueY + 6
      if (m.dodgeDir === -1) {
        ctx.beginPath(); ctx.moveTo(cueX, dy); ctx.lineTo(cueX - 6, dy + 4); ctx.lineTo(cueX, dy + 8); ctx.closePath(); ctx.fill()
      } else if (m.dodgeDir === 1) {
        ctx.beginPath(); ctx.moveTo(cueX, dy); ctx.lineTo(cueX + 6, dy + 4); ctx.lineTo(cueX, dy + 8); ctx.closePath(); ctx.fill()
      } else if (m.dodgeDir === 0) {
        ctx.fillRect(cueX - 6, dy + 3, 4, 2)
        ctx.fillRect(cueX + 2, dy + 3, 4, 2)
      }
    }
  }

  // Sak step indicator (non-strike moves)
  if ((opp.state === 'striking' || opp.state === 'telegraph') && opp.move?.noStrike) {
    const dir = opp.move.shiftRange < 0 ? -1 : 1
    ctx.fillStyle = dir < 0 ? '#7af0ff' : '#ffae3a'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(dir < 0 ? 'STEPS IN ▼' : 'STEPS OUT ▲', ax, ay - 90 * scale)
    ctx.textAlign = 'left'
  }
}

// ---------- Sak: pose-by-pose ----------
//
// All poses below assume origin is at the feet center. Body extends upward
// (negative y). A "unit" is roughly 1 px in the local space. We draw at scale 1
// here; outer transform handles range scaling.
//
// Body envelope:
//   feet at y=0
//   knees at y=-30
//   hips at y=-60
//   solar plexus at y=-95
//   shoulders at y=-110
//   neck at y=-122
//   head center at y=-140
//   head top at y=-160

function drawSakLegs(ctx, splayed = 1) {
  // Orthodox stance: lead leg (side=-1) is forward and slightly bent;
  // rear leg (side=+1) is back and angled outward, foot a touch higher
  // (further from camera in 3/4 perspective).
  // Trunks (red shorts) — wider on the rear hip to suggest a turned waist.
  ctx.fillStyle = C.trunk
  ctx.beginPath()
  ctx.moveTo(-24 * splayed, -52)
  ctx.lineTo(26 * splayed, -52)
  ctx.lineTo(30 * splayed, -75)
  ctx.lineTo(-28 * splayed, -75)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = C.trunkSh; ctx.lineWidth = 2; ctx.stroke()
  // Gold band
  ctx.fillStyle = C.gold
  ctx.fillRect(-29 * splayed, -77, 60 * splayed, 4)
  ctx.strokeStyle = C.outline; ctx.lineWidth = 1
  ctx.strokeRect(-29 * splayed + 0.5, -77 + 0.5, 60 * splayed, 4)
  // Legs — lead reaches further down and slightly inward; rear stays back.
  thickStroke(ctx, C.skin, 16, () => {
    ctx.beginPath()
    // Lead leg
    ctx.moveTo(-12 * splayed, -50)
    ctx.lineTo(-14 * splayed, -3)
    // Rear leg — angled outward, foot higher
    ctx.moveTo(16 * splayed, -50)
    ctx.lineTo(24 * splayed, -8)
    ctx.stroke()
  })
  // Outline detail (front/back of each thigh)
  thickStroke(ctx, C.outline, 2, () => {
    ctx.beginPath()
    // Lead thigh outline
    ctx.moveTo(-20 * splayed, -50); ctx.lineTo(-22 * splayed, -3)
    ctx.moveTo(-4 * splayed, -50);  ctx.lineTo(-6 * splayed, -3)
    // Rear thigh outline
    ctx.moveTo(8 * splayed, -50);   ctx.lineTo(16 * splayed, -8)
    ctx.moveTo(24 * splayed, -50);  ctx.lineTo(32 * splayed, -8)
    ctx.stroke()
  })
  // Feet
  ctx.fillStyle = C.outline
  // Lead foot — bigger, planted forward-toward-camera (lower on screen)
  ctx.fillRect(-26 * splayed, -3, 24, 7)
  // Rear foot — narrower, slightly higher (further), angled out
  ctx.fillRect(14 * splayed, -8, 22, 6)
}

function drawSakTorso(ctx) {
  // V-tapered torso: narrow waist, wider chest. Subtle anatomical taper
  // reads better than a flat trapezoid at this resolution.
  ctx.fillStyle = C.skin
  ctx.beginPath()
  ctx.moveTo(-26, -75)         // narrow waist
  ctx.lineTo(26, -75)
  ctx.lineTo(34, -110)          // broader shoulders
  ctx.lineTo(-34, -110)
  ctx.closePath()
  ctx.fill()
  thickStroke(ctx, C.outline, 2, () => {
    ctx.beginPath()
    ctx.moveTo(-26, -75); ctx.lineTo(26, -75)
    ctx.lineTo(34, -110); ctx.lineTo(-34, -110); ctx.closePath()
    ctx.stroke()
  })
  // Pec line down centerline
  ctx.fillStyle = C.skinSh
  ctx.fillRect(-1, -108, 2, 30)
  // Pec curves
  ctx.strokeStyle = C.skinSh; ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-22, -100); ctx.quadraticCurveTo(-12, -94, -2, -100)
  ctx.moveTo( 22, -100); ctx.quadraticCurveTo( 12, -94,  2, -100)
  ctx.stroke()
  // Abs (4-pack hint)
  ctx.beginPath()
  ctx.moveTo(-10, -92); ctx.lineTo(10, -92)
  ctx.moveTo(-9,  -84); ctx.lineTo(9,  -84)
  ctx.stroke()
  // Neck — fills the gap between shoulders and head
  ctx.fillStyle = C.skin
  ctx.beginPath()
  ctx.moveTo(-9, -110); ctx.lineTo(9, -110)
  ctx.lineTo(7, -122);  ctx.lineTo(-7, -122)
  ctx.closePath()
  ctx.fill()
  thickStroke(ctx, C.outline, 2, () => {
    ctx.beginPath()
    ctx.moveTo(-9, -110); ctx.lineTo(-7, -122)
    ctx.moveTo( 9, -110); ctx.lineTo( 7, -122)
    ctx.stroke()
  })
  // Throat shadow
  ctx.fillStyle = C.skinSh
  ctx.fillRect(-1, -120, 2, 10)
}

function drawSakHead(ctx, opp, t) {
  // Head — round, big, cartoon proportions
  const cx = 0, cy = -142
  // Hair (top of head)
  ctx.fillStyle = C.hair
  ctx.beginPath()
  ctx.arc(cx, cy - 4, 20, Math.PI, Math.PI * 2)
  ctx.fill()
  // Face
  fillCircle(ctx, cx, cy, 18, C.skin, C.outline, 2)
  // Brow shadow
  ctx.fillStyle = C.skinSh
  ctx.fillRect(cx - 14, cy - 4, 28, 2)
  // Eyes
  if (opp.state === 'hit') {
    // X eyes
    ctx.strokeStyle = C.outline; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 9, cy - 2); ctx.lineTo(cx - 3, cy + 2)
    ctx.moveTo(cx - 3, cy - 2); ctx.lineTo(cx - 9, cy + 2)
    ctx.moveTo(cx + 3, cy - 2); ctx.lineTo(cx + 9, cy + 2)
    ctx.moveTo(cx + 9, cy - 2); ctx.lineTo(cx + 3, cy + 2)
    ctx.stroke()
  } else if (opp.state === 'block') {
    ctx.fillStyle = C.outline
    ctx.fillRect(cx - 9, cy, 6, 1)
    ctx.fillRect(cx + 3, cy, 6, 1)
  } else {
    // Angry slit eyes with whites
    ctx.fillStyle = C.outline
    ctx.fillRect(cx - 10, cy - 2, 6, 3)
    ctx.fillRect(cx + 4, cy - 2, 6, 3)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - 8, cy - 1, 1, 1)
    ctx.fillRect(cx + 6, cy - 1, 1, 1)
    // Brow lines
    ctx.strokeStyle = C.outline; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 12, cy - 5); ctx.lineTo(cx - 4, cy - 3)
    ctx.moveTo(cx + 12, cy - 5); ctx.lineTo(cx + 4, cy - 3)
    ctx.stroke()
  }
  // Mouth
  ctx.fillStyle = C.outline
  if (opp.state === 'hit') {
    ctx.fillRect(cx - 5, cy + 7, 10, 2)
    ctx.fillStyle = C.blood
    ctx.fillRect(cx - 1, cy + 9, 2, 5)
  } else if (opp.state === 'striking' || opp.state === 'telegraph') {
    // Snarl: teeth bared
    ctx.fillRect(cx - 6, cy + 6, 12, 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - 5, cy + 7, 10, 1)
  } else {
    ctx.fillRect(cx - 5, cy + 6, 10, 1)
  }
  // Mongkhon (head band)
  ctx.fillStyle = C.gold
  ctx.fillRect(cx - 18, cy - 14, 36, 3)
  ctx.fillStyle = C.trunkSh
  ctx.fillRect(cx - 18, cy - 11, 36, 1)
}

function drawSakArm(ctx, side, mode) {
  // mode: 'guard' | 'leadGuard' | 'rearGuard' | 'low' | 'extended-jab' | 'extended-cross' | 'block' | 'wide' | 'cocked-jab' | 'cocked-cross'
  // side: -1 = his lead-side (jabs from here), +1 = his rear-side (crosses from here)
  const sh = { x: 32 * side, y: -110 }     // shoulder
  let elbow, glove, gloveR = 13
  switch (mode) {
    case 'guard':
      elbow = { x: 22 * side, y: -100 }
      glove = { x: 12 * side, y: -132 }
      break
    case 'leadGuard':
      // Orthodox lead hand: forward and slightly extended, glove at chin height
      // protecting the centerline; elbow tucked tight to the ribs.
      elbow = { x: 20 * side, y: -98 }
      glove = { x: 14 * side, y: -126 }
      break
    case 'rearGuard':
      // Rear hand: pinned high to the cheekbone, elbow clamped against the ribs.
      elbow = { x: 18 * side, y: -100 }
      glove = { x: 9 * side, y: -136 }
      break
    case 'low':
      elbow = { x: 28 * side, y: -90 }
      glove = { x: 22 * side, y: -82 }
      break
    case 'block':
      elbow = { x: 16 * side, y: -100 }
      glove = { x: 6 * side,  y: -135 }
      break
    case 'cocked-jab':
      elbow = { x: 38 * side, y: -100 }
      glove = { x: 30 * side, y: -120 }
      break
    case 'extended-jab':
      // Arm extends straight forward (toward camera) — emphasize length + bigger glove (perspective)
      elbow = { x: 12 * side, y: -110 }
      glove = { x: -28 * side, y: -116 }
      gloveR = 18
      break
    case 'cocked-cross':
      elbow = { x: 40 * side, y: -100 }
      glove = { x: 28 * side, y: -132 }
      break
    case 'extended-cross':
      // Crosses through the center of the body
      elbow = { x: 6 * side, y: -108 }
      glove = { x: -38 * side, y: -118 }
      gloveR = 18
      break
    case 'wide':
      elbow = { x: 50 * side, y: -100 }
      glove = { x: 60 * side, y: -90 }
      break
    default:
      elbow = { x: 22 * side, y: -100 }
      glove = { x: 12 * side, y: -132 }
  }
  // Upper arm
  thickStroke(ctx, C.skin, 12, () => {
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(elbow.x, elbow.y); ctx.stroke()
  })
  thickStroke(ctx, C.outline, 2, () => {
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(elbow.x, elbow.y); ctx.stroke()
  })
  // Forearm
  thickStroke(ctx, C.skin, 10, () => {
    ctx.beginPath(); ctx.moveTo(elbow.x, elbow.y); ctx.lineTo(glove.x, glove.y); ctx.stroke()
  })
  thickStroke(ctx, C.outline, 2, () => {
    ctx.beginPath(); ctx.moveTo(elbow.x, elbow.y); ctx.lineTo(glove.x, glove.y); ctx.stroke()
  })
  // Glove
  fillCircle(ctx, glove.x, glove.y, gloveR, C.glove, C.outline, 2)
  // Glove dark side
  ctx.beginPath()
  ctx.arc(glove.x + gloveR * 0.4, glove.y + gloveR * 0.2, gloveR * 0.8, 0, Math.PI * 2)
  ctx.fillStyle = C.gloveSh
  ctx.globalAlpha = 0.5
  ctx.fill()
  ctx.globalAlpha = 1
  // Lace
  ctx.fillStyle = C.laces
  ctx.fillRect(glove.x - 2, glove.y - gloveR * 0.3, 3, gloveR * 0.7)
}

function drawSakLeg(ctx, side, mode) {
  // Special leg overrides for kick/knee. Default legs drawn by drawSakLegs.
  // mode: 'kick-cocked' | 'kick-extended' | 'knee-up' | 'normal'
  if (mode === 'kick-cocked') {
    // rear leg pulled back and up
    thickStroke(ctx, C.skin, 16, () => {
      ctx.beginPath()
      ctx.moveTo(14 * side, -75)
      ctx.lineTo(48 * side, -50)
      ctx.lineTo(60 * side, -10)
      ctx.stroke()
    })
    thickStroke(ctx, C.outline, 2, () => {
      ctx.beginPath()
      ctx.moveTo(14 * side, -75); ctx.lineTo(48 * side, -50); ctx.lineTo(60 * side, -10)
      ctx.stroke()
    })
    ctx.fillStyle = C.outline
    ctx.fillRect(60 * side - 6, -14, 14, 8)
  } else if (mode === 'kick-extended') {
    // Leg whipping low across body
    thickStroke(ctx, C.skin, 16, () => {
      ctx.beginPath()
      ctx.moveTo(14 * side, -75)
      ctx.lineTo(-10 * side, -60)
      ctx.lineTo(-58 * side, -50)
      ctx.stroke()
    })
    thickStroke(ctx, C.outline, 2, () => {
      ctx.beginPath()
      ctx.moveTo(14 * side, -75); ctx.lineTo(-10 * side, -60); ctx.lineTo(-58 * side, -50)
      ctx.stroke()
    })
    ctx.fillStyle = C.outline
    ctx.fillRect(-66 * side, -54, 16, 8)
    // Speed arc
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(40 * side, -10)
    ctx.quadraticCurveTo(30 * side, -70, -50 * side, -50)
    ctx.stroke()
  } else if (mode === 'knee-up') {
    // Big TRIANGLE silhouette — base at the hip, sharp apex at chest level
    // angled FORWARD (toward camera). Reads instantly as a knee strike.
    const hipX = 10 * side
    const hipY = -76
    const apexX = -10 * side    // crosses to the opponent's centerline
    const apexY = -130           // chest height
    const baseHalfW = 16

    // Trunks flap at the base of the leg
    ctx.fillStyle = C.trunk
    ctx.fillRect(hipX - baseHalfW - 2, hipY - 6, (baseHalfW + 2) * 2, 8)
    ctx.strokeStyle = C.outline; ctx.lineWidth = 2
    ctx.strokeRect(hipX - baseHalfW - 2 + 0.5, hipY - 6 + 0.5, (baseHalfW + 2) * 2, 8)

    // Main triangle (skin)
    ctx.fillStyle = C.skin
    ctx.beginPath()
    ctx.moveTo(hipX - baseHalfW, hipY)
    ctx.lineTo(hipX + baseHalfW, hipY)
    ctx.lineTo(apexX, apexY)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = C.outline; ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Inner darker triangle for depth
    ctx.fillStyle = C.skinSh
    ctx.beginPath()
    ctx.moveTo(hipX - baseHalfW * 0.4, hipY - 4)
    ctx.lineTo(hipX + baseHalfW * 0.6, hipY - 4)
    ctx.lineTo(apexX, apexY)
    ctx.closePath()
    ctx.fill()

    // Sharp knee cap at the apex
    fillCircle(ctx, apexX, apexY, 8, C.skinSh, C.outline, 2)
    ctx.fillStyle = C.skinHi
    ctx.beginPath()
    ctx.arc(apexX - 2, apexY - 2, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSakIdle(ctx, t, lowGuard = false) {
  drawSakLegs(ctx)
  // Orthodox guard: lead hand (side=-1, the jab side) forward, rear hand by the cheek.
  drawSakArm(ctx, -1, lowGuard ? 'low' : 'leadGuard')
  drawSakArm(ctx, +1, lowGuard ? 'low' : 'rearGuard')
  drawSakTorso(ctx)
  drawSakHead(ctx, { state: 'idle' }, t)
}

function drawSakBlock(ctx, t) {
  drawSakLegs(ctx)
  drawSakArm(ctx, -1, 'block')
  drawSakArm(ctx, +1, 'block')
  drawSakTorso(ctx)
  drawSakHead(ctx, { state: 'block' }, t)
}

function drawSakHit(ctx, t) {
  // Head snapped back, body shaken, arms wide-out
  ctx.save()
  ctx.translate(0, -2)
  drawSakLegs(ctx)
  ctx.translate(2, -3) // upper body shifted back
  drawSakArm(ctx, -1, 'wide')
  drawSakArm(ctx, +1, 'wide')
  drawSakTorso(ctx)
  ctx.translate(3, -4)
  drawSakHead(ctx, { state: 'hit' }, t)
  ctx.restore()
}

function drawSakDown(ctx, t) {
  // Lay him flat — rotate the whole figure 90deg
  ctx.save()
  ctx.translate(40, -10)
  ctx.rotate(Math.PI / 2.1)
  drawSakLegs(ctx)
  drawSakArm(ctx, -1, 'wide')
  drawSakArm(ctx, +1, 'wide')
  drawSakTorso(ctx)
  drawSakHead(ctx, { state: 'hit' }, t)
  ctx.restore()
}

function drawSakWindup(ctx, t, move) {
  drawSakLegs(ctx)
  if (move === 'jab') {
    drawSakArm(ctx, -1, 'cocked-jab')
    drawSakArm(ctx, +1, 'rearGuard')
  } else if (move === 'cross') {
    drawSakArm(ctx, -1, 'leadGuard')
    drawSakArm(ctx, +1, 'cocked-cross')
  } else if (move === 'kick') {
    drawSakLeg(ctx, +1, 'kick-cocked')
    drawSakArm(ctx, -1, 'leadGuard')
    drawSakArm(ctx, +1, 'wide')
  } else if (move === 'knee') {
    drawSakLeg(ctx, +1, 'knee-up')
    drawSakArm(ctx, -1, 'leadGuard')
    drawSakArm(ctx, +1, 'rearGuard')
  } else {
    drawSakArm(ctx, -1, 'leadGuard')
    drawSakArm(ctx, +1, 'rearGuard')
  }
  drawSakTorso(ctx)
  drawSakHead(ctx, { state: 'telegraph' }, t)
}

function drawSakStrike(ctx, t, move, stateT, dur) {
  const t01 = Math.min(1, stateT / dur)
  drawSakLegs(ctx)
  if (move === 'jab') {
    drawSakArm(ctx, -1, 'extended-jab')
    drawSakArm(ctx, +1, 'rearGuard')
    drawSakSpeed(ctx, [{x: 32, y: -108}, {x: -28, y: -116}], t01)
  } else if (move === 'cross') {
    drawSakArm(ctx, -1, 'leadGuard')
    drawSakArm(ctx, +1, 'extended-cross')
    drawSakSpeed(ctx, [{x: -32, y: -108}, {x: 38, y: -118}], t01)
  } else if (move === 'kick') {
    drawSakLeg(ctx, +1, 'kick-extended')
    drawSakArm(ctx, -1, 'leadGuard')
    drawSakArm(ctx, +1, 'wide')
  } else if (move === 'knee') {
    drawSakLeg(ctx, +1, 'knee-up')
    drawSakArm(ctx, -1, 'leadGuard')
    drawSakArm(ctx, +1, 'rearGuard')
    // Speed lines coming up
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t01)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(8, -75); ctx.lineTo(8, -100); ctx.stroke()
  } else {
    drawSakArm(ctx, -1, 'guard')
    drawSakArm(ctx, +1, 'guard')
  }
  drawSakTorso(ctx)
  drawSakHead(ctx, { state: 'striking' }, t)
}

function drawSakSpeed(ctx, [from, to], t01) {
  ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - t01) + 0.15})`
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  // ghost glove behind
  ctx.fillStyle = `rgba(255,80,80,${0.4 * (1 - t01)})`
  ctx.beginPath()
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  ctx.arc(mx, my, 10, 0, Math.PI * 2)
  ctx.fill()
}

// ---------- Player FG (first-person gloves) ----------

function drawPlayerFG(ctx, player, t, zone = 'mid') {
  // Dodge offset
  let dodgeOff = 0
  if (player.state === 'dodging') {
    const t01 = Math.min(1, player.stateT / 320)
    const sin = Math.sin(t01 * Math.PI)
    dodgeOff = player.dodgeDir * 70 * sin
  }

  drawShoulderSilhouette(ctx, dodgeOff, player)

  // Orthodox first-person guard: lead (left) glove forward — appears smaller
  // and higher (further from camera). Rear (right) glove cocked by the chin —
  // larger and lower (closer to camera). Both pulled toward center for a
  // proper boxing window between the gloves.
  const idleL = { x: 130 + dodgeOff, y: 215, r: 24 }
  const idleR = { x: CANVAS_W - 100 + dodgeOff, y: 240, r: 32 }
  let leftG = { ...idleL }
  let rightG = { ...idleR }
  let lowFx = null     // {kind, t01, side}
  let elbowFx = null
  let teepFx = null
  let stretch = 1

  // Block: gloves up high, gauntlet style
  if (player.state === 'blocking' || player.blocking) {
    leftG = { x: 165 + dodgeOff, y: 175, r: 30 }
    rightG = { x: CANVAS_W - 165 + dodgeOff, y: 175, r: 30 }
  }
  if (player.state === 'hit') {
    const wob = Math.sin(t * 0.06) * 5
    leftG = { x: 80 + wob + dodgeOff, y: 248, r: 30 }
    rightG = { x: CANVAS_W - 80 - wob + dodgeOff, y: 248, r: 30 }
  }

  if (player.state === 'attacking' && player.strike) {
    const def = PLAYER_STRIKES[player.strike]
    const phase = player.strikePhase
    const t01 = strikePhaseProgress(player)
    const isLeft = def.glove === 'L'
    const baseG = isLeft ? idleL : idleR

    if (def.kind === 'light' && (player.strike === 'jab' || player.strike === 'cross')) {
      // SNAP keyframes:
      //   startup (very brief): glove snaps to cocked position behind
      //   active: glove SNAPPED to extended forward+up + huge motion line
      //   recover: snap back to idle
      let p = { ...baseG }
      if (phase === 'startup') {
        // Cocked
        p.x = baseG.x + (isLeft ? 22 : -22)
        p.y = baseG.y + 14
        p.r = baseG.r
      } else if (phase === 'active') {
        // Extended — fly toward opponent center (zone determines depth)
        const tgtX = OPP_ANCHOR_X + (isLeft ? -22 : 22)
        const tgtY = zone === 'close' ? 178 : (zone === 'long' ? 150 : 168)
        p.x = tgtX; p.y = tgtY; p.r = baseG.r - 8
        stretch = 1.15
      } else {
        // recover — snap back
        p.x = baseG.x; p.y = baseG.y; p.r = baseG.r
      }
      if (isLeft) leftG = p; else rightG = p
    } else if (def.kind === 'heavy' && (player.strike === 'lelbow' || player.strike === 'relbow')) {
      // Elbow keyframes
      if (phase === 'active') {
        elbowFx = { side: isLeft ? -1 : 1, t01, dodgeOff }
        const baseGloveX = isLeft ? OPP_ANCHOR_X - 16 : OPP_ANCHOR_X + 16
        const target = isLeft ? leftG : rightG
        target.x = baseGloveX
        target.y = 200
        target.r = baseG.r - 8
      } else if (phase === 'startup') {
        // Pull glove in close to face (chamber)
        const target = isLeft ? leftG : rightG
        target.x = baseG.x + (isLeft ? 60 : -60)
        target.y = 200
        target.r = baseG.r - 4
      }
    } else if (def.kind === 'heavy' && (player.strike === 'lknee' || player.strike === 'rknee' || player.strike === 'lkick' || player.strike === 'rkick')) {
      lowFx = { kind: player.strike, t01, side: isLeft ? -1 : 1, phase, dodgeOff }
      if (phase === 'active') {
        leftG = { ...idleL, y: 244, x: idleL.x + (isLeft ? 18 : -8) }
        rightG = { ...idleR, y: 244, x: idleR.x + (isLeft ? 8 : -18) }
      }
    } else if (player.strike === 'teep') {
      teepFx = { t01, phase, dodgeOff }
      leftG = { ...idleL, y: 240 }
      rightG = { ...idleR, y: 240 }
    }
  }

  // Render order: low strikes (behind), gloves, elbow on top
  if (lowFx) drawLowStrikeFG(ctx, lowFx, t)
  if (teepFx) drawTeepFG(ctx, teepFx, t)

  drawGlove(ctx, leftG, true, stretch)
  drawGlove(ctx, rightG, false, stretch)

  if (elbowFx) drawElbowFG(ctx, elbowFx, t)
}

function strikePhaseProgress(player) {
  const def = PLAYER_STRIKES[player.strike]
  const phaseDur = player.strikePhase === 'startup' ? def.startup
    : player.strikePhase === 'active' ? def.active
    : def.recover
  return Math.min(1, player.stateT / phaseDur)
}

function drawShoulderSilhouette(ctx, off, player) {
  ctx.fillStyle = '#0a0509'
  ctx.beginPath()
  ctx.moveTo(0, CANVAS_H)
  ctx.lineTo(0, CANVAS_H - 32)
  ctx.bezierCurveTo(80, CANVAS_H - 36, 130, CANVAS_H - 70, 160 + off, CANVAS_H - 64)
  ctx.bezierCurveTo(200 + off, CANVAS_H - 78, 220 + off, CANVAS_H - 90, CANVAS_W / 2 + off, CANVAS_H - 92)
  ctx.bezierCurveTo(CANVAS_W - 220 + off, CANVAS_H - 90, CANVAS_W - 200 + off, CANVAS_H - 78, CANVAS_W - 160 + off, CANVAS_H - 64)
  ctx.bezierCurveTo(CANVAS_W - 130, CANVAS_H - 70, CANVAS_W - 80, CANVAS_H - 36, CANVAS_W, CANVAS_H - 32)
  ctx.lineTo(CANVAS_W, CANVAS_H)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#221018'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(160 + off, CANVAS_H - 64)
  ctx.bezierCurveTo(200 + off, CANVAS_H - 78, 220 + off, CANVAS_H - 90, CANVAS_W / 2 + off, CANVAS_H - 92)
  ctx.bezierCurveTo(CANVAS_W - 220 + off, CANVAS_H - 90, CANVAS_W - 200 + off, CANVAS_H - 78, CANVAS_W - 160 + off, CANVAS_H - 64)
  ctx.stroke()
}

function drawGlove(ctx, g, isLeftHand, stretch = 1) {
  // Wrist
  ctx.fillStyle = C.skin
  ctx.fillRect(g.x - g.r * 0.55, g.y + g.r * 0.45, g.r * 1.1, g.r * 0.7)
  ctx.strokeStyle = C.outline; ctx.lineWidth = 2
  ctx.strokeRect(g.x - g.r * 0.55 + 0.5, g.y + g.r * 0.45 + 0.5, g.r * 1.1, g.r * 0.7)

  // Glove body — slight stretch in motion
  fillEllipse(ctx, g.x, g.y, g.r * stretch, g.r, C.glove, C.outline, 3)

  // Glove highlight (top-left)
  ctx.beginPath()
  ctx.ellipse(g.x - g.r * 0.35, g.y - g.r * 0.35, g.r * 0.45, g.r * 0.3, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#ff6060'
  ctx.globalAlpha = 0.6
  ctx.fill()
  ctx.globalAlpha = 1
  // Glove dark side
  ctx.beginPath()
  ctx.ellipse(g.x + g.r * 0.35, g.y + g.r * 0.3, g.r * 0.6, g.r * 0.4, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.gloveSh
  ctx.globalAlpha = 0.45
  ctx.fill()
  ctx.globalAlpha = 1
  // Lace
  ctx.fillStyle = C.laces
  ctx.fillRect(g.x - 2, g.y - g.r * 0.25, 4, g.r * 0.5)
  ctx.fillRect(g.x - 4, g.y - g.r * 0.15, 8, 2)
  ctx.fillRect(g.x - 4, g.y + g.r * 0.05, 8, 2)
}

function drawElbowFG(ctx, info, t) {
  const { side, t01, dodgeOff } = info
  // Big triangle: WIDE base in the foreground, SHARP apex thrust toward opponent.
  // Asymmetric — base biased to the side of the strike so the angle reads.
  const dx = dodgeOff || 0
  const baseInner = side === -1 ? 60 + dx : CANVAS_W - 60 + dx     // toward edge of screen
  const baseOuter = side === -1 ? 200 + dx : CANVAS_W - 200 + dx   // bias inward (the back of the arm)
  const baseY     = 250
  const apexX     = OPP_ANCHOR_X + (side === -1 ? -22 : 22)         // contact point near opponent
  const apexY     = 175

  // Drop shadow / underglow so the triangle reads against background
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.moveTo(baseInner + 3, baseY + 3)
  ctx.lineTo(baseOuter + 3, baseY + 3)
  ctx.lineTo(apexX + 3, apexY + 3)
  ctx.closePath()
  ctx.fill()

  // The arm triangle (skin)
  ctx.fillStyle = C.skin
  ctx.beginPath()
  ctx.moveTo(baseInner, baseY)
  ctx.lineTo(baseOuter, baseY)
  ctx.lineTo(apexX, apexY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = C.outline; ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Inner darker triangle (depth — front face) — same apex, narrower base toward the
  // outside edge so the elbow angle reads
  ctx.fillStyle = C.skinSh
  const innerInner = lerpScalar(baseInner, baseOuter, 0.55)
  const innerY = lerpScalar(baseY, apexY, 0.18)
  ctx.beginPath()
  ctx.moveTo(innerInner, baseY)
  ctx.lineTo(baseOuter, baseY)
  ctx.lineTo(apexX, apexY)
  ctx.lineTo(lerpScalar(innerInner, apexX, 0.4), lerpScalar(baseY, apexY, 0.4))
  ctx.closePath()
  ctx.fill()

  // SHARP elbow point — a small black-tipped wedge at the apex
  const tipBack = side === -1 ? 14 : -14   // direction of the elbow joint pointing
  ctx.fillStyle = C.outline
  ctx.beginPath()
  ctx.moveTo(apexX, apexY - 10)
  ctx.lineTo(apexX + tipBack, apexY + 4)
  ctx.lineTo(apexX - tipBack * 0.3, apexY + 6)
  ctx.closePath()
  ctx.fill()

  // Bicep highlight stripe (toward foreground edge)
  ctx.strokeStyle = C.skinHi
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(baseInner + 8, baseY - 4)
  ctx.lineTo(lerpScalar(baseInner + 8, apexX, 0.55), lerpScalar(baseY - 4, apexY, 0.55))
  ctx.stroke()

  // Speed lines flanking the back edge of the triangle (suggesting forward thrust)
  ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t01) + 0.2})`
  ctx.lineWidth = 3
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5) * 12
    ctx.beginPath()
    ctx.moveTo(baseOuter + o, baseY + 4)
    ctx.lineTo(apexX + o * 0.25, apexY + 12 + i * 2)
    ctx.stroke()
  }
}

function drawKneeFG(ctx, info, t) {
  const { side, phase, dodgeOff, t01 } = info
  // Big triangle ERUPTING UP from the bottom of the screen, sharp apex angling
  // forward+inward toward the opponent's body.
  const dx = dodgeOff || 0
  const baseCx     = OPP_ANCHOR_X + (side === -1 ? -52 : 52) + dx
  const baseY      = CANVAS_H + 12
  const baseHalfW  = 36
  // Apex slides up during startup, snaps to extended on active, retracts on recover
  const extend = phase === 'active' ? 1 : phase === 'startup' ? 0.55 : 0.5
  const apexX = baseCx + (OPP_ANCHOR_X - baseCx) * 0.85
  const apexY = lerpScalar(baseY, 162, extend)

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.beginPath()
  ctx.moveTo(baseCx - baseHalfW + 3, baseY + 3)
  ctx.lineTo(baseCx + baseHalfW + 3, baseY + 3)
  ctx.lineTo(apexX + 3, apexY + 3)
  ctx.closePath()
  ctx.fill()

  // Trunks ribbon at the base (red flap visible above the knee)
  ctx.fillStyle = C.trunk
  ctx.fillRect(baseCx - baseHalfW - 4, baseY - 22, (baseHalfW + 4) * 2, 12)
  ctx.strokeStyle = C.outline; ctx.lineWidth = 2
  ctx.strokeRect(baseCx - baseHalfW - 4 + 0.5, baseY - 22 + 0.5, (baseHalfW + 4) * 2, 12)
  ctx.fillStyle = C.gold
  ctx.fillRect(baseCx - baseHalfW - 4, baseY - 12, (baseHalfW + 4) * 2, 3)

  // Main triangle (skin)
  ctx.fillStyle = C.skin
  ctx.beginPath()
  ctx.moveTo(baseCx - baseHalfW, baseY)
  ctx.lineTo(baseCx + baseHalfW, baseY)
  ctx.lineTo(apexX, apexY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = C.outline; ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Inner darker triangle (front face — gives depth)
  ctx.fillStyle = C.skinSh
  ctx.beginPath()
  ctx.moveTo(lerpScalar(baseCx - baseHalfW, apexX, 0.25), lerpScalar(baseY, apexY, 0.25))
  ctx.lineTo(lerpScalar(baseCx + baseHalfW, apexX, 0.25), lerpScalar(baseY, apexY, 0.25))
  ctx.lineTo(apexX, apexY)
  ctx.closePath()
  ctx.fill()

  // SHARP knee cap apex
  ctx.fillStyle = C.outline
  ctx.beginPath()
  ctx.arc(apexX, apexY, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = C.skinHi
  ctx.beginPath()
  ctx.arc(apexX - 2, apexY - 2, 4, 0, Math.PI * 2)
  ctx.fill()

  // Speed lines erupting from below
  ctx.strokeStyle = `rgba(255,255,255,${phase === 'active' ? 0.85 : 0.35})`
  ctx.lineWidth = 3
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(baseCx + i * 9, baseY)
    ctx.lineTo(apexX + i * 3, apexY + 18)
    ctx.stroke()
  }
}

function drawLowStrikeFG(ctx, info, t) {
  const { kind, t01, side, phase, dodgeOff } = info
  const isKnee = kind.includes('knee')
  const isKick = kind.includes('kick')

  if (isKnee) {
    drawKneeFG(ctx, info, t)
    return
  }

  const startX = (side === -1 ? 110 : CANVAS_W - 110) + (dodgeOff || 0)
  const startY = CANVAS_H + 20

  if (isKick) {
    // Sweeping arc — drawn as a thick curving shin with foot
    const ctrlX = (startX + OPP_ANCHOR_X) / 2 + (side === -1 ? 80 : -80)
    const ctrlY = (startY + 180) / 2 - 80
    const tgtX = OPP_ANCHOR_X + (side === -1 ? 30 : -30)
    const tgtY = 200
    const e = phase === 'active' ? 1 : (phase === 'startup' ? 0.4 : 0.6)
    const cx = (1-e)*(1-e)*startX + 2*(1-e)*e*ctrlX + e*e*tgtX
    const cy = (1-e)*(1-e)*startY + 2*(1-e)*e*ctrlY + e*e*tgtY

    // Speed arc behind
    ctx.strokeStyle = `rgba(255,255,255,${phase === 'active' ? 0.7 : 0.25})`
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(startX, startY - 10)
    ctx.quadraticCurveTo(ctrlX, ctrlY, cx, cy)
    ctx.stroke()

    thickStroke(ctx, C.skin, 18, () => {
      ctx.beginPath()
      ctx.moveTo(startX, startY - 4)
      ctx.lineTo(cx, cy)
      ctx.stroke()
    })
    thickStroke(ctx, C.outline, 2, () => {
      ctx.beginPath()
      ctx.moveTo(startX, startY - 4); ctx.lineTo(cx, cy); ctx.stroke()
    })
    fillCircle(ctx, cx, cy, 12, C.skinSh, C.outline, 2)
    // Trunks flap
    ctx.fillStyle = C.trunk
    ctx.fillRect(startX - 16, startY - 18, 32, 10)
    ctx.strokeStyle = C.outline; ctx.lineWidth = 2
    ctx.strokeRect(startX - 16 + 0.5, startY - 18 + 0.5, 32, 10)
  }
}

function drawTeepFG(ctx, info, t) {
  const { t01, phase, dodgeOff } = info
  const startY = CANVAS_H + 10
  const tgtY = 195
  const e = phase === 'active' ? 1 : (phase === 'startup' ? 0.4 : 0.4)
  const cx = OPP_ANCHOR_X + (dodgeOff || 0)
  const cy = startY + (tgtY - startY) * e

  // Speed lines
  ctx.strokeStyle = `rgba(255,255,255,${phase === 'active' ? 0.85 : 0.3})`
  ctx.lineWidth = 3
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(cx + i * 8, startY)
    ctx.lineTo(cx + i * 4, cy + 16)
    ctx.stroke()
  }
  ctx.fillStyle = C.skin
  const shinW = 28 - 12 * e
  ctx.beginPath()
  ctx.moveTo(cx - 18, startY)
  ctx.lineTo(cx + 18, startY)
  ctx.lineTo(cx + shinW / 2, cy)
  ctx.lineTo(cx - shinW / 2, cy)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = C.outline
  ctx.fillRect(cx - shinW / 2 - 3, cy - 5, shinW + 6, 5)
}

// ---------- Comic-book impact graphic ----------

function drawImpact(ctx, impact, t) {
  if (!impact) return
  // life is tracked via impact.t0 advancing here
  impact.t0 += 16   // approximate per-render advancement; not super important — used for animation phase
  const life = Math.min(1, impact.t0 / impact.dur)
  if (life >= 1) return

  const cx = CANVAS_W / 2 + (impact.side || 0) * 30
  const cy = impact.incoming ? CANVAS_H - 130 : 150

  // Pop-in: scale grows fast then settles
  const scale = life < 0.15 ? life / 0.15 * 1.3
              : life < 0.3 ? 1.3 - (life - 0.15) / 0.15 * 0.3
              : 1.0
  const alpha = life > 0.7 ? (1 - life) / 0.3 : 1

  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.globalAlpha = alpha

  const txt = impact.megaton ? 'MEGATON!!'
            : impact.counter ? 'COUNTER!!'
            : impact.kind === 'wham' ? 'WHAM!'
            : impact.kind === 'crack' ? 'CRACK!'
            : impact.kind === 'block' ? 'BLOCK!'
            : 'POW!'

  // Spiky burst behind text — yellow/orange starburst
  const spikes = impact.kind === 'block' ? 8 : 12
  const ro = impact.kind === 'block' ? 60 : 80
  const ri = impact.kind === 'block' ? 38 : 46
  ctx.fillStyle = impact.kind === 'block' ? '#7af0ff' : '#ffe04a'
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? ro : ri
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    const px = Math.cos(a) * r, py = Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 3
  ctx.stroke()

  // Inner red ring
  if (impact.kind !== 'block') {
    ctx.fillStyle = '#c41024'
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke()
  }

  // Text
  ctx.font = `bold ${impact.kind === 'block' ? 18 : (txt.length > 6 ? 22 : 28)}px monospace`
  ctx.textAlign = 'center'
  ctx.fillStyle = impact.kind === 'block' ? '#000' : '#fff'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 4
  ctx.strokeText(txt, 0, 8)
  ctx.fillText(txt, 0, 8)

  // Damage number above
  if (impact.dmg && impact.kind !== 'block') {
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = '#ffe04a'
    ctx.strokeText(`-${impact.dmg}`, 0, -36)
    ctx.fillText(`-${impact.dmg}`, 0, -36)
  }

  ctx.textAlign = 'left'
  ctx.restore()
}

// ---------- HUD ----------

function drawHUD(ctx, state, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, CANVAS_W, 24)

  drawBar(ctx, 8, 4, 180, 7, state.player.hp / PLAYER_MAX_HP, '#3aa84a', '#1a4f24')
  const stamLow = state.player.stam < 25
  drawBar(ctx, 8, 13, 180, 4, state.player.stam / PLAYER_MAX_STAM, stamLow ? '#ff6a3a' : '#ffe04a', '#5a4a14')
  drawBar(ctx, CANVAS_W - 188, 4, 180, 7, state.opp.hp / OPP_MAX_HP, '#c93030', '#5a1414', true)

  ctx.font = 'bold 9px monospace'
  ctx.fillStyle = '#f3e9c6'
  ctx.fillText('YOU', 8, 23)
  ctx.textAlign = 'right'
  ctx.fillText('SAK THE REAPER', CANVAS_W - 8, 23)
  ctx.textAlign = 'left'

  drawStars(ctx, state.player, 8, 22, t)

  if (state.player.megatonArmed) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.02)
    ctx.fillStyle = `rgba(255, 220, 60, ${pulse})`
    ctx.font = 'bold 11px monospace'
    ctx.fillText('★ MEGATON ARMED — strike!', 8, 36)
  }

  const sec = Math.ceil(state.msLeft / 1000)
  const mm = String(Math.floor(sec / 60))
  const ss = String(sec % 60).padStart(2, '0')
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = sec <= 10 ? '#ff8d2a' : '#f3e9c6'
  ctx.fillText(`${mm}:${ss}`, CANVAS_W / 2, 18)
  ctx.textAlign = 'left'

  drawRangeBar(ctx, state, t)

  if (state.outOfRangeFlash > 0) {
    const a = Math.min(1, state.outOfRangeFlash / 600)
    ctx.fillStyle = `rgba(255, 80, 30, ${a})`
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('OUT OF RANGE', CANVAS_W / 2, 130)
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = `rgba(255, 200, 160, ${a})`
    const need = state.outOfRangeNeed || 'mid'
    const here = state.zone || 'mid'
    let hint = ''
    if (need === here) hint = ''
    else if (need === 'close' || (here === 'long' && need === 'mid')) hint = 'press W to step in'
    else hint = 'press S to step out'
    ctx.fillText(hint, CANVAS_W / 2, 142)
    ctx.textAlign = 'left'
  }

  if (state.player.counterWindow > 0) {
    const a = Math.min(1, state.player.counterWindow / 700)
    ctx.fillStyle = `rgba(255, 220, 60, ${a})`
    ctx.font = 'bold 18px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('COUNTER!', CANVAS_W / 2, 56)
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = `rgba(255, 240, 180, ${a})`
    ctx.fillText('throw a heavy now', CANVAS_W / 2, 68)
    ctx.textAlign = 'left'
  }
  if (state.player.perfectFlash > 0) {
    const a = Math.min(1, state.player.perfectFlash / 500)
    ctx.fillStyle = `rgba(120, 255, 140, ${a})`
    ctx.font = 'bold 20px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('PERFECT!', CANVAS_W / 2, 100)
    ctx.textAlign = 'left'
  }
  if (state.fx.megatonFlash > 0) {
    const a = Math.min(1, state.fx.megatonFlash / 500)
    ctx.fillStyle = `rgba(255, 80, 30, ${a * 0.4})`
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  if (state.fx.announce && state.fx.announceT > 0) {
    const a = Math.min(1, state.fx.announceT / 400)
    ctx.font = 'bold 32px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = `rgba(255, 220, 60, ${a})`
    ctx.fillText(state.fx.announce, CANVAS_W / 2, CANVAS_H / 2 - 20)
    ctx.textAlign = 'left'
  }

  if (state.phase === 'downCount') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.font = 'bold 56px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffe04a'
    ctx.fillText(String(state.countdown), CANVAS_W / 2, CANVAS_H / 2 + 10)
    if (state.player.hp <= 0 || state.player.state === 'down') {
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = '#f3e9c6'
      ctx.fillText('MASH SPACE / J / K TO GET UP', CANVAS_W / 2, CANVAS_H / 2 + 50)
      const taps = state.getUpTaps; const max = 6
      const barW = 200; const x = CANVAS_W / 2 - barW / 2; const y = CANVAS_H / 2 + 60
      ctx.fillStyle = '#3a1a1a'; ctx.fillRect(x, y, barW, 8)
      ctx.fillStyle = '#3aa84a'; ctx.fillRect(x, y, (barW * taps) / max, 8)
    } else {
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = '#f3e9c6'
      ctx.fillText('OPPONENT IS DOWN', CANVAS_W / 2, CANVAS_H / 2 + 50)
    }
    ctx.textAlign = 'left'
  }

  if (state.phase === 'roundOver') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.font = 'bold 36px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = state.winner === 'player' ? '#ffe04a' : '#c93030'
    ctx.fillText(state.winner === 'player' ? 'KNOCKOUT!' : 'YOU LOSE', CANVAS_W / 2, CANVAS_H / 2 - 10)
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = '#f3e9c6'
    ctx.fillText('press R to rematch', CANVAS_W / 2, CANVAS_H / 2 + 22)
    ctx.textAlign = 'left'
  }
}

function drawRangeBar(ctx, state, t) {
  // Three-segment indicator: CLOSE | MID | LONG with the active one filled.
  const labels = ['CLOSE', 'MID', 'LONG']
  const zones  = ['close', 'mid', 'long']
  const colors = ['#ff7a4a', '#7af0ff', '#ffae3a']
  const segW = 44, segH = 12, gap = 2
  const totalW = segW * 3 + gap * 2
  const x0 = (CANVAS_W - totalW) / 2
  const y = 28

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(x0 - 4, y - 4, totalW + 8, segH + 8)

  // Smooth marker that lerps across segments during a step transition
  const idxFrom = zones.indexOf(state.zonePrev)
  const idxTo   = zones.indexOf(state.zone)
  const tt = smoothstep(Math.min(1, Math.max(0, state.zoneT)))
  const idx = idxFrom + (idxTo - idxFrom) * tt
  const markerX = x0 + idx * (segW + gap) + segW / 2

  for (let i = 0; i < 3; i++) {
    const sx = x0 + i * (segW + gap)
    const isCurrent = i === idxTo
    ctx.fillStyle = isCurrent ? colors[i] : '#1a1018'
    ctx.fillRect(sx, y, segW, segH)
    ctx.strokeStyle = isCurrent ? '#000' : '#3a2a30'
    ctx.lineWidth = 1
    ctx.strokeRect(sx + 0.5, y + 0.5, segW - 1, segH - 1)
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = isCurrent ? '#000' : '#7a6a70'
    ctx.textAlign = 'center'
    ctx.fillText(labels[i], sx + segW / 2, y + 9)
  }
  // Drop a moving caret beneath the marker to sell the step animation
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(markerX, y + segH + 1)
  ctx.lineTo(markerX - 4, y + segH + 6)
  ctx.lineTo(markerX + 4, y + segH + 6)
  ctx.closePath()
  ctx.fill()

  ctx.textAlign = 'left'
}

function drawStars(ctx, player, x, yBase, t) {
  const sy = yBase + 8
  const slotSize = 7, gap = 2
  for (let i = 0; i < 3; i++) {
    const sx = x + i * (slotSize + gap)
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(sx, sy, slotSize, slotSize)
    ctx.strokeStyle = '#4a3a14'; ctx.lineWidth = 1
    ctx.strokeRect(sx + 0.5, sy + 0.5, slotSize - 1, slotSize - 1)
    const filled = player.stars - i
    if (filled >= 1) {
      const pulse = player.megatonArmed ? (0.7 + 0.3 * Math.sin(t * 0.02)) : 1
      ctx.fillStyle = `rgba(255, 220, 60, ${pulse})`
      ctx.fillRect(sx + 1, sy + 3, slotSize - 2, 1)
      ctx.fillRect(sx + 3, sy + 1, 1, slotSize - 2)
    } else if (filled >= 0.5) {
      ctx.fillStyle = '#7a5e1a'
      ctx.fillRect(sx + 1, sy + 3, slotSize - 2, 1)
    }
  }
}

function drawBar(ctx, x, y, w, h, ratio, fill, back, rightAligned = false) {
  ctx.fillStyle = '#000'
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
  ctx.fillStyle = back
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = fill
  if (rightAligned) ctx.fillRect(x + w - w * ratio, y, w * ratio, h)
  else ctx.fillRect(x, y, w * ratio, h)
}

// ---------- Public render ----------

export function renderFrame(ctx, state, t) {
  let sx = 0, sy = 0
  if (state.fx.shake > 0) {
    // Shorter, harder shake
    const k = Math.min(1, state.fx.shake / 100)
    sx = (Math.random() - 0.5) * k * 12
    sy = (Math.random() - 0.5) * k * 12
  }

  ctx.save()
  ctx.translate(sx, sy)

  drawRing(ctx, t)
  drawOpponent(ctx, state.opp, t, state.zone, state.zonePrev, state.zoneT)
  drawPlayerFG(ctx, state.player, t, state.zone)

  ctx.restore()

  if (state.fx.flash > 0) {
    const a = state.fx.flash / 110
    ctx.fillStyle = `rgba(255, 255, 230, ${a * 0.55})`
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  drawImpact(ctx, state.impact, t)
  drawHUD(ctx, state, t)
}
