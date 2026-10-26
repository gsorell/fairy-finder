import { useEffect, useRef, useState } from 'react'
import { pads, rumblePattern } from '../joycon/hid.js'
import { createMotion, feedMotion, norm, dot } from '../joycon/motion.js'
import { loadRoster } from './roster.js'
import { sfx, say, hush } from './audio.js'
import { useHid, useKeys, INK, BLUE, RED, btn, bigBtn, topBar } from './common.js'

const TO_WIN = 3
const FOUL_DEG = 35      // raised this far before FIRE! = too soon
const AIMED_DEG = 50     // raised at least this far for a shot to count
const SIDES = ['L', 'R']
const KEY_SIDE = { a: 'L', l: 'R' }

const HEARTBEAT = [[80, 160, 0.6, 60], [80, 160, 0, 90], [70, 140, 0.45, 60]]
const READY = [[200, 400, 0.5, 30]]
const RECOIL = [[60, 120, 1.0, 50], [100, 200, 0.5, 60]]
const SAD = [[60, 120, 0.8, 300]]
const CHEER = [[160, 320, 0.8, 60], [160, 320, 0, 60], [200, 400, 0.8, 60], [200, 400, 0, 60], [260, 520, 0.9, 140]]

function fresh(phase, score = { L: 0, R: 0 }) {
  return { phase, ready: { L: null, R: null }, shots: { L: null, R: null }, foul: null, winner: null, score, fireAt: 0, waitUntil: 0, nextBeat: 0, beatGap: 700 }
}

const angleBetween = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI

// Two-player reaction duel. Joy-Cons point at the floor; on FIRE! raise and pull the
// trigger. Left Joy-Con (or A key) is player 1, right Joy-Con (or L key) player 2.
export default function QuickDraw({ onExit }) {
  const [roster] = useState(loadRoster)
  const [who, setWho] = useState(() => ({ L: roster[0]?.id, R: roster[1]?.id ?? roster[0]?.id }))
  const [view, setView] = useState(() => fresh('setup'))
  const [raise, setRaise] = useState({ L: 0, R: 0 })
  const motion = useRef({ L: createMotion(), R: createMotion() })
  const g = useRef(view)
  const sync = () => setView({ ...g.current, ready: { ...g.current.ready }, shots: { ...g.current.shots }, score: { ...g.current.score } })

  // handlers and the countdown loop outlive renders, so they read the pick through a ref
  const whoRef = useRef(who)
  useEffect(() => { whoRef.current = who }, [who])
  const playerOf = (picks, side) => roster.find((p) => p.id === picks[side]) ?? { name: side === 'L' ? 'Player 1' : 'Player 2', emoji: side === 'L' ? '🔵' : '🔴' }
  const player = (side) => playerOf(whoRef.current, side)
  const shownPlayer = (side) => playerOf(who, side)

  function newRound(score) {
    g.current = fresh('holster', score)
    sync()
    say('Point at the floor and pull the trigger when you are ready.')
  }

  function ready(side, holster) {
    const s = g.current
    if (s.phase !== 'holster' || s.ready[side]) return
    s.ready[side] = holster
    sfx.ready()
    rumblePattern(side, READY)
    if (s.ready.L && s.ready.R) {
      s.phase = 'wait'
      s.waitUntil = performance.now() + 2000 + Math.random() * 3000
      s.nextBeat = 0
      hush()
    }
    sync()
  }

  function endRound(winner, foul) {
    const s = g.current
    s.winner = winner
    s.foul = foul
    s.score[winner]++
    s.phase = s.score[winner] >= TO_WIN ? 'match' : 'result'
    const loser = winner === 'L' ? 'R' : 'L'
    if (foul) { sfx.foul(); rumblePattern(loser, SAD) }
    if (s.phase === 'match') {
      sfx.win()
      rumblePattern(winner, CHEER)
      say(`${player(winner).name} wins the match!`)
    }
    sync()
  }

  // A trigger pull (or key press). raisedDeg is null for the keyboard: a key counts as aimed.
  function pull(side, t, raisedDeg) {
    const s = g.current
    if (s.phase === 'wait') {
      endRound(side === 'L' ? 'R' : 'L', side)
      return
    }
    if (s.phase !== 'fire' || s.shots[side] != null) return
    if (raisedDeg != null && raisedDeg < AIMED_DEG) return   // still pointing down: not a shot
    s.shots[side] = Math.max(0, Math.round(t - s.fireAt))
    sfx.pop()
    rumblePattern(side, RECOIL)
    if (!s.winner) {
      s.winner = side
      s.score[side]++
      s.phase = s.score[side] >= TO_WIN ? 'match' : 'fire'
      if (s.phase === 'match') { sfx.win(); rumblePattern(side, CHEER); say(`${player(side).name} wins the match!`) }
    }
    sync()
  }

  function continueOn() {
    const s = g.current
    if (s.phase === 'result' || (s.phase === 'fire' && s.winner)) newRound(s.score)
    else if (s.phase === 'match') newRound({ L: 0, R: 0 })
  }

  useHid((ev) => {
    if (ev.type === 'imu') {
      feedMotion(motion.current[ev.side], ev.a, ev.w)
      return
    }
    if (ev.type !== 'button' || !ev.down || (ev.name !== 'trigger' && ev.name !== 'bumper')) return
    const s = g.current
    const m = motion.current[ev.side]
    if (s.phase === 'holster') ready(ev.side, norm(m.grav))
    else if (s.phase === 'wait' || s.phase === 'fire') {
      const deg = s.ready[ev.side] && Array.isArray(s.ready[ev.side]) ? angleBetween(norm(m.grav), s.ready[ev.side]) : null
      if (s.phase === 'fire' && s.winner && s.shots[ev.side] != null) continueOn()
      else pull(ev.side, ev.t, deg)
    } else if (s.phase === 'result' || s.phase === 'match') continueOn()
  })

  useKeys((e, down) => {
    if (!down || e.repeat) return
    if (e.key === 'Escape') { hush(); onExit(); return }
    const side = KEY_SIDE[e.key.toLowerCase()]
    const s = g.current
    if (side) {
      if (s.phase === 'holster') ready(side, true)   // a key "holsters" without a direction
      else if (s.phase === 'wait' || s.phase === 'fire') {
        if (s.phase === 'fire' && s.winner && s.shots[side] != null) continueOn()
        else pull(side, e.timeStamp, null)
      } else if (s.phase === 'result' || s.phase === 'match') continueOn()
    } else if ((e.key === 'Enter' || e.key === ' ') && g.current.phase !== 'setup') continueOn()
  })

  const endRoundRef = useRef(endRound)
  useEffect(() => { endRoundRef.current = endRound })

  // the wait: heartbeat, foul watch, then FIRE!
  useEffect(() => {
    let raf = 0
    let shown = 0
    function frame(now) {
      const s = g.current
      const deg = {}
      for (const side of SIDES) {
        const h = s.ready[side]
        deg[side] = Array.isArray(h) && motion.current[side].grav ? angleBetween(norm(motion.current[side].grav), h) : 0
      }
      if (s.phase === 'wait') {
        if (now >= s.nextBeat) {
          s.nextBeat = now + s.beatGap
          s.beatGap = Math.max(380, s.beatGap * 0.88)   // the heart races as FIRE! nears
          sfx.heartbeat()
          for (const side of SIDES) rumblePattern(side, HEARTBEAT)
        }
        const early = SIDES.find((side) => deg[side] > FOUL_DEG)
        if (early) endRoundRef.current(early === 'L' ? 'R' : 'L', early)
        else if (now >= s.waitUntil) {
          s.phase = 'fire'
          s.fireAt = now
          sfx.fire()
          sync()
        }
      }
      if (now - shown > 80) {
        shown = now
        setRaise(deg)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); hush() }
  }, [])

  const v = view
  const both = !!(pads.L && pads.R)
  const banner = {
    setup: '', holster: 'Point at the floor… pull the trigger when ready', wait: 'Steady…',
    fire: v.winner ? `${shownPlayer(v.winner).name} wins the round!` : 'FIRE! 🎉', result: v.foul ? `${shownPlayer(v.foul).name} moved too soon!` : '', match: `🏆 ${shownPlayer(v.winner ?? 'L').name} wins the match!`,
  }[v.phase]

  return (
    <div style={{ position: 'fixed', inset: 0, background: v.phase === 'fire' && !v.winner ? '#ffd23f' : '#f6e7c8', transition: 'background .1s', userSelect: 'none', paddingTop: 48, display: 'flex', flexDirection: 'column' }}>
      <div style={topBar}>
        <button onClick={() => { hush(); onExit() }} style={btn}>← Carnival</button>
        <span style={{ color: INK }}>🤠 Quick Draw</span>
        {v.phase !== 'setup' && <span style={{ marginLeft: 'auto', color: INK, fontSize: 22 }}>{v.score.L} : {v.score.R}</span>}
      </div>

      {v.phase === 'setup' ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: INK, padding: 16 }}>
          <div style={{ fontSize: 60 }}>🤠🎉</div>
          <h1 style={{ margin: '0 0 6px' }}>Quick Draw</h1>
          <p style={{ maxWidth: 520, margin: '0 auto 16px' }}>
            Point your Joy-Con at the floor. When the screen flashes <b>FIRE!</b>, raise it and pull the trigger to blast your
            confetti cannon. Fastest wins. Move too soon and you lose the round! First to {TO_WIN}.
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            {SIDES.map((side) => (
              <label key={side} style={{ border: `4px solid ${side === 'L' ? BLUE : RED}`, borderRadius: 16, padding: 12, background: '#fff', fontWeight: 800 }}>
                {side === 'L' ? 'Left Joy-Con (or A key)' : 'Right Joy-Con (or L key)'}
                <div>
                  <select value={who[side]} onChange={(e) => setWho((w) => ({ ...w, [side]: e.target.value }))} style={{ fontSize: 18, marginTop: 6 }}>
                    {roster.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
                  </select>
                </div>
              </label>
            ))}
          </div>
          {!both && <p style={{ fontSize: 13 }}>Only one Joy-Con connected: the other player can use the keyboard.</p>}
          <button onClick={() => newRound({ L: 0, R: 0 })} style={{ ...bigBtn, marginTop: 18 }}>Duel! ▶</button>
        </div>
      ) : (
        <>
          <div style={{ textAlign: 'center', fontSize: v.phase === 'fire' && !v.winner ? 'clamp(60px, 14vw, 150px)' : 'clamp(24px, 4vw, 40px)', fontWeight: 900, color: INK, minHeight: 60, marginTop: 10 }}>
            {banner}
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 }}>
            {SIDES.map((side) => (
              <Duelist key={side} side={side} p={shownPlayer(side)} v={v} deg={raise[side]} />
            ))}
          </div>
          {(v.phase === 'result' || v.phase === 'match' || (v.phase === 'fire' && v.winner)) && (
            <div style={{ textAlign: 'center', paddingBottom: 18 }}>
              <button onClick={continueOn} style={bigBtn}>{v.phase === 'match' ? 'Rematch' : 'Next round'} ▶</button>
              <div style={{ fontSize: 12, color: INK, opacity: 0.7, marginTop: 4 }}>or pull a trigger</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Duelist({ side, p, v, deg }) {
  const color = side === 'L' ? BLUE : RED
  const shot = v.shots[side]
  const won = v.winner === side
  let status = ''
  if (v.phase === 'holster') status = v.ready[side] ? 'Ready ✓' : 'Point down & pull the trigger'
  else if (v.foul === side) status = 'Too soon! 😱'
  else if (shot != null) status = `${shot} ms`
  else if (v.phase === 'fire' && v.winner) status = 'Too slow!'
  const aimed = v.phase === 'fire' && !v.winner && deg >= AIMED_DEG

  return (
    <div style={{
      border: `6px solid ${color}`, borderRadius: 24, background: won ? color : '#fff', color: won ? '#fff' : INK,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 'clamp(60px, 12vw, 130px)', lineHeight: 1, transform: side === 'R' ? 'scaleX(-1)' : 'none' }}>{won ? '🎉' : p.emoji}</div>
      <div style={{ fontSize: 26, fontWeight: 900 }}>{p.name}</div>
      <div style={{ fontSize: 30, fontWeight: 900, minHeight: 40 }}>{status}</div>
      {/* how far the arm is raised from the holster, with the "aimed" line */}
      <div style={{ position: 'absolute', left: 12, top: 12, bottom: 12, width: 14, borderRadius: 7, background: '#0001', border: `2px solid ${color}` }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.min(100, (deg / 90) * 100)}%`, background: aimed ? '#3ddc84' : color, borderRadius: 5 }} />
        <div style={{ position: 'absolute', left: -4, right: -4, bottom: `${(AIMED_DEG / 90) * 100}%`, height: 2, background: INK }} />
      </div>
    </div>
  )
}
