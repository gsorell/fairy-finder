import { useEffect, useRef } from 'react'
import { onHid } from '../joycon/hid.js'

// Subscribes to Joy-Con events for the life of a component, always calling the
// latest handler (so it can read current state without resubscribing).
export function useHid(handler) {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => onHid((ev) => ref.current(ev)), [])
}

// Same idea for keyboard events.
export function useKeys(handler) {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => {
    const down = (e) => ref.current(e, true)
    const up = (e) => ref.current(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
}

// Letterboxes a fixed-size canvas into the window, sharp on high-DPI screens.
// Returns the cleanup function.
export function fitCanvas(cv, ctx, w, h) {
  function fit() {
    const dpr = window.devicePixelRatio || 1
    const scale = Math.min(window.innerWidth / w, (window.innerHeight - 56) / h)
    cv.style.width = `${w * scale}px`
    cv.style.height = `${h * scale}px`
    cv.width = Math.round(w * scale * dpr)
    cv.height = Math.round(h * scale * dpr)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
  }
  fit()
  window.addEventListener('resize', fit)
  return () => window.removeEventListener('resize', fit)
}

export const INK = '#2a1a3e'
export const BLUE = '#3bb4ff'
export const RED = '#ff5a5f'

export const btn = {
  background: '#fff', color: INK, border: `2px solid ${INK}`, borderRadius: 10,
  padding: '6px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 14,
}
export const bigBtn = { ...btn, background: '#ffd23f', fontSize: 18, padding: '10px 22px', boxShadow: `0 4px 0 ${INK}` }
// starts below the top bar, so "← Carnival" stays clickable over any panel
export const overlay = {
  position: 'absolute', top: 48, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(20,10,30,0.55)', padding: 16,
}
export const panel = {
  background: '#fff8ec', border: `4px solid ${INK}`, borderRadius: 20, padding: '22px 26px',
  maxWidth: 560, textAlign: 'center', color: INK, boxShadow: `0 8px 0 ${INK}`,
}
export const topBar = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 48, display: 'flex', alignItems: 'center',
  gap: 10, padding: '0 12px', color: '#fff', fontWeight: 800, background: 'rgba(0,0,0,0.25)',
}
