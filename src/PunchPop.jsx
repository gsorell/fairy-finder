import { useEffect, useRef, useState } from 'react'
import {
  hidSupported, connectJoyCon, watchJoyCons, onJoyCon, padStatus, buzz, simulateStrike, tuning, saveTuning, startStrikes,
} from './punchPop/joycon.js'
import { sfx, unlockAudio, speak, hush } from './punchPop/audio.js'
import { W, H, LEVELS, createBalloonGame, update, hit, render } from './punchPop/balloonGame.js'
import { buildRound, resolveHands, scoreCall, ROUND_CALLS } from './punchPop/coachCalls.js'
import PunchGraph, { GraphLegend } from './punchPop/PunchGraph.jsx'

const PLAYERS_KEY = 'punch-pop-players'
const SCORES_KEY = 'punch-pop-scores'
const EMOJIS = ['🥊', '🦄', '🐯', '🐼', '🦖', '🐙', '🦊', '🐸', '🦁', '🐝', '🌈', '⭐']
const DEFAULT_PLAYERS = [{ id: 'p1', name: 'Player 1', emoji: '🥊', power: 3.0, level: 'normal', stance: 'orthodox' }]
const MODES = { balloon: '🎈 Balloon Pop', coach: '📣 Coach Says' }
const BLUE = '#3bb4ff'
const RED = '#ff5a5f'
const INK = '#1b2440'

function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}
function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* not persisted */ }
}

// Keys and taps stand in for Joy-Cons: A / ← is the left fist, L / → the right.
function sideForKey(key) {
  const k = key.toLowerCase()
  if (k === 'a' || k === 'arrowleft') return 'L'
  if (k === 'l' || k === 'arrowright') return 'R'
  return null
}

export default function PunchPop({ onBack }) {
  const [players, setPlayers] = useState(() => {
    const saved = loadJSON(PLAYERS_KEY, DEFAULT_PLAYERS)
    return Array.isArray(saved) && saved.length ? saved : DEFAULT_PLAYERS
  })
  const [scores, setScores] = useState(() => loadJSON(SCORES_KEY, []))
  const [currentId, setCurrentId] = useState(() => loadJSON(PLAYERS_KEY, DEFAULT_PLAYERS)[0]?.id ?? 'p1')
  const [screen, setScreen] = useState('menu')   // menu | balloon | coach | results
  const [result, setResult] = useState(null)
  const [simon, setSimon] = useState(true)
  const player = players.find((p) => p.id === currentId) ?? players[0]

  useEffect(() => { watchJoyCons() }, [])
  useEffect(() => startStrikes(), [])   // punch detection only while Punch Pop is open
  useEffect(() => { tuning.speedThr = player.power }, [player.power])
  useEffect(() => { saveJSON(PLAYERS_KEY, players) }, [players])
  useEffect(() => { saveJSON(SCORES_KEY, scores) }, [scores])

  function finish(mode, stats) {
    const prevBest = Math.max(0, ...scores.filter((s) => s.player === player.id && s.mode === mode).map((s) => s.score))
    setScores((list) => [...list, { player: player.id, name: player.name, emoji: player.emoji, mode, score: stats.score, at: Date.now() }].slice(-300))
    setResult({ mode, ...stats, personalBest: stats.score > prevBest && stats.score > 0 })
    setScreen('results')
  }

  if (screen === 'balloon') {
    return <BalloonScreen player={player} onDone={(s) => finish('balloon', s)} onQuit={() => setScreen('menu')} />
  }
  if (screen === 'coach') {
    return <CoachScreen player={player} simon={simon} onDone={(s) => finish('coach', s)} onQuit={() => setScreen('menu')} />
  }
  if (screen === 'results') {
    return (
      <Results
        result={result} player={player} scores={scores}
        onAgain={() => setScreen(result.mode)} onMenu={() => setScreen('menu')}
      />
    )
  }
  return (
    <Menu
      players={players} setPlayers={setPlayers} player={player} setCurrentId={setCurrentId}
      scores={scores} simon={simon} setSimon={setSimon}
      onPlay={(mode) => { unlockAudio(); setScreen(mode) }} onBack={onBack}
    />
  )
}

// ---------- menu ----------
function Menu({ players, setPlayers, player, setCurrentId, scores, simon, setSimon, onPlay, onBack }) {
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !editing) onBack?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, editing])

  function updatePlayer(patch) {
    setPlayers((list) => list.map((p) => (p.id === player.id ? { ...p, ...patch } : p)))
  }
  function addPlayer() {
    const id = `p${Date.now()}`
    const emoji = EMOJIS[players.length % EMOJIS.length]
    setPlayers((list) => [...list, { id, name: `Player ${list.length + 1}`, emoji, power: 2.2, level: 'easy', stance: 'orthodox' }])
    setCurrentId(id)
    setEditing(true)
  }
  function removePlayer() {
    if (players.length < 2) return
    const rest = players.filter((p) => p.id !== player.id)
    setPlayers(rest)
    setCurrentId(rest[0].id)
    setEditing(false)
  }

  return (
    <div style={page} onClick={unlockAudio}>
      <button onClick={onBack} style={{ ...chipBtn, position: 'absolute', top: 12, left: 12 }}>← Arcade</button>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '56px 16px 40px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(44px, 9vw, 86px)', fontWeight: 900, letterSpacing: 2, color: '#fff', textShadow: `4px 4px 0 ${INK}`, lineHeight: 1 }}>
            PUNCH <span style={{ color: '#ffd23f' }}>POP!</span> 🎈
          </div>
          <div style={{ marginTop: 10, color: INK, fontWeight: 700 }}>Hold a Joy-Con in each fist and punch!</div>
        </div>

        <div style={grid}>
          <section style={card}>
            <h2 style={h2}>Who's punching?</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {players.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setCurrentId(p.id); setEditing(false) }}
                  style={{ ...playerChip, ...(p.id === player.id ? playerChipOn : null) }}
                >
                  <span style={{ fontSize: 22 }}>{p.emoji}</span> {p.name}
                </button>
              ))}
              <button onClick={addPlayer} style={{ ...playerChip, borderStyle: 'dashed' }}>+ Add</button>
            </div>
            {editing ? (
              <PlayerEditor player={player} update={updatePlayer} onDone={() => setEditing(false)} onRemove={players.length > 1 ? removePlayer : null} />
            ) : (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: '#475569', fontSize: 14 }}>
                  {LEVELS[player.level]?.label} · punch power {player.power.toFixed(1)} · {player.stance}
                </span>
                <button onClick={() => setEditing(true)} style={chipBtn}>Edit</button>
              </div>
            )}
          </section>

          <Controllers />

          <section style={{ ...card, gridColumn: '1 / -1' }}>
            <h2 style={h2}>Punch meter · {player.emoji} {player.name}</h2>
            <PunchGraph height={170} />
            <GraphLegend />
            <label style={{ ...row, marginTop: 10 }}>Punch power
              <input type="range" min="1" max="6" step="0.1" value={player.power}
                onChange={(e) => updatePlayer({ power: +e.target.value })} style={{ flex: 1 }} />
              <b style={{ width: 36, textAlign: 'right' }}>{player.power.toFixed(1)}</b>
            </label>
            <p style={{ fontSize: 13, color: '#475569', margin: '4px 0 0' }}>
              Throw a few real punches and a few lazy ones. Slide the yellow line just under the real ones.
              Every dot above it is a buzz.
            </p>
          </section>

          <section style={{ ...card, gridColumn: '1 / -1' }}>
            <h2 style={h2}>Pick a game</h2>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button onClick={() => onPlay('balloon')} style={{ ...modeBtn, background: 'linear-gradient(135deg, #3bb4ff, #a06bff)' }}>
                <div style={{ fontSize: 30 }}>🎈 Balloon Pop</div>
                <div style={modeSub}>Blue = left fist, red = right fist. Rainbow needs both. Don't punch the skunk! 60 seconds.</div>
              </button>
              <button onClick={() => onPlay('coach')} style={{ ...modeBtn, background: 'linear-gradient(135deg, #ff5a5f, #ff9f1c)' }}>
                <div style={{ fontSize: 30 }}>📣 Coach Says</div>
                <div style={modeSub}>
                  The coach calls the combo, you throw it. {ROUND_CALLS} calls.
                  {simon ? ' Only punch when the coach says "Coach says"!' : ''}
                </div>
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontWeight: 700, color: INK }}>
              <input type="checkbox" checked={simon} onChange={(e) => setSimon(e.target.checked)} />
              "Coach says" trick calls
            </label>
          </section>

          <Leaderboard scores={scores} />
          <FeelSettings />
        </div>
        <p style={{ textAlign: 'center', color: '#475569', fontSize: 13 }}>
          No Joy-Cons? Press A / L (or ← / →), or tap the left and right side of the screen. ESC goes back.
        </p>
      </div>
    </div>
  )
}

function PlayerEditor({ player, update, onDone, onRemove }) {
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <label style={row}>Name
        <input value={player.name} maxLength={14} onChange={(e) => update({ name: e.target.value })} style={input} />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => update({ emoji: e })}
            style={{ fontSize: 22, padding: 4, borderRadius: 8, cursor: 'pointer', border: e === player.emoji ? `2px solid ${INK}` : '2px solid transparent', background: 'transparent' }}>
            {e}
          </button>
        ))}
      </div>
      <label style={row}>Level
        <select value={player.level} onChange={(e) => update({ level: e.target.value })} style={input}>
          {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <label style={row}>Stance
        <select value={player.stance} onChange={(e) => update({ stance: e.target.value })} style={input}>
          <option value="orthodox">Orthodox (left foot forward)</option>
          <option value="southpaw">Southpaw (right foot forward)</option>
        </select>
      </label>
      <div style={{ fontSize: 13, color: '#475569' }}>Set punch power with the punch meter below.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onDone} style={{ ...chipBtn, background: INK, color: '#fff' }}>Done</button>
        {onRemove && <button onClick={onRemove} style={chipBtn}>Remove player</button>}
      </div>
    </div>
  )
}

function Controllers() {
  const [, setTick] = useState(0)
  const [hit, setHit] = useState({ L: false, R: false })
  useEffect(() => {
    const off = onJoyCon((ev) => {
      if (ev.type === 'status') setTick((n) => n + 1)
      if (ev.type === 'strike') {
        setHit((h) => ({ ...h, [ev.side]: true }))
        setTimeout(() => setHit((h) => ({ ...h, [ev.side]: false })), 140)
      }
    })
    const battery = setInterval(() => setTick((n) => n + 1), 3000)
    return () => { off(); clearInterval(battery) }
  }, [])

  return (
    <section style={card}>
      <h2 style={h2}>Joy-Cons</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {['L', 'R'].map((side) => {
          const status = padStatus(side)
          const color = side === 'L' ? BLUE : RED
          return (
            <div key={side} style={{
              border: `3px solid ${color}`, borderRadius: 12, padding: 10, transition: 'background .08s',
              background: hit[side] ? color : '#fff',
            }}>
              <div style={{ fontWeight: 900, color: hit[side] ? '#fff' : color }}>{side === 'L' ? 'Left' : 'Right'}</div>
              <div style={{ fontSize: 13, color: '#475569' }}>{status ?? 'not connected'}</div>
              {status && <button onClick={() => buzz(side)} style={{ ...chipBtn, marginTop: 6, fontSize: 12 }}>Test buzz</button>}
            </div>
          )
        })}
      </div>
      {hidSupported ? (
        <>
          <button onClick={() => connectJoyCon().catch(() => {})} style={{ ...chipBtn, marginTop: 10, background: '#ffd23f', fontWeight: 900 }}>
            Connect Joy-Con
          </button>
          <p style={{ fontSize: 12, color: '#475569', margin: '8px 0 0' }}>
            Pair each Joy-Con in your computer's Bluetooth settings first (hold the little sync button), then connect them here one at a time.
          </p>
        </>
      ) : (
        <p style={{ fontSize: 13, color: '#b45309', margin: '10px 0 0' }}>
          Joy-Cons need Chrome or Edge on a computer. You can still play with the keyboard or by tapping.
        </p>
      )}
    </section>
  )
}

function Leaderboard({ scores }) {
  return (
    <section style={card}>
      <h2 style={h2}>High scores</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {Object.entries(MODES).map(([mode, label]) => (
          <div key={mode}>
            <div style={{ fontWeight: 800, color: INK, marginBottom: 4 }}>{label}</div>
            <TopScores scores={scores} mode={mode} />
          </div>
        ))}
      </div>
    </section>
  )
}

function TopScores({ scores, mode, highlight }) {
  const top = scores.filter((s) => s.mode === mode).sort((a, b) => b.score - a.score).slice(0, 5)
  if (!top.length) return <div style={{ fontSize: 13, color: '#94a3b8' }}>No scores yet</div>
  return (
    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
      {top.map((s) => (
        <li key={`${s.at}-${s.player}`} style={{ fontWeight: s.at === highlight ? 900 : 500, color: s.at === highlight ? '#b45309' : INK }}>
          {s.emoji} {s.name} — {s.score}
        </li>
      ))}
    </ol>
  )
}

function FeelSettings() {
  const [, setTick] = useState(0)
  const set = (patch) => {
    Object.assign(tuning, patch)
    saveTuning()
    setTick((n) => n + 1)
  }
  return (
    <section style={card}>
      <h2 style={h2}>Buzz feel</h2>
      <label style={row}>Impact
        <select value={tuning.impact} onChange={(e) => set({ impact: e.target.value })} style={input}>
          <option value="thud">Thud (heavy pad)</option>
          <option value="snap">Snap (focus mitt)</option>
          <option value="buzz">Long buzz</option>
        </select>
      </label>
      <label style={{ ...row, justifyContent: 'flex-start' }}>
        <input type="checkbox" checked={tuning.buzz} onChange={(e) => set({ buzz: e.target.checked })} /> Buzz on punches over the line
      </label>
      <label style={{ ...row, justifyContent: 'flex-start' }}>
        <input type="checkbox" checked={tuning.graph} onChange={(e) => set({ graph: e.target.checked })} /> Show the punch graph during games
      </label>
      <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
        You only feel a buzz when a punch crosses the yellow line on the punch meter. If it lands late, lower that player's punch power a little.
      </p>
    </section>
  )
}

// ---------- Balloon Pop ----------
// The parent hands in fresh callbacks on every render; read the latest through a
// ref so a re-render never restarts a game in progress.
function useLatest(value) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value })
  return ref
}

function BalloonScreen({ player, onDone, onQuit }) {
  const canvasRef = useRef(null)
  const cb = useLatest({ onDone, onQuit })

  useEffect(() => {
    const onDone = (s) => cb.current.onDone(s)
    const onQuit = () => cb.current.onQuit()
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const game = createBalloonGame(player.level)
    let scale = 1
    let raf = 0
    let ended = false
    let endTimer = null

    function fit() {
      const dpr = window.devicePixelRatio || 1
      scale = Math.min(window.innerWidth / W, window.innerHeight / H)
      cv.style.width = `${W * scale}px`
      cv.style.height = `${H * scale}px`
      cv.width = Math.round(W * scale * dpr)
      cv.height = Math.round(H * scale * dpr)
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
    }
    fit()
    window.addEventListener('resize', fit)

    function play(events) {
      for (const ev of events) {
        if (ev === 'pop') { sfx.pop(); sfx.streak(game.streak) }
        else if (ev === 'gold') { sfx.pop(); sfx.gold() }
        else if (ev === 'rainbow') { sfx.pop(); sfx.rainbow() }
        else if (ev === 'end') {
          sfx.buzzer()
          if (!ended) {
            ended = true
            endTimer = setTimeout(() => {
              sfx.fanfare()
              onDone({ score: game.score, popped: game.popped, missed: game.missed, skunked: game.skunked, bestStreak: game.bestStreak })
            }, 1800)
          }
        } else sfx[ev]?.()
      }
    }

    const punch = (side, t) => play(hit(game, side, t))
    const off = onJoyCon((ev) => { if (ev.type === 'strike') punch(ev.side, ev.t) })
    const onKey = (e) => {
      if (e.key === 'Escape') { onQuit(); return }
      if (e.repeat) return
      const side = sideForKey(e.key)
      if (side) simulateStrike(side)
    }
    const onPointer = (e) => {
      const r = cv.getBoundingClientRect()
      simulateStrike(e.clientX < r.left + r.width / 2 ? 'L' : 'R')
    }
    window.addEventListener('keydown', onKey)
    cv.addEventListener('pointerdown', onPointer)

    let last = performance.now()
    function frame(now) {
      const dt = Math.min(50, now - last)
      last = now
      play(update(game, dt))
      render(ctx, game, now)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(endTimer)
      off()
      window.removeEventListener('resize', fit)
      window.removeEventListener('keydown', onKey)
      cv.removeEventListener('pointerdown', onPointer)
    }
  }, [player.level, cb])

  return (
    <div style={{ position: 'fixed', inset: 0, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <button onClick={onQuit} style={{ ...chipBtn, position: 'absolute', top: 10, right: 10, opacity: 0.85 }}>✕ Quit</button>
      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', color: '#cbd5e1', fontSize: 12, pointerEvents: 'none' }}>
        {player.emoji} {player.name} · {LEVELS[player.level]?.label}
      </div>
      {tuning.graph && (
        // bottom centre, between the two lanes' gloves
        <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', width: 'min(300px, 28vw)', pointerEvents: 'none' }}>
          <PunchGraph height={90} compact />
        </div>
      )}
    </div>
  )
}

// ---------- Coach Says ----------
function CoachScreen({ player, simon, onDone, onQuit }) {
  const [view, setView] = useState({ line: 'Get ready…', chips: [], matched: 0, verdict: null, pts: null, index: 0, score: 0 })
  const [flash, setFlash] = useState({ L: false, R: false })
  const cb = useLatest({ onDone, onQuit })

  useEffect(() => {
    const onDone = (s) => cb.current.onDone(s)
    const onQuit = () => cb.current.onQuit()
    const round = buildRound(player.level, simon)
    // Once this screen closes, nothing from its round may run: the voice's own
    // timers outlive the effect, and a stray callback would replay a dead round.
    let alive = true
    const timers = new Set()
    const later = (fn, ms) => {
      if (!alive) return null
      const id = setTimeout(() => { timers.delete(id); if (alive) fn() }, ms)
      timers.add(id)
      return id
    }
    let index = -1
    let call = null
    let score = 0
    const results = []

    function next() {
      index++
      if (index >= round.length) {
        const clean = results.filter((r) => r.clean)
        const times = clean.map((r) => r.reaction)
        onDone({
          score,
          clean: clean.length,
          calls: round.length,
          tricks: round.filter((c) => c.trick).length,
          gotchas: results.filter((r) => r.gotcha).length,
          avgReaction: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
        })
        return
      }
      const c = round[index]
      const hands = resolveHands(c.hands, player.stance)
      call = { ...c, expected: hands, matched: [], struck: false, start: performance.now(), done: false, deadline: null }
      const current = call
      setView((v) => ({ ...v, line: c.line, chips: hands, matched: 0, verdict: null, pts: null, index }))
      const deadline = (ms) => {
        clearTimeout(current.deadline)
        current.deadline = later(() => finish(current), ms)
      }
      deadline(5000 + 500 * hands.length)   // fallback if the voice never reports its end
      speak(c.line, {
        onStart: () => { if (alive && !current.matched.length) current.start = performance.now() },
        onEnd: () => { if (alive && !current.done) deadline((c.trick ? 1400 : 1100) + 450 * hands.length) },
      })
    }

    function finish(c) {
      if (c.done) return
      c.done = true
      clearTimeout(c.deadline)
      const reaction = c.matched.length ? c.matched[0].t - c.start : null
      const { pts, verdict } = scoreCall({ trick: c.trick, matched: c.matched.length, total: c.expected.length, struck: c.struck, reaction })
      score += pts
      results.push({ clean: !c.trick && c.matched.length === c.expected.length, gotcha: c.trick && c.struck, reaction })
      if (c.trick && c.struck) sfx.buzzer()
      else if (c.trick) sfx.niceWait()
      else if (pts >= 100) sfx.gold()
      else sfx.miss()
      setView((v) => ({ ...v, verdict, pts, score }))
      later(next, 1700)
    }

    function punch(side, t) {
      setFlash((f) => ({ ...f, [side]: true }))
      later(() => setFlash((f) => ({ ...f, [side]: false })), 140)
      const c = call
      if (!c || c.done) return
      if (c.trick) {
        c.struck = true
        finish(c)
        return
      }
      if (c.expected[c.matched.length] === side) {
        c.matched.push({ side, t })
        sfx.ding(side)
        setView((v) => ({ ...v, matched: c.matched.length }))
        if (c.matched.length === c.expected.length) finish(c)
      }
    }

    const off = onJoyCon((ev) => { if (ev.type === 'strike') punch(ev.side, ev.t) })
    const onKey = (e) => {
      if (e.key === 'Escape') { onQuit(); return }
      if (e.repeat) return
      const side = sideForKey(e.key)
      if (side) simulateStrike(side)
    }
    window.addEventListener('keydown', onKey)

    speak(simon ? 'Listen up! Only punch when coach says.' : 'Listen up! Here we go.', { onEnd: () => later(next, 500) })
    sfx.go()

    return () => {
      alive = false
      off()
      window.removeEventListener('keydown', onKey)
      for (const id of timers) clearTimeout(id)
      hush()
    }
  }, [player.level, player.stance, simon, cb])

  const tap = (side) => (e) => { e.preventDefault(); simulateStrike(side) }

  return (
    <div style={{ ...page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', touchAction: 'none', userSelect: 'none', padding: 16 }}>
      <button onClick={onQuit} style={{ ...chipBtn, position: 'absolute', top: 10, right: 10 }}>✕ Quit</button>
      <div style={{ position: 'absolute', top: 14, left: 16, fontWeight: 900, fontSize: 22, color: INK }}>
        {player.emoji} {view.score}
        <span style={{ fontSize: 14, color: '#475569', fontWeight: 700, marginLeft: 10 }}>call {Math.max(1, view.index + 1)} / {ROUND_CALLS}</span>
      </div>

      <div style={{ fontSize: 'clamp(28px, 6vw, 64px)', fontWeight: 900, color: INK, textAlign: 'center', minHeight: '1.3em', textTransform: 'uppercase' }}>
        {view.line}
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '14px 0', minHeight: 40 }}>
        {view.chips.map((side, i) => (
          <div key={i} style={{
            width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 900,
            border: `3px solid ${side === 'L' ? BLUE : RED}`,
            background: i < view.matched ? (side === 'L' ? BLUE : RED) : '#fff',
            color: i < view.matched ? '#fff' : side === 'L' ? BLUE : RED,
          }}>{side}</div>
        ))}
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, minHeight: 44, color: view.pts ? '#15803d' : '#b45309' }}>
        {view.verdict}{view.pts ? ` +${view.pts}` : ''}
      </div>

      <div style={{ display: 'flex', gap: 'clamp(20px, 10vw, 140px)', marginTop: 20 }}>
        {['L', 'R'].map((side) => {
          const color = side === 'L' ? BLUE : RED
          return (
            <div key={side} onPointerDown={tap(side)} style={{
              width: 'clamp(110px, 22vw, 200px)', aspectRatio: '1', borderRadius: '50%', cursor: 'pointer',
              background: flash[side] ? '#fff' : color, border: `10px solid ${color}`,
              boxShadow: flash[side] ? `0 0 40px ${color}` : `inset 0 -10px 0 rgba(0,0,0,0.2)`,
              transform: flash[side] ? 'scale(0.92)' : 'scale(1)', transition: 'transform .08s',
              display: 'grid', placeItems: 'center', fontSize: 'clamp(40px, 8vw, 72px)',
            }}>🥊</div>
          )
        })}
      </div>
      <div style={{ marginTop: 14, color: '#475569', fontSize: 13 }}>{player.stance === 'southpaw' ? 'Southpaw: jab is your right' : 'Jab is your left, cross is your right'}</div>
      {tuning.graph && (
        <div style={{ width: 'min(640px, 92vw)', marginTop: 16 }}>
          <PunchGraph height={110} />
        </div>
      )}
    </div>
  )
}

// ---------- results ----------
function Results({ result, player, scores, onAgain, onMenu }) {
  const entry = [...scores].reverse().find((s) => s.player === player.id && s.mode === result.mode)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') onAgain()
      if (e.key === 'Escape') onMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAgain, onMenu])

  const lines = result.mode === 'balloon'
    ? [`🎈 ${result.popped} popped`, `🔥 best streak ${result.bestStreak}`, `💨 ${result.missed} got away`, `🦨 ${result.skunked} skunk${result.skunked === 1 ? '' : 's'}`]
    : [
        `✅ ${result.clean} of ${result.calls - result.tricks} combos clean`,
        `⚡ ${result.avgReaction ? `${result.avgReaction} ms` : '–'} average reaction`,
        ...(result.tricks ? [`🙊 ${result.tricks - result.gotchas} of ${result.tricks} trick calls dodged`] : []),
      ]

  return (
    <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...card, maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#475569' }}>{MODES[result.mode]}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: INK, marginTop: 6 }}>{player.emoji} {player.name}</div>
        <div style={{ fontSize: 84, fontWeight: 900, color: '#ffd23f', textShadow: `4px 4px 0 ${INK}`, lineHeight: 1.1 }}>{result.score}</div>
        {result.personalBest && <div style={{ fontWeight: 900, color: '#15803d', fontSize: 20 }}>🏆 New personal best!</div>}
        <div style={{ display: 'grid', gap: 4, margin: '14px 0', fontWeight: 700, color: INK }}>
          {lines.map((l) => <div key={l}>{l}</div>)}
        </div>
        <div style={{ textAlign: 'left', margin: '0 auto 16px', maxWidth: 260 }}>
          <TopScores scores={scores} mode={result.mode} highlight={entry?.at} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onAgain} style={{ ...chipBtn, background: '#ffd23f', fontWeight: 900, fontSize: 18, padding: '10px 22px' }}>Play again</button>
          <button onClick={onMenu} style={{ ...chipBtn, fontSize: 18, padding: '10px 22px' }}>Menu</button>
        </div>
      </div>
    </div>
  )
}

// ---------- styles ----------
const page = {
  position: 'fixed', inset: 0, overflowY: 'auto',
  background: 'linear-gradient(180deg, #8fd3ff 0%, #d7f1ff 60%, #fff3d6 100%)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
}
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, margin: '28px 0' }
const card = { background: '#ffffffd9', borderRadius: 18, padding: 18, boxShadow: `0 6px 0 ${INK}22`, border: `3px solid ${INK}` }
const h2 = { margin: '0 0 10px', fontSize: 15, letterSpacing: 1, textTransform: 'uppercase', color: INK, fontWeight: 900 }
const chipBtn = { background: '#fff', color: INK, border: `2px solid ${INK}`, borderRadius: 10, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }
const playerChip = { ...chipBtn, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 999 }
const playerChipOn = { background: '#ffd23f', boxShadow: `0 3px 0 ${INK}` }
const modeBtn = { flex: '1 1 260px', textAlign: 'left', color: '#fff', border: `3px solid ${INK}`, borderRadius: 16, padding: '16px 18px', cursor: 'pointer', fontWeight: 900, boxShadow: `0 6px 0 ${INK}`, textShadow: `2px 2px 0 ${INK}88` }
const modeSub = { fontSize: 14, fontWeight: 600, marginTop: 6, textShadow: 'none', opacity: 0.95 }
const row = { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: INK, fontSize: 14, justifyContent: 'space-between' }
const input = { flex: 1, padding: '6px 8px', borderRadius: 8, border: `2px solid ${INK}`, fontSize: 14 }
