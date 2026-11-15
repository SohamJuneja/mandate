import React from 'react'
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import vo from './vo.json'

export const C = {
  navy: '#0B1530', navy2: '#070B18', cream: '#F6F1E7', ink: '#0B1530',
  mint: '#2EE6A6', violet: '#7C6CFF', orange: '#FF6B2C', red: '#FF4D5E', grey: '#8A94B0',
}
export const SANS = "'Inter', system-ui, sans-serif"
export const MONO = "'JetBrains Mono', ui-monospace, monospace"
export const ease = Easing.bezier(0.22, 1, 0.36, 1)

let fontHandle: number | null = null
if (typeof document !== 'undefined' && fontHandle === null) {
  fontHandle = delayRender('fonts')
  const l = document.createElement('link'); l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=block'
  document.head.appendChild(l)
  l.onload = () => Promise.all(['400 20px "JetBrains Mono"', '500 20px "JetBrains Mono"', '700 20px "JetBrains Mono"', '400 20px Inter', '700 20px Inter', '800 20px Inter', '900 20px Inter'].map((f) => document.fonts.load(f))).then(() => continueRender(fontHandle!), () => continueRender(fontHandle!))
  l.onerror = () => continueRender(fontHandle!)
}
export const FontLoader = () => (
  <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=block');`}</style>
)

/** 0→1 over [a, a+d] seconds, eased. */
export function useT() {
  const f = useCurrentFrame(); const { fps } = useVideoConfig()
  const t = f / fps
  const p = (a: number, d = 0.5) => interpolate(t, [a, a + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
  return { t, f, fps, p }
}

type W = { t: number; d: number; w: string }
const words = (id: string): W[] => ((vo as any)[id]?.words ?? []) as W[]
/** Time (s, relative to voice start) of the n-th word matching re. */
export function wt(id: string, re: RegExp, n = 0, fallback = 0): number {
  const ws = words(id).filter((w) => re.test(w.w))
  return ws[n]?.t ?? fallback
}

export const Bg = ({ light = false, children }: { light?: boolean; children?: React.ReactNode }) => {
  const { t } = useT()
  return (
    <AbsoluteFill style={{ background: light ? C.cream : `radial-gradient(1200px 800px at ${30 + Math.sin(t * 0.3) * 6}% 20%, #13224A 0%, ${C.navy} 45%, ${C.navy2} 100%)`, fontFamily: SANS, color: light ? C.ink : '#fff', overflow: 'hidden' }}>
      {!light && <Grid />}
      {children}
    </AbsoluteFill>
  )
}
const Grid = () => {
  const { t } = useT()
  return <AbsoluteFill style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '80px 80px', backgroundPosition: `${-t * 6}px ${-t * 3}px` }} />
}

export const Label = ({ text, light = false }: { text: string; light?: boolean }) => {
  const { p } = useT()
  return (
    <div style={{ position: 'absolute', left: 72, top: 56, fontFamily: MONO, fontSize: 22, letterSpacing: 3, fontWeight: 500, color: light ? 'rgba(11,21,48,0.6)' : 'rgba(255,255,255,0.62)', opacity: p(0.1, 0.5), transform: `translateX(${(1 - p(0.1, 0.5)) * -16}px)`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: C.mint, boxShadow: `0 0 12px ${C.mint}` }} />
      {text}
    </div>
  )
}

/** Karaoke captions: lines of ≤5 words, broken at sentence pauses; current word orange. */
export const Captions = ({ id, voOffset }: { id: string; voOffset: number }) => {
  const { t } = useT()
  const ws = words(id)
  const lines: W[][] = []
  let cur: W[] = []
  ws.forEach((w, i) => {
    const prev = ws[i - 1]
    if (cur.length && (cur.length >= 5 || (prev && w.t - (prev.t + prev.d) > 0.3))) { lines.push(cur); cur = [] }
    cur.push(w)
  })
  if (cur.length) lines.push(cur)
  const now = t - voOffset
  let idx = -1
  for (let i = 0; i < lines.length; i++) if (now >= lines[i][0].t - 0.05) idx = i
  if (idx < 0) return null
  const line = lines[idx]
  const last = line[line.length - 1]
  const nextStart = lines[idx + 1]?.[0].t ?? Infinity
  if (now > last.t + last.d + 0.5 && now < nextStart - 0.05) return null
  const op = interpolate(now, [line[0].t - 0.05, line[0].t + 0.12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 56, display: 'flex', justifyContent: 'center', opacity: op }}>
      <div style={{ background: 'rgba(7,11,24,0.72)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', padding: '14px 30px', borderRadius: 40, fontFamily: SANS, fontWeight: 700, fontSize: 46, letterSpacing: -0.5, color: '#fff', display: 'flex', gap: 14, boxShadow: '0 10px 40px rgba(0,0,0,0.35)' }}>
        {line.map((w, i) => {
          const on = now >= w.t - 0.03 && (i === line.length - 1 ? now < w.t + w.d + 0.4 : now < line[i + 1].t - 0.03)
          return <span key={i} style={{ color: on ? C.orange : '#fff', transition: 'none' }}>{w.w}</span>
        })}
      </div>
    </div>
  )
}

/** Mandate logo: navy rounded square, two grey rails, an "M" price line mint→violet, end dot. draw: 0..1 */
export const Logo = ({ size = 220, rails = 1, line = 1, dot = 1, pulse = 0 }: { size?: number; rails?: number; line?: number; dot?: number; pulse?: number }) => {
  const L = 300
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs>
        <linearGradient id="mg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={C.mint} /><stop offset="1" stopColor={C.violet} /></linearGradient>
      </defs>
      <rect x="2" y="2" width="116" height="116" rx="28" fill="#0F1D40" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
      <line x1="22" y1="34" x2={22 + 76 * rails} y2="34" stroke="#55607E" strokeWidth="5" strokeLinecap="round" />
      <line x1="22" y1="86" x2={22 + 76 * rails} y2="86" stroke="#55607E" strokeWidth="5" strokeLinecap="round" />
      <path d="M26 80 L38 42 L60 66 L82 42 L94 76" fill="none" stroke="url(#mg)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={L} strokeDashoffset={L * (1 - line)} />
      <circle cx="94" cy="76" r={6 * dot + pulse * 3} fill={C.violet} opacity={dot} />
      {pulse > 0 && <circle cx="94" cy="76" r={6 + pulse * 14} fill="none" stroke={C.violet} strokeWidth="2" opacity={1 - pulse} />}
    </svg>
  )
}

export const Stamp = ({ text, sub, at, x = 960, y = 470, color = C.red }: { text: string; sub?: string; at: number; x?: number; y?: number; color?: string }) => {
  const { t, p } = useT()
  if (t < at) return null
  const k = p(at, 0.35)
  const s = interpolate(k, [0, 1], [1.8, 1])
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) rotate(-6deg) scale(${s})`, opacity: Math.min(1, k * 1.5), textAlign: 'center' }}>
      <div style={{ border: `6px solid ${color}`, color, padding: '14px 34px', borderRadius: 16, fontWeight: 900, fontSize: 64, letterSpacing: 2, background: 'rgba(7,11,24,0.82)', boxShadow: `0 0 60px ${color}55` }}>{text}</div>
      {sub && <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 32, color: '#fff', background: 'rgba(7,11,24,0.85)', padding: '8px 20px', borderRadius: 10, display: 'inline-block' }}>{sub}</div>}
    </div>
  )
}
