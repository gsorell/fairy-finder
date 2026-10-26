import { useEffect, useRef, useState } from 'react'
import { pads, rumbleHum, rumblePattern, rumbleStop } from '../joycon/hid.js'
import { createMotion, feedMotion, levelNow, tilt, norm, dot } from '../joycon/motion.js'
import { LEVELS, W, H, loadLevel, step, render } from './marble.js'
import { sfx } from './audio.js'
import { loadBest, saveBest } from './roster.js'
import { useHid, useKeys, fitCanvas, INK, btn, bigBtn, overlay, panel, topBar } from './common.js'

const BEST_KEY = 'carnival-maze-best'
const KEY_TILT = 0.3
const MAX_TILT = 0.6

export default function MarbleMaze({ onExit }) {
  const canvasRef = useRef(null)
  const usingJoyCon = !!(pads.L || pads.R)
  const [level, setLevel] = useState(0)
  const [phase, setPhase] = useState(usingJoyCon ? 'level' : 'play')   // level | forward | play | won
  const [hud, setHud] = useState({ t: 0, falls: 0, gems: 0, total: 0 })
  const [result, setResult] = useState(null)
  const [best, setBest] = useState(() => loadBest(BEST_KEY))
  const [joySide, setJoySide] = useState(null)

  const motion = useRef({ L: createMotion(), R: createMotion() })
  const cal = useRef(null)   // { side, ...levelNow() }
  const keys = useRef(new Set())
  const game = useRef(null)
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])
  // lands in phaseRef at once: IMU frames and animation frames arrive faster than renders
  function go(p) { phaseRef.current = p; setPhase(p) }

  // a fresh board (also used for "Again")
  function goLevel(n) {
    const i = (n + LEVELS.length) % LEVELS.length
    game.current = loadLevel(i)
    setLevel(i)
    setResult(null)
    if (phaseRef.current === 'won') go('play')
  }
  const nextLevel = () => goLevel(level + 1)

  useHid((ev) => {
    if (ev.type === 'imu') {
      feedMotion(motion.current[ev.side], ev.a, ev.w)
      return
    }
    if (ev.type !== 'button' || !ev.down) return
    const ph = phaseRef.current
    if ((ev.name === 'trigger' || ev.name === 'bumper') && ph === 'level') {
      cal.current = { side: ev.side, ...levelNow(motion.current[ev.side]) }
      setJoySide(ev.side)
      sfx.click()
      rumblePattern(ev.side, [[200, 400, 0.5, 40]])
      go('forward')
    } else if ((ev.name === 'trigger' || ev.name === 'bumper') && ph === 'won') {
      nextLevel()
    } else if ((ev.name === 'north' || ev.name === 'stick') && cal.current?.forward && ev.side === cal.current.side) {
      // re-level where it is now, keeping "forward" but squared up to the new level
      const n = norm(motion.current[ev.side].grav)
      const f = cal.current.forward
      const d = dot(f, n)
      cal.current.level = n
      cal.current.forward = norm([f[0] - n[0] * d, f[1] - n[1] * d, f[2] - n[2] * d])
      sfx.click()
    }
  })

  useKeys((e, down) => {
    if (down && e.key === 'Escape') { onExit(); return }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      if (down) keys.current.add(e.key)
      else keys.current.delete(e.key)
    }
    if (down && (e.key === 'Enter' || e.key === ' ') && phaseRef.current === 'won') nextLevel()
  })

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const unfit = fitCanvas(cv, ctx, W, H)
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    let lastHit = 0

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!game.current) game.current = loadLevel(0)
      const L = game.current
      const c = cal.current
      const side = c?.side

      // tilt: the Joy-Con once it knows "forward"; arrow keys always work too
      let tx = 0, ty = 0
      if (c) {
        const joyTilt = tilt(motion.current[side], c)
        if (phaseRef.current === 'forward' && c.forward) { sfx.ready(); go('play') }
        if (joyTilt.x != null) { tx = joyTilt.x; ty = joyTilt.y }
      }
      const k = keys.current
      if (k.has('ArrowLeft')) tx -= KEY_TILT
      if (k.has('ArrowRight')) tx += KEY_TILT
      if (k.has('ArrowUp')) ty -= KEY_TILT
      if (k.has('ArrowDown')) ty += KEY_TILT
      tx = Math.max(-MAX_TILT, Math.min(MAX_TILT, tx))
      ty = Math.max(-MAX_TILT, Math.min(MAX_TILT, ty))

      if (L && phaseRef.current === 'play') {
        for (const e of step(L, tx, ty, dt)) {
          if (e.type === 'wall' && now - lastHit > 60) {
            lastHit = now
            sfx.clack(e.force)
            if (side) rumblePattern(side, [[90, 180, 0.3 + 0.7 * e.force, 30]])
          } else if (e.type === 'fall') {
            sfx.fall()
            if (side) rumblePattern(side, [[160, 320, 0.9, 70], [110, 220, 0.6, 90], [70, 140, 0.35, 140]])
          } else if (e.type === 'gem') {
            sfx.gem()
            if (side) rumblePattern(side, [[320, 640, 0.5, 30]])
          } else if (e.type === 'win') {
            sfx.goal()
            if (side) rumblePattern(side, [[160, 320, 0.8, 60], [160, 320, 0, 60], [200, 400, 0.8, 60], [200, 400, 0, 60], [260, 520, 0.9, 140]])
            const ms = Math.round(L.t * 1000)
            const prev = loadBest(BEST_KEY)
            const record = !prev[L.index] || ms < prev[L.index]
            if (record) { prev[L.index] = ms; saveBest(BEST_KEY, prev); setBest(prev) }
            setResult({ ms, falls: L.falls, gems: L.gems.filter((g) => g.got).length, total: L.gems.length, record })
            go('won')
          }
        }
        // the roll you feel: rumble rises with speed, and wobbles at the rim of a hole
        if (side) {
          if (L.state === 'play' && (L.speed > 25 || L.near > 0.1)) {
            const amp = Math.min(0.45, L.speed / 1100) + L.near * 0.3 * (0.5 + 0.5 * Math.sin(now / 35))
            rumbleHum(side, 45 + L.speed * 0.08, 90 + L.speed * 0.2, amp)
          } else {
            rumbleStop(side)
          }
        }
      } else if (side) {
        rumbleStop(side)
      }

      if (L) {
        render(ctx, L, now)
        drawBubble(ctx, tx, ty)
        if (now - hudAt > 100) {
          hudAt = now
          setHud({ t: L.t, falls: L.falls, gems: L.gems.filter((g) => g.got).length, total: L.gems.length })
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      unfit()
      if (cal.current) rumbleStop(cal.current.side)
    }
  }, [])

  const lv = LEVELS[level]
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2a1a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 48, userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div style={topBar}>
        <button onClick={onExit} style={btn}>← Carnival</button>
        <button onClick={() => goLevel(level - 1)} style={btn}>◀</button>
        <span>{level + 1}/{LEVELS.length} · {lv.name}</span>
        <button onClick={nextLevel} style={btn}>▶</button>
        <span style={{ marginLeft: 'auto' }}>⏱ {hud.t.toFixed(1)}s</span>
        <span>🕳 {hud.falls}</span>
        <span>💎 {hud.gems}/{hud.total}</span>
        {best[level] != null && <span>🏆 {(best[level] / 1000).toFixed(1)}s</span>}
        {joySide && <span style={{ fontSize: 12, opacity: 0.8 }}>X / ↑ re-levels</span>}
      </div>

      {phase === 'level' && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 44 }}>🎱</div>
            <h2 style={{ margin: '6px 0' }}>Hold your Joy-Con flat, like a tray</h2>
            <p>Buttons facing up, nice and still. Then press its <b>trigger</b> (ZL or ZR on the back).</p>
            <button onClick={() => go('play')} style={btn}>Use the arrow keys instead</button>
          </div>
        </div>
      )}
      {phase === 'forward' && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 44 }}>⬆️</div>
            <h2 style={{ margin: '6px 0' }}>Now tip it toward the screen</h2>
            <p>Lower the far edge, like you're pouring the marble toward the TV.</p>
          </div>
        </div>
      )}
      {phase === 'won' && result && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 48 }}>🏁</div>
            <h2 style={{ margin: '4px 0' }}>{lv.name}: done!</h2>
            <div style={{ fontSize: 34, fontWeight: 900 }}>{(result.ms / 1000).toFixed(1)} s</div>
            {result.record && <div style={{ color: '#15803d', fontWeight: 900 }}>🏆 New best time!</div>}
            <p>🕳 {result.falls} fall{result.falls === 1 ? '' : 's'} · 💎 {result.gems}/{result.total} gems</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={nextLevel} style={bigBtn}>Next maze ▶</button>
              <button onClick={() => goLevel(level)} style={{ ...btn, fontSize: 16 }}>Again</button>
            </div>
            <p style={{ fontSize: 13, color: INK, opacity: 0.7, marginBottom: 0 }}>or pull the trigger for the next maze</p>
          </div>
        </div>
      )}
    </div>
  )
}

// A spirit level in the corner, so you can see how the board is leaning.
function drawBubble(ctx, tx, ty) {
  const cx = W - 46, cy = 46, r = 30
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#2a1a3e'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, 8, 0, Math.PI * 2)
  ctx.stroke()
  const s = (r - 8) / MAX_TILT
  ctx.fillStyle = '#3bb4ff'
  ctx.beginPath()
  ctx.arc(cx + tx * s, cy + ty * s, 7, 0, Math.PI * 2)
  ctx.fill()
}
