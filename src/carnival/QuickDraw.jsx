import { useEffect, useMemo, useRef, useState } from 'react'
import { pads, rumblePattern } from '../joycon/hid.js'
import {
  createMotion, feedMotion, createPointer, learnPointer, centerPointer, pointAt, stepPointer, elevation,
} from '../joycon/motion.js'
import { loadRoster, loadBest, saveBest } from './roster.js'
import { sfx, say, hush } from './audio.js'
import { useHid, useKeys, fitCanvas, INK, btn, bigBtn, overlay, panel, topBar } from './common.js'
import {
  W, H, SIDE_COLOR, READY_STAR, DUEL_TARGET_R, randomDuelTarget, renderDuelScene, drawCrosshair, bigText,
  createFx, stepFx, drawFx, burst, floater, puff,
  GALLERY_MS, createGallery, stepGallery, shootGallery, renderGallery, itemPos,
} from './shooting.js'

const ASPECT = W / H
const HEARTBEAT = [[80, 160, 0.6, 60], [80, 160, 0, 90], [70, 140, 0.45, 60]]
const READY = [[200, 400, 0.5, 30]]
const RECOIL = [[60, 120, 1.0, 45], [100, 200, 0.45, 50]]
const HIT = [[300, 600, 0.8, 30]]
const SAD = [[60, 120, 0.8, 300]]
const CHEER = [[160, 320, 0.8, 60], [160, 320, 0, 60], [200, 400, 0.8, 60], [200, 400, 0, 60], [260, 520, 0.9, 140]]
const SPARKLE = [[400, 800, 0.6, 25], [400, 800, 0, 30], [500, 1000, 0.6, 25]]

const MODES = {
  duel: { emoji: '🤠', name: 'Duel', who: '2 players', blurb: 'Aim at your star, point at the floor, feel the heartbeat… FIRE! First to hit the target wins the round. First to 3.' },
  solo: { emoji: '⏱️', name: 'Solo Draw', who: '1 player', blurb: 'Same quick draw, just you and the clock. Five rounds: how fast is your average?' },
  gallery: { emoji: '🎯', name: 'Target Gallery', who: '1–2 players', blurb: "60 seconds at the carnival booth. Targets, ducks and gold stars pop up: hit them before they hide. Don't shoot the bunnies!" },
}
const STEP_TEXT = {
  idle: 'Pull the trigger to join',
  floor: 'Point at the floor and hold still…',
  turn: 'Raise it to the screen, then point at the right side of the room ➡️',
  center: 'Aim at the ✛ in the middle and pull the trigger',
  ready: 'Ready ✓',
}

// Quick Draw: three shooting modes, all aimed with on-screen crosshairs. Each Joy-Con is
// a player (left = blue, right = red); the mouse stands in when there are no Joy-Cons.
export default function QuickDraw({ onExit }) {
  const [roster] = useState(loadRoster)
  const [who, setWho] = useState(() => ({ L: roster[0]?.id, R: roster[1]?.id ?? roster[0]?.id }))
  const [screen, setScreen] = useState('menu')   // menu | setup | play
  const [mode, setMode] = useState('duel')
  const [cal, setCal] = useState({ L: 'idle', R: 'idle' })
  const [order, setOrder] = useState([])           // sides in the order they became ready
  const [useMouse, setUseMouse] = useState(false)
  const calRef = useRef(cal)
  const screenRef = useRef(screen)
  useEffect(() => { screenRef.current = screen }, [screen])
  const motion = useRef({ L: createMotion(), R: createMotion() })
  const pointers = useRef({ L: createPointer(), R: createPointer(), M: { x: 0.5, y: 0.5 } })

  function setStep(side, step) {
    calRef.current = { ...calRef.current, [side]: step }
    setCal(calRef.current)
    if (step === 'ready') setOrder((o) => [...o.filter((s) => s !== side), side])
    if (step === 'idle') setOrder((o) => o.filter((s) => s !== side))
  }

  useHid((ev) => {
    if (ev.type === 'imu') {
      const m = motion.current[ev.side]
      const p = pointers.current[ev.side]
      feedMotion(m, ev.a, ev.w)
      const st = calRef.current[ev.side]
      if (st === 'floor' && learnPointer(p, m, 'floor')) { sfx.ready(); rumblePattern(ev.side, READY); setStep(ev.side, 'turn') }
      else if (st === 'turn' && learnPointer(p, m, 'turn')) { sfx.ready(); rumblePattern(ev.side, READY); setStep(ev.side, 'center') }
      else if (st === 'center' || st === 'ready') stepPointer(p, m, ASPECT)
      return
    }
    if (screenRef.current !== 'setup' || ev.type !== 'button' || !ev.down) return
    if (ev.name !== 'trigger' && ev.name !== 'bumper') return
    const st = calRef.current[ev.side]
    if (st === 'idle') {
      pointers.current[ev.side] = createPointer()
      sfx.click()
      setStep(ev.side, 'floor')
    } else if (st === 'center') {
      centerPointer(pointers.current[ev.side], motion.current[ev.side])
      sfx.goal()
      rumblePattern(ev.side, CHEER)
      setStep(ev.side, 'ready')
    }
  })

  useKeys((e, down) => {
    if (down && e.key === 'Escape') {
      hush()
      if (screenRef.current === 'menu') onExit()
      else setScreen('menu')
    }
  })

  // stable across renders, so a running game never restarts
  const sides = useMemo(() => {
    const ready = order.filter((s) => cal[s] === 'ready')
    if (useMouse) return ['M']
    if (mode === 'duel') return ['L', 'R']
    return mode === 'solo' ? ready.slice(0, 1) : ready
  }, [useMouse, mode, order, cal])
  const players = useMemo(() => Object.fromEntries(['L', 'R', 'M'].map((s) => {
    const id = who[s === 'M' ? 'L' : s]
    return [s, roster.find((p) => p.id === id) ?? { id: s, name: s === 'R' ? 'Player 2' : 'Player 1', emoji: s === 'R' ? '🔴' : '🔵' }]
  })), [who, roster])
  const canStart = useMouse || (mode === 'duel' ? cal.L === 'ready' && cal.R === 'ready' : sides.length > 0)
  const joy = !!(pads.L || pads.R)

  if (screen === 'play') {
    const back = () => { hush(); setScreen('menu') }
    if (mode === 'gallery') return <GalleryScreen sides={sides} players={players} pointers={pointers} onBack={back} />
    return <DuelScreen mode={mode} sides={sides} players={players} pointers={pointers} motion={motion} onBack={back} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'linear-gradient(180deg, #ffb26b, #ffe0a3)', color: INK, paddingTop: 48 }}>
      <div style={topBar}>
        <button onClick={() => { hush(); onExit() }} style={btn}>← Carnival</button>
        <span style={{ color: INK, fontSize: 18 }}>🤠 QUICK DRAW</span>
      </div>

      {screen === 'menu' && (
        <div style={{ maxWidth: 980, margin: '0 auto', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 10 }}>
            {Object.entries(MODES).map(([id, m]) => {
              const blocked = id === 'duel' && !(pads.L && pads.R)
              return (
                <button key={id} disabled={blocked} onClick={() => { setMode(id); setUseMouse(!joy); setScreen('setup') }} style={{
                  textAlign: 'left', background: '#fff8ec', border: `4px solid ${INK}`, borderRadius: 20, padding: 18, cursor: blocked ? 'not-allowed' : 'pointer',
                  boxShadow: `0 6px 0 ${INK}`, fontFamily: 'inherit', color: INK, opacity: blocked ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: 48, lineHeight: 1 }}>{m.emoji}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{m.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.7 }}>{m.who}</div>
                  <div style={{ fontSize: 15, marginTop: 6 }}>{m.blurb}</div>
                  {blocked && <div style={{ fontSize: 13, fontWeight: 800, color: '#b45309', marginTop: 6 }}>Needs both Joy-Cons connected</div>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
            {['L', 'R'].map((side) => (
              <label key={side} style={{ border: `4px solid ${SIDE_COLOR[side]}`, borderRadius: 16, padding: 10, background: '#fff', fontWeight: 800 }}>
                {side === 'L' ? 'Left Joy-Con' : 'Right Joy-Con'}{' '}
                <select value={who[side]} onChange={(e) => setWho((w) => ({ ...w, [side]: e.target.value }))} style={{ fontSize: 16 }}>
                  {roster.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.75 }}>
            {joy ? 'Each Joy-Con is a player: hold it like a pointer, trigger (ZL / ZR) to shoot.' : 'No Joy-Cons connected: Solo and Gallery work with the mouse.'}
          </p>
        </div>
      )}

      {screen === 'setup' && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, textAlign: 'center' }}>
          <h2 style={{ margin: '8px 0' }}>{MODES[mode].emoji} {MODES[mode].name}: wake up the wands</h2>
          {useMouse ? (
            <p>Playing with the mouse: aim with it and click to shoot.</p>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                {mode === 'duel' ? 'Both players pull' : mode === 'gallery' ? 'One or both players pull' : 'Pick up a Joy-Con and pull'} the trigger to join, then follow the steps.
                {' '}Already set up? Jump straight in.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {['L', 'R'].map((side) => (
                  <div key={side} style={{
                    border: `5px solid ${SIDE_COLOR[side]}`, borderRadius: 18, padding: 14, opacity: pads[side] ? 1 : 0.45,
                    background: cal[side] === 'ready' ? SIDE_COLOR[side] : '#fff', color: cal[side] === 'ready' ? '#fff' : INK,
                  }}>
                    <div style={{ fontSize: 40 }}>{players[side].emoji}</div>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>{players[side].name}</div>
                    <div style={{ fontWeight: 700, minHeight: 44 }}>{pads[side] ? STEP_TEXT[cal[side]] : `${side === 'L' ? 'Left' : 'Right'} Joy-Con not connected`}</div>
                    <Steps step={cal[side]} />
                    {cal[side] !== 'idle' && <button onClick={() => setStep(side, 'idle')} style={{ ...btn, fontSize: 12, marginTop: 6 }}>Start over</button>}
                  </div>
                ))}
              </div>
              {(cal.L === 'center' || cal.R === 'center') && <div style={{ fontSize: 60, fontWeight: 900, marginTop: 8 }}>✛</div>}
            </>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button disabled={!canStart} onClick={() => { sfx.ready(); setScreen('play') }} style={{ ...bigBtn, opacity: canStart ? 1 : 0.5 }}>
              Start {MODES[mode].name} ▶
            </button>
            <button onClick={() => setScreen('menu')} style={btn}>Back</button>
            {!useMouse && mode !== 'duel' && <button onClick={() => setUseMouse(true)} style={btn}>Use the mouse</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function Steps({ step }) {
  const steps = ['idle', 'floor', 'turn', 'center', 'ready']
  const at = steps.indexOf(step)
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
      {steps.slice(1).map((s, i) => (
        <div key={s} style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${INK}`, background: i + 1 < at ? '#3ddc84' : i + 1 === at ? '#ffd23f' : '#ddd' }} />
      ))}
    </div>
  )
}

// Mouse play: the pointer follows the cursor over the canvas and a click is a trigger pull.
function useMousePointer(canvasRef, pointers, onShoot, enabled) {
  const shoot = useRef(onShoot)
  useEffect(() => { shoot.current = onShoot })
  useEffect(() => {
    if (!enabled) return
    const cv = canvasRef.current
    const move = (e) => {
      const r = cv.getBoundingClientRect()
      pointers.current.M.x = (e.clientX - r.left) / r.width
      pointers.current.M.y = (e.clientY - r.top) / r.height
    }
    const down = (e) => { move(e); shoot.current('M', performance.now()) }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerdown', down)
    return () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerdown', down) }
  }, [canvasRef, pointers, enabled])
}

// ---------- Duel and Solo Draw ----------
const TO_WIN = 3
const SOLO_ROUNDS = 5
const RELOAD_MS = 350
const FIRE_TIMEOUT = 6000

function DuelScreen({ mode, sides, players, pointers, motion, onBack }) {
  const canvasRef = useRef(null)
  const [view, setView] = useState({ phase: 'aim', score: {}, times: [], winner: null, roundMsg: '' })
  const solo = mode === 'solo'
  const d = useRef(null)
  const latest = useRef({ players })
  useEffect(() => { latest.current = { players } })

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const unfit = fitCanvas(cv, ctx, W, H)
    const playerName = (side) => latest.current.players[side]?.name ?? side
    const S = {
      phase: 'aim', aimed: {}, score: Object.fromEntries(sides.map((s) => [s, 0])), times: [], round: 0,
      holsterSince: 0, waitUntil: 0, nextBeat: 0, beatGap: 700, fireAt: 0, target: null,
      reload: {}, shots: {}, winner: null, flash: {}, fx: createFx(), msg: '',
    }
    d.current = S
    if (import.meta.env.DEV) window.__quickdraw = { S, pointers }   // lets a headless test aim
    const sync = () => setView({ phase: S.phase, score: { ...S.score }, times: [...S.times], winner: S.winner, roundMsg: S.msg })

    // how far below the screen's middle the wand points, in degrees (the mouse is always "holstered")
    const drop = (side) => (side === 'M' ? 90 : (pointers.current[side].elev0 ?? 0) - elevation(pointers.current[side], motion.current[side]))
    const holstered = (side) => drop(side) > 35
    const raised = (side) => drop(side) < 28   // well up off the floor: a draw has started

    function startRound() {
      S.phase = 'aim'
      S.aimed = {}
      S.shots = {}
      S.reload = {}
      S.target = null
      S.winner = null
      S.msg = ''
      if (sides.includes('M')) S.aimed.M = true
      if (sides.every((s) => S.aimed[s])) S.phase = 'holster'
      sync()
      if (S.round === 0 && S.times.length === 0) say(sides.includes('M') ? 'Get ready.' : 'Aim at your star and pull the trigger.')
    }

    function endRound(winner, msg) {
      S.winner = winner
      S.msg = msg
      if (solo) {
        S.round++
        S.phase = S.round >= SOLO_ROUNDS ? 'match' : 'result'
        if (S.phase === 'match') { sfx.win(); say('Nice shooting!') }
      } else {
        if (winner) S.score[winner]++
        S.phase = winner && S.score[winner] >= TO_WIN ? 'match' : 'result'
        if (S.phase === 'match') {
          sfx.win()
          rumblePattern(winner, CHEER)
          say(`${playerName(winner)} wins the duel!`)
        }
      }
      sync()
    }

    function foul(side) {
      sfx.foul()
      rumblePattern(side, SAD)
      if (solo) { S.times.push(null); endRound(null, 'Too soon! 😱') }
      else endRound(sides.find((s) => s !== side), `${playerName(side)} moved too soon!`)
    }

    function trigger(side, t) {
      if (!sides.includes(side)) return
      const p = pointers.current[side]
      if (S.phase === 'aim') {
        if (S.aimed[side]) return
        // aiming at your star and pulling re-centres your crosshair on it
        const star = READY_STAR[sides.length > 1 ? side : 'M']
        pointAt(p, motion.current[side], star.x, star.y, ASPECT)
        S.aimed[side] = true
        sfx.ready()
        rumblePattern(side, READY)
        if (sides.every((s) => S.aimed[s])) { S.phase = 'holster'; S.holsterSince = 0 }
        sync()
      } else if (S.phase === 'wait') {
        foul(side)
      } else if (S.phase === 'fire') {
        if (S.shots[side] != null || (S.reload[side] ?? 0) > t) return
        sfx.shot()
        rumblePattern(side, RECOIL)
        S.flash[side] = 1
        const dx = p.x * W - S.target.x, dy = p.y * H - S.target.y
        if (Math.hypot(dx, dy) > DUEL_TARGET_R + 6) {
          puff(S.fx, p.x * W, p.y * H)
          S.reload[side] = t + RELOAD_MS
          return
        }
        const ms = Math.max(0, Math.round(t - S.fireAt))
        S.shots[side] = ms
        sfx.clonk()
        rumblePattern(side, HIT)
        burst(S.fx, S.target.x, S.target.y, ['#ff5a5f', '#ffffff', '#ffd23f', SIDE_COLOR[side]], 40, 420)
        floater(S.fx, S.target.x, S.target.y - 70, `${ms} ms`, SIDE_COLOR[side])
        if (solo) { S.times.push(ms); endRound(side, `${ms} ms`) }
        else if (!S.winner) endRound(side, `${playerName(side)} wins the round!`)
      } else if (S.phase === 'result') {
        startRound()
      } else if (S.phase === 'match') {
        S.score = Object.fromEntries(sides.map((s) => [s, 0]))
        S.times = []
        S.round = 0
        startRound()
      }
    }
    S.trigger = trigger

    let raf = 0
    let last = performance.now()
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      stepFx(S.fx, dt)
      for (const s of sides) S.flash[s] = Math.max(0, (S.flash[s] ?? 0) - dt * 5)

      if (S.phase === 'holster') {
        if (sides.every(holstered)) {
          S.holsterSince ||= now
          if (now - S.holsterSince > 400) {
            S.phase = 'wait'
            S.waitUntil = now + 2000 + Math.random() * 3000
            S.nextBeat = 0
            S.beatGap = 700
            sync()
          }
        } else S.holsterSince = 0
      } else if (S.phase === 'wait') {
        if (now >= S.nextBeat) {
          S.nextBeat = now + S.beatGap
          S.beatGap = Math.max(380, S.beatGap * 0.88)   // the heart races as FIRE! nears
          sfx.heartbeat()
          for (const s of sides) rumblePattern(s, HEARTBEAT)
        }
        const early = sides.find(raised)
        if (early) foul(early)
        else if (now >= S.waitUntil) {
          S.phase = 'fire'
          S.fireAt = now
          S.target = randomDuelTarget()
          sfx.fire()
          sync()
        }
      } else if (S.phase === 'fire' && now - S.fireAt > FIRE_TIMEOUT && !S.winner) {
        if (solo) S.times.push(null)
        endRound(null, 'Nobody hit it!')
      }

      const stars = S.phase === 'aim'
        ? sides.map((s) => ({ ...READY_STAR[sides.length > 1 ? s : 'M'], color: SIDE_COLOR[s], done: S.aimed[s] }))
        : []
      renderDuelScene(ctx, now, {
        stars,
        target: S.phase === 'fire' || ((S.phase === 'result' || S.phase === 'match') && S.target) ? S.target : null,
        targetAge: (now - S.fireAt) / 1000,
        holster: S.phase === 'holster',
      })
      drawFx(ctx, S.fx)
      if (S.phase === 'wait') bigText(ctx, 'Steady…', '#ffffff', 90, H * 0.3)
      if (S.phase === 'fire' && now - S.fireAt < 700 && !S.winner) bigText(ctx, 'FIRE!', '#ffd23f', 140, H * 0.18)
      for (const s of sides) {
        if (s === 'M' && S.phase !== 'fire') continue
        drawCrosshair(ctx, pointers.current[s].x * W, pointers.current[s].y * H, SIDE_COLOR[s], S.flash[s])
      }
      raf = requestAnimationFrame(frame)
    }
    startRound()
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); unfit(); hush() }
  }, [sides, solo, pointers, motion])

  useHid((ev) => {
    if (ev.type === 'button' && ev.down && (ev.name === 'trigger' || ev.name === 'bumper')) d.current?.trigger?.(ev.side, ev.t)
  })
  useMousePointer(canvasRef, pointers, (side, t) => d.current?.trigger?.(side, t), sides.includes('M'))

  const v = view
  const valid = v.times.filter((t) => t != null)
  const avg = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
  const guide = { aim: sides.includes('M') ? '' : 'Aim at your ⭐ and pull the trigger', holster: 'Now point at the floor…' }[v.phase] ?? ''

  useEffect(() => {
    if (!solo || v.phase !== 'match' || avg == null) return
    const id = latest.current.players[sides[0]].id
    const best = loadBest('carnival-solo-best')
    if (!best[id] || avg < best[id]) { best[id] = avg; saveBest('carnival-solo-best', best) }
  }, [solo, v.phase, avg, sides])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2a1a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 48, userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: sides.includes('M') ? 'none' : 'default' }} />
      <div style={topBar}>
        <button onClick={onBack} style={btn}>← Modes</button>
        <span>{solo ? '⏱️ SOLO DRAW' : '🤠 DUEL'}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          {solo
            ? <span>Round {Math.min(SOLO_ROUNDS, v.times.length + (v.phase === 'result' || v.phase === 'match' ? 0 : 1))}/{SOLO_ROUNDS}{avg != null ? ` · avg ${avg} ms` : ''}</span>
            : sides.map((s) => <span key={s} style={{ color: s === 'R' ? '#ffb4b6' : '#9fdcff' }}>{players[s].emoji} {players[s].name}: {v.score[s] ?? 0}</span>)}
        </span>
      </div>
      {guide && <div style={{ position: 'absolute', top: 60, left: 0, right: 0, textAlign: 'center', fontSize: 26, fontWeight: 900, color: INK, textShadow: '0 2px 0 #fff8', pointerEvents: 'none' }}>{guide}</div>}

      {(v.phase === 'result' || v.phase === 'match') && (
        <div style={{ ...overlay, background: 'rgba(20,10,30,0.25)', alignItems: 'flex-end', paddingBottom: 24, pointerEvents: 'none' }}>
          <div style={{ ...panel, pointerEvents: 'auto' }}>
            {v.phase === 'match' && !solo && <div style={{ fontSize: 46 }}>🏆</div>}
            <h2 style={{ margin: '4px 0' }}>
              {v.phase === 'match' && !solo ? `${players[v.winner]?.name} wins the duel!` : v.roundMsg}
            </h2>
            {solo && v.phase === 'match' && (
              <p style={{ fontSize: 18 }}>
                {v.times.map((t, i) => <span key={i} style={{ marginRight: 10 }}>{t == null ? '✗' : `${t} ms`}</span>)}
                <br /><b>Average: {avg != null ? `${avg} ms` : '–'}</b>
              </p>
            )}
            {!solo && <p style={{ margin: '4px 0 10px' }}>{sides.map((s) => `${players[s].emoji} ${v.score[s] ?? 0}`).join('   ')}</p>}
            <button onClick={() => d.current?.trigger?.(sides[0], performance.now())} style={bigBtn}>
              {v.phase === 'match' ? 'Play again' : 'Next round'} ▶
            </button>
            <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 0 }}>or pull a trigger</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Target Gallery ----------
const SHOT_GAP_MS = 180

function GalleryScreen({ sides, players, pointers, onBack }) {
  const canvasRef = useRef(null)
  const [done, setDone] = useState(null)
  const [hud, setHud] = useState({ left: GALLERY_MS, score: {} })
  const [runId, setRunId] = useState(0)
  const game = useRef(null)
  const lastShot = useRef({})
  const flash = useRef({})

  function shoot(side, t) {
    const g = game.current
    if (!g || !sides.includes(side) || t - (lastShot.current[side] ?? 0) < SHOT_GAP_MS) return
    lastShot.current[side] = t
    if (g.phase !== 'play') return
    const p = pointers.current[side]
    sfx.shot()
    rumblePattern(side, RECOIL)
    flash.current[side] = 1
    for (const ev of shootGallery(g, side, p.x * W, p.y * H)) {
      if (ev === 'hit') { sfx.clonk(); rumblePattern(side, HIT) }
      else if (ev === 'duck') { sfx.quack(); rumblePattern(side, HIT) }
      else if (ev === 'gold') { sfx.gem(); rumblePattern(side, SPARKLE) }
      else if (ev === 'bunny') { sfx.oops(); rumblePattern(side, SAD) }
      else if (ev === 'miss') sfx.miss()
    }
  }

  useHid((ev) => {
    if (ev.type === 'button' && ev.down && (ev.name === 'trigger' || ev.name === 'bumper')) shoot(ev.side, ev.t)
  })
  useMousePointer(canvasRef, pointers, shoot, sides.includes('M'))

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const unfit = fitCanvas(cv, ctx, W, H)
    const g = createGallery(sides)
    game.current = g
    if (import.meta.env.DEV) window.__gallery = { g, pointers, itemPos }   // lets a headless test aim
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    let endTimer = null
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      for (const ev of stepGallery(g, dt)) {
        if (ev === 'count') sfx.tick()
        else if (ev === 'go') sfx.fire()
        else if (ev === 'end' && !endTimer) {
          sfx.foul()
          endTimer = setTimeout(() => { sfx.win(); setDone(JSON.parse(JSON.stringify(g.score))) }, 1600)
        }
      }
      renderGallery(ctx, g, now)
      for (const s of sides) {
        flash.current[s] = Math.max(0, (flash.current[s] ?? 0) - dt * 5)
        drawCrosshair(ctx, pointers.current[s].x * W, pointers.current[s].y * H, SIDE_COLOR[s], flash.current[s])
      }
      if (now - hudAt > 100) {
        hudAt = now
        setHud({ left: Math.max(0, GALLERY_MS - Math.max(0, g.clock)), score: Object.fromEntries(sides.map((s) => [s, { ...g.score[s] }])) })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); clearTimeout(endTimer); unfit() }
  }, [sides, pointers, runId])

  // remember each player's best
  useEffect(() => {
    if (!done) return
    const best = loadBest('carnival-gallery-best')
    let changed = false
    for (const s of sides) {
      const id = players[s].id
      if (!best[id] || done[s].points > best[id]) { best[id] = done[s].points; changed = true }
    }
    if (changed) saveBest('carnival-gallery-best', best)
  }, [done, sides, players])

  const ranked = done ? [...sides].sort((a, b) => done[b].points - done[a].points) : []
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#16204a', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 48, userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: sides.includes('M') ? 'none' : 'default' }} />
      <div style={topBar}>
        <button onClick={onBack} style={btn}>← Modes</button>
        <span>🎯 TARGET GALLERY</span>
        <span style={{ fontSize: 22, marginLeft: 12, color: hud.left < 10000 ? '#ffb4b4' : '#fff' }}>⏱ {Math.ceil(hud.left / 1000)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 18 }}>
          {sides.map((s) => {
            const sc = hud.score[s]
            return (
              <span key={s} style={{ color: s === 'R' ? '#ffb4b6' : '#9fdcff', fontSize: 18 }}>
                {players[s].emoji} {players[s].name}: {sc?.points ?? 0}{sc?.combo >= 5 ? ` 🔥x${Math.min(3, 1 + Math.floor(sc.combo / 5))}` : ''}
              </span>
            )
          })}
        </span>
      </div>
      {done && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 46 }}>🎯</div>
            <h2 style={{ margin: '4px 0 10px' }}>{sides.length > 1 ? `${players[ranked[0]].name} wins!` : 'Final score'}</h2>
            {ranked.map((s, i) => {
              const r = done[s]
              const acc = r.shots ? Math.round((r.hits / r.shots) * 100) : 0
              return (
                <div key={s} style={{ fontSize: 18, margin: '6px 0', fontWeight: i === 0 ? 900 : 600 }}>
                  {sides.length > 1 && i === 0 ? '👑 ' : ''}{players[s].emoji} {players[s].name}: <b style={{ fontSize: 26 }}>{r.points}</b>
                  <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                    🎯 {r.hits} hits · {acc}% accuracy · 🔥 best streak {r.best}{r.bunnies ? ` · 🐰 ${r.bunnies} bunn${r.bunnies === 1 ? 'y' : 'ies'}` : ''}
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
              <button onClick={() => { setDone(null); setRunId((n) => n + 1) }} style={bigBtn}>Play again</button>
              <button onClick={onBack} style={btn}>Modes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
