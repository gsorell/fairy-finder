import { useEffect, useRef, useState } from 'react'
import { pads, rumbleHum, rumblePattern, rumbleStop, isHeld } from '../joycon/hid.js'
import { createMotion, feedMotion, createPointer, learnPointer, centerPointer, stepPointer } from '../joycon/motion.js'
import { WORDS, shuffled } from './words.js'
import { loadRoster } from './roster.js'
import { sfx, say, hush } from './audio.js'
import { useHid, useKeys, fitCanvas, INK, btn, bigBtn, overlay, panel, topBar } from './common.js'

const W = 960
const H = 540
const DRAW_MS = 60000
const COLORS = ['#2a1a3e', '#ff5a5f', '#3bb4ff', '#3ddc84', '#ffb020', '#a06bff', '#ff7ac8', '#8b5a2b']
const SIZES = [6, 12, 22]

// Air Pictionary. The wand is a Joy-Con turned into a pointer by its gyro; hold the
// trigger to draw. Everyone else shouts guesses; "Got it!" credits drawer and guesser.
export default function SkySketch({ onExit }) {
  const [roster] = useState(loadRoster)
  const [wandSide, setWandSide] = useState(null)   // for rendering; wand.current for handlers and the loop
  const [players, setPlayers] = useState(() => roster.slice(0, Math.max(2, Math.min(4, roster.length))).map((p) => p.id))
  const [rounds, setRounds] = useState(1)
  const [phase, setPhase] = useState('setup')   // setup | wand | peek | draw | guessed | reveal | final
  const [wandStep, setWandStep] = useState('pick')   // pick | floor | turn | center
  const [turn, setTurn] = useState(0)
  const [scores, setScores] = useState({})
  const [word, setWord] = useState('')
  const [peeking, setPeeking] = useState(false)
  const [left, setLeft] = useState(DRAW_MS)
  const [color, setColor] = useState(0)
  const [size, setSize] = useState(1)
  const [guesser, setGuesser] = useState(null)

  const canvasRef = useRef(null)
  const motion = useRef({ L: createMotion(), R: createMotion() })
  const pointer = useRef(createPointer())
  const wand = useRef(null)          // 'L' | 'R' | null (mouse)
  const strokes = useRef([])
  const pen = useRef({ down: false, mouse: false, x: 0, y: 0, last: 0, speed: 0 })
  const words = useRef(shuffled(WORDS))
  const drawStart = useRef(0)
  const live = useRef({ phase, wandStep, color, size })   // read by the loop and Joy-Con handlers
  useEffect(() => { live.current = { phase, wandStep, color, size } }, [phase, wandStep, color, size])

  // Phase changes land in live.current at once: IMU frames arrive faster than renders.
  function pickWand(side) { wand.current = side; setWandSide(side) }
  function go(p) { live.current = { ...live.current, phase: p }; setPhase(p) }
  function wandTo(w) { live.current = { ...live.current, wandStep: w }; setWandStep(w) }

  const order = players.map((id) => roster.find((p) => p.id === id)).filter(Boolean)
  const totalTurns = order.length * rounds
  const drawer = order[turn % Math.max(1, order.length)]

  function startTurn(t) {
    setTurn(t)
    setWord(words.current.pop() ?? (words.current = shuffled(WORDS)).pop())
    strokes.current = []
    setGuesser(null)
    setPeeking(false)
    go('peek')
    say(`${order[t % order.length].name}, it's your turn to draw. Everyone else, close your eyes!`)
  }

  function beginDrawing() {
    hush()
    go('draw')
    drawStart.current = 0   // stamped by the drawing loop on its next frame
    pen.current.timedOut = false
    setLeft(DRAW_MS)
    sfx.ready()
    if (wand.current) centerPointer(pointer.current)
  }

  function finishTurn(who) {
    setGuesser(who)
    if (who) {
      setScores((s) => ({ ...s, [drawer.id]: (s[drawer.id] ?? 0) + 1, [who.id]: (s[who.id] ?? 0) + 1 }))
      sfx.goal()
    }
    go('reveal')
    stopPen()
  }

  function nextTurn() {
    if (turn + 1 >= totalTurns) { go('final'); sfx.win(); return }
    startTurn(turn + 1)
  }

  function stopPen() {
    pen.current.down = false
    if (wand.current) rumbleStop(wand.current)
  }

  function undo() { strokes.current.pop(); sfx.click() }
  function clear() { strokes.current = []; sfx.click() }

  // ---------- Joy-Con ----------
  useHid((ev) => {
    if (ev.type === 'imu') {
      const m = motion.current[ev.side]
      feedMotion(m, ev.a, ev.w)
      const { phase: ph, wandStep: ws } = live.current
      if (ev.side !== wand.current) return
      if (ph === 'wand') {
        if (ws === 'floor' && learnPointer(pointer.current, m, 'floor')) { sfx.ready(); wandTo('turn') }
        else if (ws === 'turn' && learnPointer(pointer.current, m, 'turn')) { sfx.ready(); wandTo('center') }
      } else {
        stepPointer(pointer.current, m, W / H)
      }
      return
    }
    if (ev.type !== 'button' || !ev.down) {
      if (ev.type === 'button' && ev.name === 'trigger' && ev.side === wand.current) {
        if (live.current.phase === 'peek') setPeeking(false)
      }
      return
    }
    const { phase: ph, wandStep: ws } = live.current
    if (ph === 'wand' && ws === 'pick' && ev.name === 'trigger') {
      pickWand(ev.side)
      sfx.click()
      wandTo('floor')
      return
    }
    if (ev.side !== wand.current) return
    if (ph === 'wand' && ws === 'center' && ev.name === 'trigger') {
      centerPointer(pointer.current)
      sfx.goal()
      rumblePattern(ev.side, [[200, 400, 0.6, 50]])
      startTurn(0)
    } else if (ph === 'peek' && ev.name === 'trigger') {
      setPeeking(true)
    } else if (ph === 'peek' && ev.name === 'east') {
      beginDrawing()
    } else if (ph === 'draw') {
      if (ev.name === 'north') { setColor((c) => (c + 1) % COLORS.length); sfx.click() }
      else if (ev.name === 'west') undo()
      else if (ev.name === 'south') clear()
      else if (ev.name === 'east') { stopPen(); go('guessed') }
      else if (ev.name === 'bumper' || ev.name === 'stick') { centerPointer(pointer.current); sfx.click() }
    }
  })

  useKeys((e, down) => {
    if (down && e.key === 'Escape') { hush(); onExit() }
  })

  // ---------- drawing loop ----------
  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const unfit = fitCanvas(cv, ctx, W, H)
    let raf = 0
    let lastTick = 0
    let lastEdge = 0
    let lastSecond = 99

    function frame(now) {
      const { phase: ph, color: ci, size: si } = live.current
      const p = pen.current
      const side = wand.current

      if (ph === 'draw') {
        if (!drawStart.current) drawStart.current = now
        const msLeft = Math.max(0, DRAW_MS - (now - drawStart.current))
        if (now - lastTick > 200) { lastTick = now; setLeft(msLeft) }
        const sec = Math.ceil(msLeft / 1000)
        if (sec !== lastSecond && sec <= 10 && sec > 0) {
          sfx.tick()
          if (side) rumblePattern(side, [[300, 600, 0.25, 15]])
        }
        lastSecond = sec
        if (msLeft === 0 && !p.timedOut) {
          p.timedOut = true
          p.down = false
          if (side) rumbleStop(side)
          go('reveal')
          setGuesser(null)
          sfx.foul()
        }
      }

      // the Joy-Con pen follows the pointer; the trigger puts it on the paper
      if (side && ph === 'draw') {
        const x = pointer.current.x * W
        const y = pointer.current.y * H
        const dt = Math.max(1, now - p.last)
        p.speed = (Math.hypot(x - p.x, y - p.y) / dt) * 1000
        p.last = now
        const atEdge = pointer.current.x <= 0 || pointer.current.x >= 1 || pointer.current.y <= 0 || pointer.current.y >= 1
        if (atEdge && p.speed > 50 && now - lastEdge > 160) { lastEdge = now; rumblePattern(side, [[400, 800, 0.4, 15]]) }
        const wantDown = isHeld(side, 'trigger')
        if (wantDown && !p.down) strokes.current.push({ color: COLORS[ci], size: SIZES[si], pts: [[x, y]] })
        p.down = wantDown
        if (p.down) {
          const s = strokes.current[strokes.current.length - 1]
          const [lx, ly] = s.pts[s.pts.length - 1]
          if (Math.hypot(x - lx, y - ly) > 1.5) s.pts.push([x, y])
          // pencil scratch: a light, high hum that grows with pen speed
          rumbleHum(side, 160, 320 + Math.min(p.speed, 1500) * 0.15, Math.min(0.35, 0.07 + p.speed / 4500))
        } else {
          rumbleStop(side)
        }
        p.x = x
        p.y = y
      }

      drawBoard(ctx, strokes.current)
      if (ph === 'draw' && (side || p.mouse)) drawCursor(ctx, side ? pointer.current.x * W : p.x, side ? pointer.current.y * H : p.y, COLORS[ci], SIZES[si], p.down)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      unfit()
      if (wand.current) rumbleStop(wand.current)
      hush()
    }
  }, [])

  // ---------- mouse / touch drawing ----------
  function toBoard(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  function mouseDown(e) {
    if (live.current.phase !== 'draw' || wand.current) return
    const [x, y] = toBoard(e)
    Object.assign(pen.current, { down: true, mouse: true, x, y })
    strokes.current.push({ color: COLORS[color], size: SIZES[size], pts: [[x, y]] })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function mouseMove(e) {
    if (wand.current) return
    const [x, y] = toBoard(e)
    Object.assign(pen.current, { mouse: true, x, y })
    if (pen.current.down) strokes.current[strokes.current.length - 1]?.pts.push([x, y])
  }
  function mouseUp() {
    if (!wand.current) pen.current.down = false
  }

  const joy = !!(pads.L || pads.R)
  const wandName = wandSide === 'L' ? 'left' : 'right'

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2c1d4a', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 48, userSelect: 'none', touchAction: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 8, cursor: wandSide ? 'none' : 'crosshair' }}
        onPointerDown={mouseDown} onPointerMove={mouseMove} onPointerUp={mouseUp} onPointerCancel={mouseUp} />

      <div style={topBar}>
        <button onClick={() => { hush(); onExit() }} style={btn}>← Carnival</button>
        <span>✏️ Sky Sketch</span>
        {phase === 'draw' && (
          <>
            <span style={{ fontSize: 24, marginLeft: 8, color: left < 10000 ? '#ffb4b4' : '#fff' }}>⏱ {Math.ceil(left / 1000)}</span>
            <span>{drawer?.emoji} {drawer?.name} is drawing</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {COLORS.map((c, i) => (
                <button key={c} onClick={() => setColor(i)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: i === color ? '3px solid #fff' : '2px solid #0006' }} />
              ))}
            </span>
            {SIZES.map((s, i) => (
              <button key={s} onClick={() => setSize(i)} style={{ ...btn, padding: '2px 8px', background: i === size ? '#ffd23f' : '#fff' }}>{['S', 'M', 'L'][i]}</button>
            ))}
            <button onClick={undo} style={btn}>↶</button>
            <button onClick={clear} style={btn}>🗑</button>
            <button onClick={() => { stopPen(); go('guessed') }} style={{ ...btn, background: '#3ddc84' }}>Got it!</button>
          </>
        )}
        {phase !== 'draw' && phase !== 'setup' && (
          <span style={{ marginLeft: 'auto' }}>
            {order.map((p) => `${p.emoji} ${scores[p.id] ?? 0}`).join('   ')}
          </span>
        )}
      </div>

      {phase === 'draw' && wandSide && (
        <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', color: '#e9ddff', fontSize: 13, pointerEvents: 'none' }}>
          Hold the trigger to draw · {wandSide === 'R' ? 'X' : '↑'} colour · {wandSide === 'R' ? 'Y' : '←'} undo · {wandSide === 'R' ? 'B' : '↓'} clear · {wandSide === 'R' ? 'A' : '→'} got it! · {wandSide === 'R' ? 'R' : 'L'} button re-centres the pen
        </div>
      )}

      {phase === 'setup' && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 44 }}>✏️</div>
            <h2 style={{ margin: '4px 0' }}>Sky Sketch</h2>
            <p style={{ marginTop: 0 }}>Draw in the air with a Joy-Con. Everyone else guesses!</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
              {roster.map((p) => {
                const on = players.includes(p.id)
                return (
                  <button key={p.id} onClick={() => setPlayers((list) => (on ? list.filter((x) => x !== p.id) : [...list, p.id]))}
                    style={{ ...btn, borderRadius: 999, background: on ? '#ffd23f' : '#fff' }}>
                    {p.emoji} {p.name}
                  </button>
                )
              })}
            </div>
            <label style={{ fontWeight: 800 }}>Turns each:{' '}
              <select value={rounds} onChange={(e) => setRounds(+e.target.value)} style={{ fontSize: 16 }}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button disabled={order.length < 2} onClick={() => { go('wand'); wandTo('pick') }} style={{ ...bigBtn, opacity: order.length < 2 ? 0.5 : 1 }}>
                {joy ? 'Draw with a Joy-Con' : 'Start'}
              </button>
              {joy && <button disabled={order.length < 2} onClick={() => { pickWand(null); startTurn(0) }} style={btn}>Use the mouse</button>}
            </div>
            {order.length < 2 && <p style={{ fontSize: 13 }}>Pick at least two players.</p>}
            <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 0 }}>Players come from Punch Pop's family list. Add people there.</p>
          </div>
        </div>
      )}

      {phase === 'wand' && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 44 }}>🪄</div>
            <h2 style={{ margin: '4px 0' }}>Wake up the magic wand</h2>
            {!joy && <p>No Joy-Con connected. Connect one from the Carnival menu, or use the mouse.</p>}
            {wandStep === 'pick' && <p>Pick up the Joy-Con you'll draw with and <b>pull its trigger</b> (ZL or ZR).</p>}
            {wandStep === 'floor' && <p>Point it straight at the <b>floor</b> and hold it <b>perfectly still</b> for a second…</p>}
            {wandStep === 'turn' && <p>Now raise it to point at the <b>screen</b>, then turn and point at the <b>right</b> side of the room ➡️</p>}
            {wandStep === 'center' && <p>Point it at the <b>middle of the screen</b> and pull the trigger.</p>}
            <WandSteps step={wandStep} />
            <button onClick={() => { pickWand(null); startTurn(0) }} style={{ ...btn, marginTop: 10 }}>Use the mouse instead</button>
          </div>
        </div>
      )}

      {phase === 'peek' && drawer && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>🙈</div>
            <h2 style={{ margin: '4px 0' }}>{drawer.emoji} {drawer.name}'s turn to draw!</h2>
            <p>Everyone else: <b>close your eyes</b>.</p>
            <div style={{ fontSize: 40, fontWeight: 900, minHeight: 56, margin: '8px 0', letterSpacing: 1 }}>
              {peeking ? word.toUpperCase() : '• • •'}
            </div>
            {wandSide ? (
              <p>{drawer.name}: <b>hold the trigger</b> to see your word, then press <b>{wandSide === 'R' ? 'A' : '→'}</b> to start drawing.</p>
            ) : (
              <button onPointerDown={() => setPeeking(true)} onPointerUp={() => setPeeking(false)} onPointerLeave={() => setPeeking(false)} style={btn}>
                Hold to see the word
              </button>
            )}
            <div style={{ marginTop: 12 }}><button onClick={beginDrawing} style={bigBtn}>Start drawing ▶</button></div>
            {wandSide && <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 0 }}>Drawing with the {wandName} Joy-Con</p>}
          </div>
        </div>
      )}

      {phase === 'guessed' && drawer && (
        <div style={overlay}>
          <div style={panel}>
            <h2 style={{ marginTop: 0 }}>Who guessed it?</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {order.filter((p) => p.id !== drawer.id).map((p) => (
                <button key={p.id} onClick={() => finishTurn(p)} style={{ ...bigBtn, fontSize: 16 }}>{p.emoji} {p.name}</button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={() => finishTurn(null)} style={btn}>Nobody</button>{' '}
              <button onClick={() => go('draw')} style={btn}>Oops, keep drawing</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'reveal' && drawer && (
        <div style={{ ...overlay, background: 'rgba(20,10,30,0.25)', alignItems: 'flex-end', paddingBottom: 30 }}>
          <div style={panel}>
            <div style={{ fontSize: 15, fontWeight: 800, opacity: 0.7 }}>The word was</div>
            <div style={{ fontSize: 40, fontWeight: 900 }}>{word.toUpperCase()}</div>
            <p style={{ margin: '6px 0 12px' }}>
              {guesser ? `🎉 ${guesser.emoji} ${guesser.name} got it! +1 each for ${guesser.name} and ${drawer.name}` : "⏰ Time's up! Nobody got it this time."}
            </p>
            <button onClick={nextTurn} style={bigBtn}>{turn + 1 >= totalTurns ? 'See the winner 🏆' : 'Next artist ▶'}</button>
          </div>
        </div>
      )}

      {phase === 'final' && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 48 }}>🏆</div>
            <h2 style={{ margin: '4px 0 12px' }}>Sky Sketch scores</h2>
            {[...order].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)).map((p, i) => (
              <div key={p.id} style={{ fontSize: 22, fontWeight: i === 0 ? 900 : 600 }}>{i === 0 ? '👑 ' : ''}{p.emoji} {p.name}: {scores[p.id] ?? 0}</div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => { setScores({}); startTurn(0) }} style={bigBtn}>Play again</button>
              <button onClick={() => go('setup')} style={btn}>Change players</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WandSteps({ step }) {
  const steps = ['pick', 'floor', 'turn', 'center']
  const at = steps.indexOf(step)
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ width: 12, height: 12, borderRadius: '50%', background: i < at ? '#3ddc84' : i === at ? '#ffd23f' : '#ddd', border: `2px solid ${INK}` }} />
      ))}
    </div>
  )
}

function drawBoard(ctx, strokes) {
  ctx.fillStyle = '#fffdf6'
  ctx.fillRect(0, 0, W, H)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.size
    const pts = s.pts
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0][0], pts[0][1], s.size / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    // smooth through midpoints so a wobbly wand still draws soft curves
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
    }
    const end = pts[pts.length - 1]
    ctx.lineTo(end[0], end[1])
    ctx.stroke()
  }
}

function drawCursor(ctx, x, y, color, size, down) {
  ctx.strokeStyle = down ? color : '#2a1a3e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, size / 2 + 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, down ? size / 2 : 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '22px system-ui, sans-serif'
  ctx.fillText('🪄', x + size / 2 + 4, y - size / 2 - 4)
}

