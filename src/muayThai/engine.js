// Real-time fight engine. Sak telegraphs → strikes → recovers in a loop.
// Player reads the tell (color = high/low, chevron = dodge dir) and either
// dodges (PERFECT! → counter window + star) or blocks (chip damage + half star).
// Heavy strikes (elbow/knee/kick) only land cleanly during a counter window or
// while Sak is recovering / hit; otherwise he blocks them. Light strikes
// (jab/cross) chip through anytime he isn't actively blocking.

import { sfx } from './audio.js'

export const PLAYER_MAX_HP   = 100
export const OPP_MAX_HP      = 100
export const PLAYER_MAX_STAM = 100
export const ROUND_MS        = 99 * 1000

const COUNTER_MS    = 700
const PERFECT_MS    = 500
const MEGATON_FLASH = 500
const STAM_REGEN    = 0.020   // per ms (≈ 20/s)
const STAM_LOW      = 25
const ZONE_STEP_MS  = 380     // time to slide between zones
const DOWN_COUNT_MS = 1000    // 1 second per count beat
const GETUP_TARGET  = 6
const PLAYER_HIT_MS = 380     // stun after taking a clean hit
const DODGE_MS      = 320     // dodge animation duration
const HEAVY_KINDS   = new Set(['lelbow','relbow','lknee','rknee','lkick','rkick'])

// --- Player strike table (consumed by render.js) ---------------------------
// kind: 'light' | 'heavy' | 'special'
// startup / active / recover are durations in ms for each phase.
// range: which zone the strike is intended for (out-of-range = brief flash, no hit).
export const PLAYER_STRIKES = {
  jab:    { kind: 'light',   glove: 'L', startup: 80,  active: 90,  recover: 140, dmg: 5,  stam: 8,  range: 'mid'   },
  cross:  { kind: 'light',   glove: 'R', startup: 100, active: 110, recover: 180, dmg: 7,  stam: 12, range: 'mid'   },
  lelbow: { kind: 'heavy',   glove: 'L', startup: 100, active: 110, recover: 240, dmg: 14, stam: 16, range: 'close' },
  relbow: { kind: 'heavy',   glove: 'R', startup: 100, active: 110, recover: 240, dmg: 16, stam: 18, range: 'close' },
  lknee:  { kind: 'heavy',   glove: 'L', startup: 140, active: 130, recover: 280, dmg: 16, stam: 20, range: 'close' },
  rknee:  { kind: 'heavy',   glove: 'R', startup: 140, active: 130, recover: 280, dmg: 18, stam: 22, range: 'close' },
  lkick:  { kind: 'heavy',   glove: 'L', startup: 220, active: 160, recover: 360, dmg: 22, stam: 28, range: 'long'  },
  rkick:  { kind: 'heavy',   glove: 'R', startup: 220, active: 160, recover: 360, dmg: 24, stam: 30, range: 'long'  },
  teep:   { kind: 'special', glove: 'R', startup: 120, active: 140, recover: 220, dmg: 3,  stam: 14, range: 'mid'   },
}

// --- Sak's move table ------------------------------------------------------
// dodgeDir: -1 = chevron ◀ (dodgeL correct), +1 = ▶ (dodgeR), 0 = sidestep either.
// target: 'high' | 'low' | 'none'.
// zone: zone Sak's strike covers; out-of-zone player can ignore.
const SAK_MOVES = [
  { name: 'jab',   target: 'high', side: 'L', dodgeDir: -1, telegraph: 620, active: 140, recover: 360, dmg: 7,  zone: 'mid'   },
  { name: 'cross', target: 'high', side: 'R', dodgeDir:  1, telegraph: 660, active: 140, recover: 380, dmg: 9,  zone: 'mid'   },
  { name: 'kick',  target: 'low',  side: 'R', dodgeDir: -1, telegraph: 800, active: 180, recover: 460, dmg: 13, zone: 'long'  },
  { name: 'kick',  target: 'low',  side: 'L', dodgeDir:  1, telegraph: 800, active: 180, recover: 460, dmg: 13, zone: 'long'  },
  { name: 'knee',  target: 'low',  side: 'R', dodgeDir:  0, telegraph: 700, active: 160, recover: 420, dmg: 12, zone: 'close' },
  { name: 'teep',  target: 'none', side: undefined, dodgeDir: 0, telegraph: 600, active: 200, recover: 360, dmg: 0, zone: 'mid', noStrike: true, shiftRange: 1 },
]

const ZONES = ['close', 'mid', 'long']
function zoneIdx(z) { return ZONES.indexOf(z) }

export function createState() {
  return {
    phase: 'fightStart',          // 'fightStart' | 'fight' | 'downCount' | 'roundOver'
    phaseT: 1500,
    msLeft: ROUND_MS,
    countdown: 10,
    countdownT: 0,
    getUpTaps: 0,
    winner: null,

    zone: 'mid',
    zonePrev: 'mid',
    zoneT: 1,                      // 0..1 transition progress (1 = settled)
    outOfRangeFlash: 0,
    outOfRangeNeed: 'mid',

    player: {
      hp: PLAYER_MAX_HP,
      stam: PLAYER_MAX_STAM,
      stars: 0,                    // 0..3, half-steps allowed
      state: 'idle',               // idle | attacking | blocking | dodging | hit | down
      stateT: 0,
      blocking: false,             // mirrors held block (for render fallback)
      strike: null,                // key into PLAYER_STRIKES
      strikePhase: 'startup',      // startup | active | recover
      didHit: false,               // active-phase hit-resolved guard
      dodgeDir: -1,
      megatonArmed: false,
      counterWindow: 0,
      perfectFlash: 0,
    },

    opp: {
      hp: OPP_MAX_HP,
      state: 'idle',               // idle | telegraph | striking | recover | block | hit | down
      stateT: 0,
      stateDur: 800,
      hitFlash: 0,
      move: null,                  // active SAK_MOVES entry
      cooldown: 600,               // ms before picking next move from idle
      didHit: false,
    },

    impact: { t0: 0, dur: 1, side: 0, kind: 'block', dmg: 0, megaton: false, counter: false, incoming: false },

    fx: {
      shake: 0,
      flash: 0,
      hitstop: 0,
      megatonFlash: 0,
      announce: 'FIGHT!',
      announceT: 1500,
      damageNumbers: [],
    },
  }
}

export function tick(state, dt, intents, isHeld) {
  // FX timers always tick
  const fx = state.fx
  fx.shake = Math.max(0, fx.shake - dt)
  fx.flash = Math.max(0, fx.flash - dt)
  fx.hitstop = Math.max(0, fx.hitstop - dt)
  fx.megatonFlash = Math.max(0, fx.megatonFlash - dt)
  fx.announceT = Math.max(0, fx.announceT - dt)
  state.outOfRangeFlash = Math.max(0, state.outOfRangeFlash - dt)
  for (const dn of fx.damageNumbers) dn.t0 += dt
  fx.damageNumbers = fx.damageNumbers.filter(dn => dn.t0 < 1100)

  state.player.counterWindow = Math.max(0, state.player.counterWindow - dt)
  state.player.perfectFlash = Math.max(0, state.player.perfectFlash - dt)

  // Zone transition timer
  if (state.zoneT < 1) state.zoneT = Math.min(1, state.zoneT + dt / ZONE_STEP_MS)

  if (state.phase === 'fightStart') {
    state.phaseT -= dt
    if (state.phaseT <= 0) {
      state.phase = 'fight'
      fx.announce = ''
    }
    return
  }

  if (state.phase === 'roundOver') return

  if (state.phase === 'downCount') {
    tickDownCount(state, dt, intents)
    return
  }

  if (fx.hitstop > 0) return

  // Round timer
  state.msLeft = Math.max(0, state.msLeft - dt)
  if (state.msLeft <= 0) {
    state.phase = 'roundOver'
    state.winner = state.player.hp >= state.opp.hp ? 'player' : 'opp'
    fx.announce = state.winner === 'player' ? 'WIN' : 'LOSS'
    fx.announceT = 99999
    sfx.bell()
    return
  }

  // Player and Sak update
  updatePlayer(state, dt, intents, isHeld)
  updateSak(state, dt)

  // KO check
  if (state.opp.hp <= 0 && state.opp.state !== 'down') {
    state.opp.state = 'down'
    state.opp.stateT = 0
    enterDownCount(state, /*oppDown*/ true)
  } else if (state.player.hp <= 0 && state.player.state !== 'down') {
    state.player.state = 'down'
    state.player.stateT = 0
    enterDownCount(state, /*oppDown*/ false)
  }
}

// ---------------- Player ---------------------------------------------------

function updatePlayer(state, dt, intents, isHeld) {
  const p = state.player
  p.stateT += dt

  // Stamina regen unless attacking
  if (p.state !== 'attacking') {
    p.stam = Math.min(PLAYER_MAX_STAM, p.stam + STAM_REGEN * dt)
  }

  // Recover from transient states
  if (p.state === 'hit' && p.stateT >= PLAYER_HIT_MS) {
    p.state = 'idle'
    p.stateT = 0
  } else if (p.state === 'dodging' && p.stateT >= DODGE_MS) {
    p.state = 'idle'
    p.stateT = 0
  }

  // Process intents (tap = down edge)
  for (const ev of intents) {
    if (ev.edge !== 'down') continue
    if (p.state === 'hit' || p.state === 'down') continue

    if (ev.type === 'taunt') {
      if (p.stars >= 1 && !p.megatonArmed) {
        p.megatonArmed = true
        p.stars -= 1
      }
    } else if (ev.type === 'dodgeL' || ev.type === 'dodgeR') {
      if (p.state !== 'attacking') startDodge(state, ev.type === 'dodgeL' ? -1 : 1)
    } else if (PLAYER_STRIKES[ev.type]) {
      // Strike intent (jab/cross/...)
      if (p.state === 'idle' || p.state === 'blocking') {
        startStrike(state, ev.type)
      }
    }
  }

  // Held block / step (read each frame)
  const holdBlock = isHeld?.('block') === true
  p.blocking = holdBlock
  if (p.state === 'idle' && holdBlock) {
    p.state = 'blocking'
    p.stateT = 0
  } else if (p.state === 'blocking' && !holdBlock) {
    p.state = 'idle'
    p.stateT = 0
  }

  // Range stepping (held — advance one zone every ZONE_STEP_MS while held)
  const stepIn = isHeld?.('stepIn') === true
  const stepOut = isHeld?.('stepOut') === true
  if ((stepIn || stepOut) && state.zoneT >= 1) {
    const i = zoneIdx(state.zone)
    let ni = i
    if (stepIn && i > 0) ni = i - 1
    else if (stepOut && i < ZONES.length - 1) ni = i + 1
    if (ni !== i) {
      state.zonePrev = state.zone
      state.zone = ZONES[ni]
      state.zoneT = 0
    }
  }

  // Strike phase progression
  if (p.state === 'attacking' && p.strike) {
    const def = PLAYER_STRIKES[p.strike]
    const dur = p.strikePhase === 'startup' ? def.startup
              : p.strikePhase === 'active'  ? def.active
              :                                def.recover
    if (p.stateT >= dur) {
      p.stateT = 0
      if (p.strikePhase === 'startup') {
        p.strikePhase = 'active'
        p.didHit = false
        // out-of-range check at the moment we land
        if (def.range !== state.zone && def.kind !== 'special') {
          state.outOfRangeFlash = 600
          state.outOfRangeNeed = def.range
        } else {
          resolvePlayerStrike(state)
        }
      } else if (p.strikePhase === 'active') {
        p.strikePhase = 'recover'
      } else {
        // done
        p.state = 'idle'
        p.strike = null
        p.strikePhase = 'startup'
      }
    }
  }
}

function startStrike(state, key) {
  const def = PLAYER_STRIKES[key]
  const p = state.player
  if (p.stam < def.stam * 0.5) return     // too tired to even try
  p.state = 'attacking'
  p.stateT = 0
  p.strike = key
  p.strikePhase = 'startup'
  p.stam = Math.max(0, p.stam - def.stam)
}

function startDodge(state, dir) {
  const p = state.player
  p.state = 'dodging'
  p.stateT = 0
  p.dodgeDir = dir
  // Check if dodge counters Sak's current telegraph
  const o = state.opp
  if (o.state === 'telegraph' && o.move) {
    const m = o.move
    const matched = m.dodgeDir === 0 || m.dodgeDir === dir
    if (matched && m.target !== 'none') {
      // PERFECT: cancel Sak into recover, give counter window + star
      o.state = 'recover'
      o.stateT = 0
      o.stateDur = 500
      p.counterWindow = COUNTER_MS
      p.perfectFlash = PERFECT_MS
      p.stars = Math.min(3, p.stars + 1)
      sfx.miss()
    }
  }
}

function resolvePlayerStrike(state) {
  const p = state.player
  const o = state.opp
  if (p.didHit) return
  p.didHit = true
  const def = PLAYER_STRIKES[p.strike]

  // Special: teep pushes Sak back and shifts zone to long
  if (p.strike === 'teep') {
    sfx.teep()
    if (zoneIdx(state.zone) < ZONES.length - 1) {
      state.zonePrev = state.zone
      state.zone = ZONES[Math.min(ZONES.length - 1, zoneIdx(state.zone) + 1)]
      state.zoneT = 0
    }
    if (o.state === 'telegraph') {
      o.state = 'recover'; o.stateT = 0; o.stateDur = 400
    }
    return
  }

  const isHeavy = HEAVY_KINDS.has(p.strike)
  const counter = p.counterWindow > 0
  const oppRecov = o.state === 'recover' || o.state === 'hit'
  const oppOpen  = o.state === 'idle' || o.state === 'telegraph'
  // Heavy lands cleanly only during counter window or while Sak is recovering / hit.
  // Otherwise Sak blocks the heavy.
  const blockedByOpp = isHeavy && !counter && !oppRecov

  if (blockedByOpp) {
    o.state = 'block'; o.stateT = 0; o.stateDur = 240
    sfx.block()
    pushImpact(state, { kind: 'block', side: 1, dmg: 0, incoming: false })
    return
  }

  let dmg = def.dmg
  let mega = false
  if (p.megatonArmed) {
    dmg = Math.round(dmg * 2.6)
    p.megatonArmed = false
    mega = true
    state.fx.megatonFlash = MEGATON_FLASH
  }
  if (counter) dmg = Math.round(dmg * 1.25)
  if (oppOpen && o.state === 'telegraph') {
    // hitting Sak mid-telegraph is a clean interrupt
    dmg = Math.round(dmg * 1.1)
  }

  o.hp = Math.max(0, o.hp - dmg)
  o.state = 'hit'; o.stateT = 0; o.stateDur = 320
  o.hitFlash = 220
  state.fx.shake = isHeavy ? 240 : 160
  state.fx.flash = isHeavy ? 110 : 70
  state.fx.hitstop = mega ? 220 : (isHeavy ? 140 : 80)
  if (isHeavy) {
    if (p.strike === 'lkick' || p.strike === 'rkick') sfx.kick()
    else if (p.strike === 'lknee' || p.strike === 'rknee') sfx.knee()
    else sfx.elbow()
  } else {
    if (p.strike === 'jab') sfx.jab(); else sfx.cross()
  }
  if (mega) sfx.bigHit()
  pushImpact(state, {
    kind: isHeavy ? 'wham' : 'crack',
    side: 1, dmg, incoming: false, megaton: mega, counter,
  })
  pushDmgNum(state, `-${dmg}`, 1, dmg)
}

// ---------------- Sak ------------------------------------------------------

function updateSak(state, dt) {
  const o = state.opp
  o.stateT += dt
  o.hitFlash = Math.max(0, o.hitFlash - dt)

  if (o.state === 'idle') {
    o.cooldown -= dt
    if (o.cooldown <= 0) startSakMove(state)
    return
  }

  if (o.state === 'telegraph') {
    if (o.stateT >= (o.move?.telegraph ?? 600)) {
      o.state = 'striking'
      o.stateT = 0
      o.didHit = false
    }
    return
  }

  if (o.state === 'striking') {
    if (o.move?.noStrike) {
      // teep: shift player back to long
      if (!o.didHit) {
        o.didHit = true
        const ni = Math.min(ZONES.length - 1, zoneIdx(state.zone) + (o.move.shiftRange ?? 1))
        if (ni !== zoneIdx(state.zone)) {
          state.zonePrev = state.zone
          state.zone = ZONES[ni]
          state.zoneT = 0
        }
        sfx.teep()
      }
    } else if (!o.didHit) {
      o.didHit = true
      resolveSakStrike(state)
    }
    if (o.stateT >= (o.move?.active ?? 150)) {
      o.state = 'recover'
      o.stateT = 0
      o.stateDur = o.move?.recover ?? 360
    }
    return
  }

  if (o.state === 'recover' || o.state === 'block') {
    const dur = o.state === 'block' ? 240 : (o.stateDur || o.move?.recover || 360)
    if (o.stateT >= dur) {
      o.state = 'idle'
      o.stateT = 0
      o.cooldown = 500 + Math.random() * 500
      o.move = null
    }
    return
  }

  if (o.state === 'hit') {
    if (o.stateT >= (o.stateDur || 320)) {
      o.state = 'recover'
      o.stateT = 0
      o.stateDur = 280
    }
    return
  }
}

function startSakMove(state) {
  const o = state.opp
  // Pick a move that fits the current zone (or shifts toward it via teep)
  const candidates = SAK_MOVES.filter(m => m.zone === state.zone || m.noStrike)
  const pool = candidates.length ? candidates : SAK_MOVES
  const m = pool[Math.floor(Math.random() * pool.length)]
  o.move = m
  o.state = 'telegraph'
  o.stateT = 0
}

function resolveSakStrike(state) {
  const p = state.player
  const o = state.opp
  const m = o.move
  if (!m) return

  // Player dodging — already handled at startDodge if it cancelled the
  // telegraph. If we got here, player wasn't dodging in time.
  if (p.state === 'dodging') {
    // Mid-dodge but missed the cancel window — treat as evade for non-targeted
    // moves; still hits if dodge dir was wrong.
    const matched = m.dodgeDir === 0 || m.dodgeDir === p.dodgeDir
    if (matched) {
      sfx.miss()
      return
    }
  }

  // Block check: player is blocking (held). High strike requires high block;
  // we don't model high vs low separately — block just works but leaks if
  // stamina is low.
  if (p.state === 'blocking' || p.blocking) {
    let dmg = Math.max(1, Math.round(m.dmg * (p.stam < STAM_LOW ? 0.5 : 0.15)))
    p.hp = Math.max(0, p.hp - dmg)
    p.stars = Math.min(3, p.stars + 0.5)
    state.fx.shake = 90
    sfx.block()
    pushImpact(state, { kind: 'block', side: -1, dmg, incoming: true })
    pushDmgNum(state, `-${dmg}`, -1, dmg)
    return
  }

  // Player is mid-attack: still gets hit
  const dmg = m.dmg
  p.hp = Math.max(0, p.hp - dmg)
  p.state = 'hit'
  p.stateT = 0
  state.fx.shake = 240
  state.fx.flash = 110
  state.fx.hitstop = 130
  sfx.hit()
  pushImpact(state, {
    kind: m.target === 'low' ? 'wham' : 'crack',
    side: -1, dmg, incoming: true,
  })
  pushDmgNum(state, `-${dmg}`, -1, dmg)
}

// ---------------- Down count / round end -----------------------------------

function enterDownCount(state, oppDown) {
  state.phase = 'downCount'
  state.countdown = 10
  state.countdownT = 0
  state.getUpTaps = 0
  state.fx.announce = oppDown ? 'DOWN!' : 'YOU\'RE DOWN'
  state.fx.announceT = 800
  sfx.ko()
}

function tickDownCount(state, dt, intents) {
  state.countdownT += dt
  if (state.countdownT >= DOWN_COUNT_MS) {
    state.countdownT = 0
    state.countdown -= 1
    sfx.countTick?.()
  }

  // If the player is down, they can mash to get up
  if (state.player.state === 'down') {
    for (const ev of intents) {
      if (ev.edge === 'down' && (ev.type === 'jab' || ev.type === 'cross' || ev.type === 'teep')) {
        state.getUpTaps += 1
      }
    }
    if (state.getUpTaps >= GETUP_TARGET) {
      state.player.hp = Math.max(state.player.hp, Math.round(PLAYER_MAX_HP * 0.25))
      state.player.state = 'idle'
      state.player.stateT = 0
      state.phase = 'fight'
      state.fx.announce = 'GET UP!'
      state.fx.announceT = 600
      sfx.bell()
      return
    }
  }

  if (state.countdown <= 0) {
    state.phase = 'roundOver'
    if (state.opp.state === 'down') {
      state.winner = 'player'
      state.fx.announce = 'KNOCKOUT!'
    } else {
      state.winner = 'opp'
      state.fx.announce = 'YOU LOSE'
    }
    state.fx.announceT = 99999
    sfx.bell()
  }
}

// ---------------- helpers --------------------------------------------------

function pushImpact(state, p) {
  state.impact = {
    t0: 0, dur: p.kind === 'block' ? 280 : 380,
    side: p.side ?? 0,
    kind: p.kind ?? 'block',
    dmg: p.dmg ?? 0,
    megaton: !!p.megaton,
    counter: !!p.counter,
    incoming: !!p.incoming,
  }
}

function pushDmgNum(state, text, side, dmg) {
  state.fx.damageNumbers.push({ text, side, t0: 0, dmg })
}
