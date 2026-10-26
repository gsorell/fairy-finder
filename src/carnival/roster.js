// The family roster is Punch Pop's player list, so everyone sets themselves up once.
const FALLBACK = [
  { id: 'c1', name: 'Player 1', emoji: '🦄' },
  { id: 'c2', name: 'Player 2', emoji: '🐯' },
]

export function loadRoster() {
  try {
    const list = JSON.parse(localStorage.getItem('punch-pop-players'))
    if (Array.isArray(list) && list.length) return list.map(({ id, name, emoji }) => ({ id, name, emoji }))
  } catch { /* fall through */ }
  return FALLBACK
}

export function loadBest(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? {} } catch { return {} }
}
export function saveBest(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* not persisted */ }
}
