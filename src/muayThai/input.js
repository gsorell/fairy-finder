// Input module: translates keyboard / touch presses into game actions.
// Game intents (the engine consumes these):
//   jab, cross, lhook, rhook, lelbow, relbow, lknee, rknee, teep, lkick, rkick
//   blockHigh, blockLow, dodgeL, dodgeR, clinch, taunt
// Engine reads `intentQueue` (drain it each frame) and `held` (pressed-states).

export function createInput(target = window) {
  const held = new Set()
  let queue = []

  // Two layouts share the same engine intents:
  //   A) Two-handed   — left hand on WASD/SHIFT/Q, right hand on J/K/U/I/N/M/H/L/SPACE
  //   B) Numpad only  — entire scheme on the numpad (right hand only)
  //
  // Numpad spatial logic:
  //     /=lelbow   *=relbow   -=(unused)
  //   7=jab     8=stepIn    9=cross    +=BLOCK (hold, big key)
  //   4=dodgeL  5=teep      6=dodgeR
  //   1=lkick   2=stepOut   3=rkick    Enter=★Megaton
  //         0=lknee    .=rknee
  const keymap = {
    // === Two-handed layout ===
    'j': 'jab',
    'k': 'cross',
    'u': 'lelbow',
    'i': 'relbow',
    'n': 'lknee',
    'm': 'rknee',
    'h': 'lkick',
    'l': 'rkick',
    ' ': 'teep',
    'a': 'dodgeL',
    'd': 'dodgeR',
    'w': 'stepIn',
    's': 'stepOut',
    'shift': 'block',
    'q': 'taunt',

    // === Numpad layout (uses e.code so it works with NumLock on or off) ===
    'numpad7': 'jab',
    'numpad9': 'cross',
    'numpaddivide': 'lelbow',
    'numpadmultiply': 'relbow',
    'numpad8': 'stepIn',
    'numpad2': 'stepOut',
    'numpad4': 'dodgeL',
    'numpad6': 'dodgeR',
    'numpad5': 'teep',
    'numpad1': 'lkick',
    'numpad3': 'rkick',
    'numpad0': 'lknee',
    'numpaddecimal': 'rknee',
    'numpadadd': 'block',
    'numpadenter': 'taunt',
  }

  function keyName(e) {
    // Numpad: use e.code so the layout works with NumLock on or off (e.key changes
    // when NumLock is off — codes don't).
    if (e.code && e.code.startsWith('Numpad')) return e.code.toLowerCase()
    if (e.key === 'Shift') return 'shift'
    if (e.key === ' ') return ' '
    return e.key.toLowerCase()
  }

  function onDown(e) {
    if (e.repeat) return
    const k = keyName(e)
    if (!(k in keymap)) return
    e.preventDefault()
    const intent = keymap[k]
    held.add(intent)
    queue.push({ type: intent, edge: 'down', t: performance.now() })
  }
  function onUp(e) {
    const k = keyName(e)
    if (!(k in keymap)) return
    e.preventDefault()
    const intent = keymap[k]
    held.delete(intent)
    queue.push({ type: intent, edge: 'up', t: performance.now() })
  }

  target.addEventListener('keydown', onDown, { passive: false })
  target.addEventListener('keyup', onUp, { passive: false })

  // Touch buttons API ---------------------------------------------------
  function press(intent) {
    held.add(intent)
    queue.push({ type: intent, edge: 'down', t: performance.now() })
  }
  function release(intent) {
    held.delete(intent)
    queue.push({ type: intent, edge: 'up', t: performance.now() })
  }

  function drain() {
    const out = queue
    queue = []
    return out
  }

  function isHeld(intent) { return held.has(intent) }

  function destroy() {
    target.removeEventListener('keydown', onDown)
    target.removeEventListener('keyup', onUp)
  }

  return { drain, isHeld, press, release, destroy }
}
