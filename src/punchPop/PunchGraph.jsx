import { useEffect, useRef } from 'react'
import { traces, marks, tuning, TRACE_MS } from './joycon.js'

const COLOR = { L: '#3bb4ff', R: '#ff5a5f' }

// Live punch speed for both fists over the last few seconds, with the current
// player's threshold as a dashed line. A filled dot is a counted strike (labelled
// with its peak), a hollow dot a pull-back the detector ignored.
export default function PunchGraph({ height = 160, compact = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    const ctx = cv.getContext('2d')
    let raf = 0
    function draw() {
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = compact ? 'rgba(15,20,36,0.72)' : '#0f1424'
      ctx.beginPath()
      ctx.roundRect(0, 0, w, h, 10)
      ctx.fill()

      const now = performance.now()
      const thr = tuning.speedThr
      const ymax = Math.max(6, thr * 1.8)
      const top = compact ? 16 : 22
      const x = (t) => w - ((now - t) / TRACE_MS) * w
      const y = (v) => h - 6 - (Math.min(v, ymax) / ymax) * (h - 6 - top)

      ctx.font = '10px system-ui, sans-serif'
      ctx.lineWidth = 1
      ctx.strokeStyle = '#232a40'
      ctx.fillStyle = '#56607a'
      for (let v = 2; v < ymax; v += 2) {
        ctx.beginPath()
        ctx.moveTo(0, y(v))
        ctx.lineTo(w, y(v))
        ctx.stroke()
        if (!compact) ctx.fillText(`${v}`, 4, y(v) - 2)
      }

      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#ffd23f'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, y(thr))
      ctx.lineTo(w, y(thr))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#ffd23f'
      ctx.textAlign = 'right'
      ctx.fillText(`threshold ${thr.toFixed(1)}`, w - 6, y(thr) - 4)
      ctx.textAlign = 'left'

      ctx.lineWidth = 2
      for (const side of ['L', 'R']) {
        const tr = traces[side]
        if (!tr.length) continue
        ctx.strokeStyle = COLOR[side]
        ctx.beginPath()
        let started = false
        for (const [t, v] of tr) {
          if (now - t > TRACE_MS) continue
          if (started) ctx.lineTo(x(t), y(v))
          else { ctx.moveTo(x(t), y(v)); started = true }
        }
        ctx.stroke()
      }

      ctx.textAlign = 'center'
      ctx.font = 'bold 10px system-ui, sans-serif'
      for (const m of marks) {
        if (now - m.t > TRACE_MS) continue
        const mx = x(m.t)
        ctx.beginPath()
        ctx.arc(mx, top - 8, 4.5, 0, Math.PI * 2)
        if (m.ignored) {
          ctx.strokeStyle = COLOR[m.side]
          ctx.lineWidth = 1.5
          ctx.stroke()
        } else {
          ctx.fillStyle = COLOR[m.side]
          ctx.fill()
          if (m.peak != null && !compact) {
            ctx.fillStyle = '#e8ebf1'
            ctx.fillText(m.peak.toFixed(1), mx, top + 4)
          }
        }
      }
      ctx.textAlign = 'left'
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [compact])

  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderRadius: 10 }} />
}

export function GraphLegend() {
  const item = (color, text, hollow) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <i style={{
        width: 9, height: 9, borderRadius: '50%', display: 'inline-block',
        background: hollow ? 'transparent' : color, border: `2px solid ${color}`,
      }} />
      {text}
    </span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#475569', marginTop: 6 }}>
      {item(COLOR.L, 'left fist')}
      {item(COLOR.R, 'right fist')}
      {item('#475569', 'counted punch (buzz), with its peak')}
      {item('#475569', 'pull-back, ignored (no buzz)', true)}
      <span><b style={{ color: '#b45309' }}>- - -</b> threshold</span>
    </div>
  )
}
