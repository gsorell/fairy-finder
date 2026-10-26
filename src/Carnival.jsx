import { useEffect, useState } from 'react'
import { hidSupported, connectJoyCon, watchJoyCons, onHid, padStatus, rumblePattern } from './joycon/hid.js'
import { unlockAudio } from './carnival/audio.js'
import MarbleMaze from './carnival/MarbleMaze.jsx'
import SkySketch from './carnival/SkySketch.jsx'
import QuickDraw from './carnival/QuickDraw.jsx'
import { INK, BLUE, RED, btn, bigBtn } from './carnival/common.js'

const BOOTHS = [
  {
    id: 'maze', emoji: '🎱', name: 'Marble Maze', bg: 'linear-gradient(135deg, #b8742f, #7a4a22)',
    blurb: 'Hold a Joy-Con flat like a tray and tilt to roll the marble to the flag. Feel it roll, clack into walls and teeter at the holes.',
    who: '1 player · tilt',
  },
  {
    id: 'sketch', emoji: '✏️', name: 'Sky Sketch', bg: 'linear-gradient(135deg, #a06bff, #ff7ac8)',
    blurb: 'Draw in the air with a Joy-Con wand while everyone else shouts guesses. Feel the pencil scratch as you draw.',
    who: '2+ players · point',
  },
  {
    id: 'draw', emoji: '🤠', name: 'Quick Draw', bg: 'linear-gradient(135deg, #ff9f1c, #ff5a5f)',
    blurb: 'Point at the floor, feel the heartbeat… FIRE! Raise and pull the trigger to blast your confetti cannon first.',
    who: '2 players · one Joy-Con each',
  },
]

export default function Carnival({ onBack }) {
  const [booth, setBooth] = useState(null)
  const [, setTick] = useState(0)

  useEffect(() => { watchJoyCons() }, [])
  useEffect(() => {
    const off = onHid((ev) => { if (ev.type === 'status') setTick((n) => n + 1) })
    const battery = setInterval(() => setTick((n) => n + 1), 3000)
    return () => { off(); clearInterval(battery) }
  }, [])
  useEffect(() => {
    if (booth) return
    const onKey = (e) => { if (e.key === 'Escape') onBack?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [booth, onBack])

  const exit = () => setBooth(null)
  if (booth === 'maze') return <MarbleMaze onExit={exit} />
  if (booth === 'sketch') return <SkySketch onExit={exit} />
  if (booth === 'draw') return <QuickDraw onExit={exit} />

  return (
    <div onClick={unlockAudio} style={{
      position: 'fixed', inset: 0, overflowY: 'auto', color: INK,
      background: 'repeating-linear-gradient(90deg, #fff4dc 0 60px, #ffe1e1 60px 120px)',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <button onClick={onBack} style={{ ...btn, position: 'absolute', top: 12, left: 12 }}>← Arcade</button>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 16px 40px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(40px, 8vw, 78px)', fontWeight: 900, lineHeight: 1, color: '#ff5a5f', textShadow: `4px 4px 0 ${INK}` }}>
            🎪 JOY-CON CARNIVAL
          </div>
          <div style={{ marginTop: 10, fontWeight: 700 }}>Three booths that use every trick a Joy-Con has: tilt, pointing and rumble you can feel.</div>
        </div>

        <section style={{ background: '#fff', border: `3px solid ${INK}`, borderRadius: 18, padding: 16, margin: '24px 0', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 15, letterSpacing: 1 }}>JOY-CONS</b>
          {['L', 'R'].map((side) => {
            const status = padStatus(side)
            const color = side === 'L' ? BLUE : RED
            return (
              <div key={side} style={{ border: `3px solid ${color}`, borderRadius: 12, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <b style={{ color }}>{side === 'L' ? 'Left' : 'Right'}</b>
                <span style={{ fontSize: 13 }}>{status ?? 'not connected'}</span>
                {status && <button onClick={() => rumblePattern(side, [[160, 320, 0.8, 80]])} style={{ ...btn, fontSize: 12, padding: '2px 8px' }}>buzz</button>}
              </div>
            )
          })}
          {hidSupported ? (
            <button onClick={() => connectJoyCon().catch(() => {})} style={{ ...bigBtn, fontSize: 15, padding: '6px 14px' }}>Connect Joy-Con</button>
          ) : (
            <span style={{ fontSize: 13, color: '#b45309' }}>Joy-Cons need Chrome or Edge on a computer. Keys and mouse still work.</span>
          )}
          <span style={{ fontSize: 12, opacity: 0.75, flexBasis: '100%' }}>
            Pair each Joy-Con in your computer's Bluetooth settings first (hold the little sync button), then connect them here one at a time.
            Its lights stop flashing once it's connected.
          </span>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {BOOTHS.map((b) => (
            <button key={b.id} onClick={() => { unlockAudio(); setBooth(b.id) }} style={{
              textAlign: 'left', background: b.bg, color: '#fff', border: `4px solid ${INK}`, borderRadius: 22,
              padding: 20, cursor: 'pointer', boxShadow: `0 8px 0 ${INK}`, fontFamily: 'inherit',
            }}>
              <div style={{ fontSize: 56, lineHeight: 1 }}>{b.emoji}</div>
              <div style={{ fontSize: 30, fontWeight: 900, textShadow: `2px 2px 0 ${INK}88`, marginTop: 8 }}>{b.name}</div>
              <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.9 }}>{b.who}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{b.blurb}</div>
            </button>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.75, marginTop: 24 }}>
          No Joy-Cons? Marble Maze uses the arrow keys, Sky Sketch the mouse, Quick Draw the A and L keys. ESC goes back.
        </p>
      </div>
    </div>
  )
}
