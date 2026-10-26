// Coach Says: the coach calls a strike or combo out loud; throw it with the
// right fists in order. With the Simon twist, only calls that start with
// "Coach says" count. Punch on a trick call and the coach gets you.
//
// Punches only. Hands are 'lead' / 'rear' (resolved by stance) or 'L' / 'R'.

export const CALLS = [
  { say: 'jab', hands: ['lead'], level: 1 },
  { say: 'cross', hands: ['rear'], level: 1 },
  { say: 'one two', hands: ['lead', 'rear'], level: 1 },
  { say: 'double jab', hands: ['lead', 'lead'], level: 1 },
  { say: 'left punch', hands: ['L'], level: 1 },
  { say: 'right punch', hands: ['R'], level: 1 },
  { say: 'left right left', hands: ['L', 'R', 'L'], level: 1 },
  { say: 'jab, cross, hook', hands: ['lead', 'rear', 'lead'], level: 2 },
  { say: 'left hook', hands: ['L'], level: 2 },
  { say: 'right hook', hands: ['R'], level: 2 },
  { say: 'left uppercut', hands: ['L'], level: 2 },
  { say: 'right uppercut', hands: ['R'], level: 2 },
  { say: 'hook, cross', hands: ['lead', 'rear'], level: 2 },
  { say: 'jab, right uppercut', hands: ['lead', 'R'], level: 2 },
  { say: 'cross, hook, cross', hands: ['rear', 'lead', 'rear'], level: 3 },
  { say: 'one one two', hands: ['lead', 'lead', 'rear'], level: 3 },
  { say: 'one two three two', hands: ['lead', 'rear', 'lead', 'rear'], level: 3 },
  { say: 'double jab, cross, hook', hands: ['lead', 'lead', 'rear', 'lead'], level: 3 },
  { say: 'jab, cross, left uppercut, cross', hands: ['lead', 'rear', 'L', 'rear'], level: 3 },
  { say: 'left right left right', hands: ['L', 'R', 'L', 'R'], level: 3 },
]

const LEVEL_OF = { easy: 1, normal: 2, hard: 3 }
export const ROUND_CALLS = 12
export const TRICK_CHANCE = 0.3

export function resolveHands(hands, stance) {
  const lead = stance === 'southpaw' ? 'R' : 'L'
  const rear = lead === 'L' ? 'R' : 'L'
  return hands.map((h) => (h === 'lead' ? lead : h === 'rear' ? rear : h))
}

// A round's calls: drawn from the player's level and below, no immediate repeats.
export function buildRound(level, simon) {
  const max = LEVEL_OF[level] ?? 2
  const pool = CALLS.filter((c) => c.level <= max)
  const out = []
  let last = null
  for (let i = 0; i < ROUND_CALLS; i++) {
    let c
    do c = pool[Math.floor(Math.random() * pool.length)]
    while (pool.length > 1 && c === last)
    last = c
    // never open the round with a trick
    const trick = simon && i > 0 && Math.random() < TRICK_CHANCE
    out.push({ ...c, trick, line: simon && !trick ? `Coach says ${c.say}` : c.say })
  }
  return out
}

// Points for a finished call.
export function scoreCall({ trick, matched, total, struck, reaction }) {
  if (trick) return struck ? { pts: 0, verdict: 'Gotcha!' } : { pts: 50, verdict: 'Good listening!' }
  if (matched === total) {
    const speed = Math.max(0, Math.round((1200 - reaction) / 12))   // up to +100 for a fast start
    return { pts: 100 + speed, verdict: reaction < 600 ? 'Lightning!' : 'Clean!' }
  }
  if (matched === 0) return { pts: 0, verdict: 'Missed it' }
  return { pts: 25 * matched, verdict: `${matched} of ${total}` }
}
