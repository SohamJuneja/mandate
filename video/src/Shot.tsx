import React from 'react'
import { Img, interpolate, staticFile } from 'remotion'
import caps from './caps.json'
import { C, ease, MONO, useT } from './ui'

type Box = { x: number; y: number; w: number; h: number }
export type Key = { at: number; box?: string | Box; zoom?: number; hl?: boolean; note?: string }

const CW = 1500, CH = 800, IW = 1920

/** A captured page in a card; the camera eases between keyframes and draws a highlight box. */
export const Shot = ({ k, keys, from = 0, to = 999, url }: { k: string; keys: Key[]; from?: number; to?: number; url?: string }) => {
  const { t } = useT()
  if (t < from - 0.4 || t > to + 0.4) return null
  const cap = (caps as any)[k] ?? { h: 1080, boxes: {} }
  const H = cap.h as number
  const boxOf = (b: Key['box']): Box => {
    if (!b) return { x: 0, y: 0, w: IW, h: 1080 }
    if (typeof b === 'string') return cap.boxes[b] ?? { x: 0, y: 0, w: IW, h: 1080 }
    return b
  }
  const lt = t - from
  // keyframe interpolation
  let i = 0
  while (i < keys.length - 1 && lt >= keys[i + 1].at) i++
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)]
  const seg = b.at - a.at
  const raw = seg > 0 ? Math.min(1, Math.max(0, (lt - a.at) / Math.min(seg, 1.1))) : 1
  const e = ease(raw)
  const ba = boxOf(a.box), bb = boxOf(b.box)
  const za = a.zoom ?? 1, zb = b.zoom ?? 1
  const useB = lt >= b.at
  const cx = useB ? bb.x + bb.w / 2 : ba.x + ba.w / 2 + ((bb.x + bb.w / 2) - (ba.x + ba.w / 2)) * (lt > a.at && i < keys.length - 1 && lt >= b.at ? 1 : 0)
  // simpler: ease from a → b only once b's time is reached
  const k2 = i < keys.length - 1 ? 0 : 0
  void k2
  const cur = interpBox(ba, bb, lt >= b.at ? 1 : 0)
  void cx; void cur
  // Real interpolation: we move toward the CURRENT keyframe from the previous one.
  const prev = keys[Math.max(0, i - 1)], now = keys[i]
  const pr = Math.min(1, Math.max(0, (lt - now.at) / 1.0))
  const pe = i === 0 ? 1 : ease(pr)
  const B = interpBox(boxOf(prev.box), boxOf(now.box), pe)
  const Z = (prev.zoom ?? 1) + ((now.zoom ?? 1) - (prev.zoom ?? 1)) * pe
  void e; void za; void zb; void raw; void useB
  const s = (CW / IW) * Z
  let tx = CW / 2 - (B.x + B.w / 2) * s
  let ty = CH / 2 - (B.y + B.h / 2) * s
  tx = Math.min(0, Math.max(CW - IW * s, tx))
  ty = Math.min(0, Math.max(Math.min(0, CH - H * s), ty))
  const op = interpolate(t, [from - 0.4, from, to, to + 0.4], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const hlK = now.hl ? ease(Math.min(1, Math.max(0, (lt - now.at - 0.5) / 0.4))) : 0
  const HB = boxOf(now.box)
  const pad = 10
  return (
    <div style={{ position: 'absolute', left: (1920 - CW) / 2, top: 118, width: CW, height: CH + 44, opacity: op, transform: `translateY(${(1 - op) * 20}px)` }}>
      <div style={{ height: 44, background: '#151C30', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}>
        {[C.red, '#FFC14D', C.mint].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.8 }} />)}
        <span style={{ marginLeft: 16, fontFamily: MONO, fontSize: 17, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.05)', padding: '5px 14px', borderRadius: 8, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{url ?? cap.url}</span>
      </div>
      <div style={{ width: CW, height: CH, overflow: 'hidden', position: 'relative', borderRadius: '0 0 16px 16px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', background: '#0d1220' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
          <Img src={staticFile(`cap/${k}.png`)} style={{ width: IW, display: 'block' }} />
          {hlK > 0 && (
            <div style={{ position: 'absolute', left: HB.x - pad, top: HB.y - pad, width: HB.w + pad * 2, height: HB.h + pad * 2, border: `${3 / s * 1.2}px solid ${C.orange}`, borderRadius: 10, opacity: hlK, boxShadow: `0 0 ${24 / s}px ${C.orange}88`, transform: `scale(${1.15 - 0.15 * hlK})`, transformOrigin: 'center' }} />
          )}
        </div>
        {now.note && hlK > 0 && (
          <div style={{ position: 'absolute', right: 24, top: 24, background: C.orange, color: '#0B1530', fontFamily: MONO, fontWeight: 700, fontSize: 26, padding: '8px 16px', borderRadius: 10, opacity: hlK }}>{now.note}</div>
        )}
      </div>
    </div>
  )
}
function interpBox(a: Box, b: Box, k: number): Box {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k }
}
