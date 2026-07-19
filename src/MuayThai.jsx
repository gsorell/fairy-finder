import { useEffect, useRef, useState } from 'react'
import { createState, tick } from './muayThai/engine.js'
import { setupPixelCanvas, renderFrame } from './muayThai/render.js'
import { createInput } from './muayThai/input.js'
import { sfx, unlockAudio } from './muayThai/audio.js'

const TOUCH_BUTTONS = [
  { id: 'block', label: 'BLK', x: 6, y: 60, w: 22, h: 14, color: '#5a4a14', intent: 'block', mode: 'hold' },
  { id: 'dodgeL', label: '◀', x: 2, y: 76, w: 14, h: 14, color: '#1d3b8a', intent: 'dodgeL' },
  { id: 'dodgeR', label: '▶', x: 18, y: 76, w: 14, h: 14, color: '#1d3b8a', intent: 'dodgeR' },
  { id: 'jab',    label: 'JAB',  x: 64, y: 60, w: 16, h: 14, color: '#7a4632', intent: 'jab' },
  { id: 'cross',  label: 'X',    x: 81, y: 60, w: 16, h: 14, color: '#a85a3c', intent: 'cross' },
  { id: 'lelbow', label: 'LELB', x: 64, y: 75, w: 16, h: 9,  color: '#c93030', intent: 'lelbow' },
  { id: 'relbow', label: 'RELB', x: 81, y: 75, w: 16, h: 9,  color: '#c93030', intent: 'relbow' },
  { id: 'lknee',  label: 'LKN',  x: 64, y: 85, w: 16, h: 9,  color: '#c93030', intent: 'lknee' },
  { id: 'rknee',  label: 'RKN',  x: 81, y: 85, w: 16, h: 9,  color: '#c93030', intent: 'rknee' },
  { id: 'lkick',  label: 'LKCK', x: 64, y: 95, w: 16, h: 4,  color: '#7a0d1c', intent: 'lkick' },
  { id: 'rkick',  label: 'RKCK', x: 81, y: 95, w: 16, h: 4,  color: '#7a0d1c', intent: 'rkick' },
  { id: 'teep',   label: 'TEEP', x: 36, y: 88, w: 28, h: 10, color: '#3a1a0e', intent: 'teep' },
  { id: 'megaton', label: '★', x: 46, y: 60, w: 8, h: 14, color: '#ffe04a', intent: 'taunt' },
  { id: 'stepIn',  label: 'IN ▼',  x: 36, y: 60, w: 10, h: 13, color: '#7af0ff', intent: 'stepIn',  mode: 'hold' },
  { id: 'stepOut', label: 'OUT ▲', x: 36, y: 74, w: 10, h: 13, color: '#ffae3a', intent: 'stepOut', mode: 'hold' },
]

export default function MuayThai({ onBack }) {
  const [screen, setScreen] = useState('title') // title | game | how

  useEffect(() => {
    const onKey = (e) => {
      if (screen === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        unlockAudio()
        setScreen('game')
      }
      if (screen !== 'game' && e.key === 'Escape') onBack?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, onBack])

  if (screen === 'game') return <GameView onExit={() => setScreen('title')} onBack={onBack} />

  return (
    <div
      onClick={unlockAudio}
      style={{
        position: 'fixed', inset: 0, background: '#0b0710',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', textAlign: 'center', color: '#f3e9c6',
        fontFamily: 'ui-monospace, monospace', padding: 20,
      }}
    >
      <button
        onClick={onBack}
        style={{
          position: 'absolute', top: 12, left: 12,
          background: '#1c0f1a', color: '#f3e9c6', border: '2px solid #c93030',
          fontFamily: 'ui-monospace, monospace', fontWeight: 'bold', fontSize: 12,
          padding: '6px 12px', cursor: 'pointer', borderRadius: 4, letterSpacing: 1,
        }}
      >← ARCADE</button>

      <div style={{
        maxWidth: 720, padding: 24, border: '4px solid #c93030',
        borderRadius: 6, boxShadow: '0 0 0 4px #0b0710, 0 0 0 6px #c93030',
        background: 'linear-gradient(180deg, #1c0f1a, #0b0710)',
      }}>
        <div style={{
          fontSize: 'clamp(22px, 6vw, 56px)', fontWeight: 900, letterSpacing: 4,
          color: '#ffe04a', textShadow: '3px 3px 0 #c93030',
        }}>MUAY THAI</div>
        <div style={{
          fontSize: 'clamp(28px, 8vw, 78px)', fontWeight: 900, letterSpacing: 6,
          color: '#c93030', textShadow: '3px 3px 0 #000', marginTop: -4,
        }}>KNOCKOUT</div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>— a 16-bit slugfest —</div>

        {screen === 'how' ? (
          <div style={{ marginTop: 20, fontSize: 'clamp(11px, 1.6vmin, 14px)', textAlign: 'left', lineHeight: 1.55 }}>
            <p><b style={{ color: '#ffe04a' }}>READ HIS TELLS.</b> Above his head appears an arrow + chevron:</p>
            <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
              <li>arrow color: <span style={{ color: '#ff3a3a' }}>red</span> = high strike, <span style={{ color: '#ffae3a' }}>orange</span> = low strike</li>
              <li>chevron: <b>◀</b> dodge LEFT, <b>▶</b> dodge RIGHT, <b>][</b> sidestep either way</li>
              <li>arrow side: which side of him the strike comes from</li>
            </ul>
            <p><b style={{ color: '#7af0ff' }}>DODGING</b> the right way → <i>PERFECT!</i> → COUNTER window + a ★ <b>star</b>.</p>
            <p><b style={{ color: '#7af0ff' }}>BLOCKING</b> the right height → small chip damage + half a ★ star.</p>
            <p><b style={{ color: '#ff8d2a' }}>HEAVY STRIKES</b> (elbows / knees / kicks) only land cleanly during a counter window or when he's recovering — otherwise he <i>blocks</i> them.</p>
            <p><b style={{ color: '#ffe04a' }}>★ MEGATON:</b> with 1+ star, press <kbd>T</kbd> to arm. Your next strike does <b>2.6×</b> damage. Save them for kicks.</p>
            <p>Strikes drain <span style={{ color: '#ffe04a' }}>stamina</span>. Below 25 (red) your block leaks <i>half damage</i>. Don't get caught dry.</p>
            <p style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}><b>TWO-HANDED:</b> J/K punches · U/I elbows · N/M knees · H/L kicks · SPACE teep · A/D dodge · W/S step in/out · SHIFT block · Q arm ★Megaton · R rematch · ESC menu</p>
            <p style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}><b>NUMPAD (right-hand only):</b> 7=jab · 9=cross · /=L-elbow · *=R-elbow · 1=L-kick · 3=R-kick · 0=L-knee · .=R-knee · 5=teep · 4/6=dodge · 8/2=step in/out · +=block (hold) · Enter=★Megaton</p>
            <button onClick={() => setScreen('title')} style={menuBtn}>BACK</button>
          </div>
        ) : (
          <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => { unlockAudio(); sfx.bell(); setScreen('game') }} style={menuBtnPrimary}>FIGHT</button>
            <button onClick={() => setScreen('how')} style={menuBtn}>HOW TO PLAY</button>
          </div>
        )}

        <div style={{ marginTop: 22, fontSize: 10, opacity: 0.55 }}>
          press ENTER or tap FIGHT
        </div>
      </div>
    </div>
  )
}

function GameView({ onExit, onBack }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const inputRef = useRef(null)
  const rafRef = useRef(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = setupPixelCanvas(cv)
    stateRef.current = createState()
    inputRef.current = createInput(window)
    sfx.bell()
    sfx.crowd()

    let last = performance.now()
    let acc = 0
    const STEP = 16.6

    function frame(now) {
      const dt = Math.min(64, now - last)
      last = now
      if (!paused) {
        acc += dt
        while (acc >= STEP) {
          const intents = inputRef.current.drain()
          for (const ev of intents) {
            if (ev.edge === 'down' && ev.type === 'taunt') sfx.crowd()
          }
          tick(stateRef.current, STEP, intents, inputRef.current.isHeld)
          acc -= STEP
        }
      }
      renderFrame(ctx, stateRef.current, now)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        if (stateRef.current.phase === 'roundOver') {
          stateRef.current = createState()
          sfx.bell()
        }
      }
      if (e.key === 'Escape') onExit?.()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(rafRef.current)
      inputRef.current?.destroy()
      window.removeEventListener('keydown', onKey)
    }
  }, [paused, onExit])

  function btnDown(intent, mode) {
    unlockAudio()
    inputRef.current?.press(intent)
    if (mode !== 'hold') {
      setTimeout(() => inputRef.current?.release(intent), 30)
    }
  }
  function btnUp(intent, mode) {
    if (mode === 'hold') inputRef.current?.release(intent)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#0b0710',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', touchAction: 'none',
      }}
      onClick={unlockAudio}
    >
      <div style={{ position: 'relative', width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh' }}>
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
            imageRendering: 'pixelated',
            background: '#0b0710',
          }}
        />

        <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 6, zIndex: 5 }}>
          <button onClick={onBack} style={btnStyle('#1a1a1a')}>← ARCADE</button>
          <button onClick={onExit} style={btnStyle('#1a1a1a')}>↩ MENU</button>
          <button onClick={() => setPaused((p) => !p)} style={btnStyle('#1a1a1a')}>
            {paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
        </div>

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
          {TOUCH_BUTTONS.map((b) => (
            <button
              key={b.id}
              onPointerDown={(e) => { e.preventDefault(); btnDown(b.intent, b.mode) }}
              onPointerUp={(e) => { e.preventDefault(); btnUp(b.intent, b.mode) }}
              onPointerCancel={(e) => { e.preventDefault(); btnUp(b.intent, b.mode) }}
              style={{
                position: 'absolute',
                left: `${b.x}%`, top: `${b.y}%`,
                width: `${b.w}%`, height: `${b.h}%`,
                background: b.color,
                color: '#fff',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 'clamp(10px, 2.2vmin, 18px)',
                fontWeight: 'bold',
                border: '2px solid rgba(0,0,0,0.55)',
                borderRadius: 8,
                opacity: 0.78,
                pointerEvents: 'auto',
                touchAction: 'none',
                boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.35)',
                cursor: 'pointer',
              }}
            >{b.label}</button>
          ))}
        </div>

        <div style={{
          position: 'absolute', bottom: 4, left: 6, color: '#f3e9c6',
          fontSize: 10, opacity: 0.65, fontFamily: 'ui-monospace, monospace',
          textShadow: '1px 1px 0 #000', zIndex: 3,
        }}>
          STRIKES J/K · U/I elbows · N/M knees · H/L kicks · SPACE teep ‖ MOVE A/D dodge · W step in · S step out · SHIFT block · Q arm ★Megaton · R rematch · ESC menu ‖ or play right-hand-only on the NUMPAD
        </div>
      </div>
    </div>
  )
}

const menuBtn = {
  background: '#1c0f1a', color: '#f3e9c6', border: '2px solid #c93030',
  fontFamily: 'ui-monospace, monospace', fontWeight: 'bold', fontSize: 14,
  padding: '10px 20px', cursor: 'pointer', borderRadius: 4, letterSpacing: 2,
}
const menuBtnPrimary = {
  ...menuBtn, background: '#c93030', color: '#ffe04a',
  boxShadow: '0 4px 0 #7a0d1c', fontSize: 18,
}
function btnStyle(bg) {
  return {
    background: bg, color: '#f3e9c6', border: '1px solid #3a1a0e',
    fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 'bold',
    padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
  }
}
