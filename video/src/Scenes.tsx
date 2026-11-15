import React from 'react'
import { AbsoluteFill, interpolate } from 'remotion'
import journal from './journal.json'
import { Shot } from './Shot'
import { Bg, C, Label, Logo, MONO, Stamp, useT, wt } from './ui'

const SB = { x: 470, y: 296, w: 1250, h: 46 }
// Each scene receives vo = seconds from scene start to its voice start.
type P = { vo: number; len: number }

const H1 = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ fontWeight: 800, fontSize: 88, letterSpacing: -2.5, lineHeight: 1.02, ...style }}>{children}</div>
)

/* 1 — the bot economy */
export const S01 = ({ vo }: P) => {
  const { p, t } = useT()
  const lockAt = vo + wt('s01', /only/i, 0, 4)
  const cols = 8, rows = 3
  return (
    <Bg>
      <Label text="ILLUSTRATION · THE BOT ECONOMY" />
      <H1 style={{ position: 'absolute', left: 120, top: 150, opacity: p(vo, 0.6) }}>
        Dozens of trading bots.<br /><span style={{ color: C.grey }}>Each trades </span><span style={{ color: C.orange, opacity: p(lockAt - 0.4, 0.4) }}>its builder's own money.</span>
      </H1>
      <div style={{ position: 'absolute', left: 120, top: 430, display: 'grid', gridTemplateColumns: `repeat(${cols}, 190px)`, gap: 22, transform: `translateY(${-t * 4}px)` }}>
        {Array.from({ length: cols * rows }).map((_, i) => {
          const k = p(0.2 + i * 0.06, 0.5)
          const lk = p(lockAt + i * 0.04, 0.35)
          return (
            <div key={i} style={{ height: 120, borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', opacity: k, transform: `translateY(${(1 - k) * 24}px)`, padding: 16, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="34" height="34" viewBox="0 0 34 34"><rect x="4" y="9" width="26" height="20" rx="6" fill="none" stroke={i % 2 ? C.violet : C.mint} strokeWidth="2.5" /><circle cx="13" cy="19" r="2.5" fill={i % 2 ? C.violet : C.mint} /><circle cx="21" cy="19" r="2.5" fill={i % 2 ? C.violet : C.mint} /><line x1="17" y1="3" x2="17" y2="9" stroke="#8A94B0" strokeWidth="2" /></svg>
                <span style={{ fontFamily: MONO, fontSize: 18, color: 'rgba(255,255,255,0.7)' }}>bot-{String(11 + i * 7).padStart(3, '0')}</span>
              </div>
              <div style={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', alignItems: 'center', gap: 8, opacity: lk, transform: `scale(${0.8 + 0.2 * lk})`, transformOrigin: 'left center' }}>
                <svg width="18" height="20" viewBox="0 0 18 20"><rect x="2" y="8" width="14" height="11" rx="3" fill={C.orange} /><path d="M5 8V6a4 4 0 0 1 8 0v2" fill="none" stroke={C.orange} strokeWidth="2.2" /></svg>
                <span style={{ fontFamily: MONO, fontSize: 15, color: C.orange }}>own funds only</span>
              </div>
            </div>
          )
        })}
      </div>
    </Bg>
  )
}

/* 2 — trust */
export const S02 = ({ vo }: P) => {
  const { p, t } = useT()
  const kKeys = vo + wt('s02', /keys/i, 0, 4.5)
  const kPromise = vo + wt('s02', /promise/i, 0, 6)
  const fl = [/hallucinate/i, /loop/i, /prompt/i].map((r) => vo + wt('s02', r, 0, 8))
  const coin = p(vo + 0.2, 2.2)
  const cardsOut = p(fl[0] - 0.4, 0.5)
  return (
    <Bg>
      <Label text="ILLUSTRATION · TRUST" />
      {/* depositor coin → agent */}
      <div style={{ position: 'absolute', left: 260 + coin * 980, top: 240, width: 110, height: 110, borderRadius: 55, background: `linear-gradient(135deg, ${C.mint}, #1FB884)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 44, color: C.navy, boxShadow: `0 0 50px ${C.mint}66`, opacity: 1 - cardsOut * 0.6 }}>$</div>
      <div style={{ position: 'absolute', left: 1400, top: 200, width: 190, height: 190, borderRadius: 40, border: `3px solid ${C.violet}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 60px ${C.violet}44`, opacity: 1 - cardsOut * 0.6 }}>
        <svg width="110" height="110" viewBox="0 0 34 34"><rect x="4" y="9" width="26" height="20" rx="6" fill="none" stroke={C.violet} strokeWidth="2" /><circle cx="13" cy="19" r="2.5" fill={C.violet} /><circle cx="21" cy="19" r="2.5" fill={C.violet} /><line x1="17" y1="3" x2="17" y2="9" stroke={C.violet} strokeWidth="2" /></svg>
        <div style={{ position: 'absolute', bottom: -44, fontFamily: MONO, fontSize: 20, color: C.violet }}>AI agent</div>
      </div>
      {[['Hand over your keys', kKeys, 300], ['Trust a promise', kPromise, 1000]].map(([txt, at, x]) => {
        const k = p((at as number) - 0.6, 0.5)
        const x2 = p(at as number, 0.3)
        return (
          <div key={txt as string} style={{ position: 'absolute', left: x as number, top: 500, width: 620, height: 230, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', opacity: k * (1 - cardsOut), transform: `translateY(${(1 - k) * 30}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 700 }}>
            {txt as string}
            <div style={{ position: 'absolute', right: -26, top: -36, width: 110, height: 110, borderRadius: 55, background: C.red, color: '#fff', fontSize: 70, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${interpolate(x2, [0, 1], [2.2, 1])}) rotate(-8deg)`, opacity: x2, boxShadow: `0 0 40px ${C.red}88` }}>✗</div>
          </div>
        )
      })}
      {['hallucinate', 'loop', 'prompt-injected'].map((w, i) => {
        const k = p(fl[i] - 0.05, 0.25)
        return <div key={w} style={{ position: 'absolute', left: 0, right: 0, top: 380 + i * 150, textAlign: 'center', fontWeight: 900, fontSize: 120, letterSpacing: -3, color: i === 2 ? C.orange : '#fff', opacity: k, transform: `scale(${1.25 - 0.25 * k})`, textShadow: `0 0 40px ${i === 2 ? C.orange : C.violet}55` }}>{w}</div>
      })}
      <div style={{ display: 'none' }}>{t}</div>
    </Bg>
  )
}

/* 3 — logo reveal */
export const S03 = ({ vo }: P) => {
  const { p, t } = useT()
  const pulse = t > 1.9 ? ((t - 1.9) % 1.4) / 1.4 : 0
  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ transform: `scale(${0.92 + 0.08 * p(0, 0.8)})`, opacity: p(0, 0.4) }}>
          <Logo size={300} rails={p(0.1, 0.7)} line={p(0.7, 1.0)} dot={p(1.6, 0.3)} pulse={pulse} />
        </div>
        <div style={{ fontWeight: 900, fontSize: 150, letterSpacing: -5, marginTop: 30, opacity: p(vo + 0.4, 0.6), transform: `translateY(${(1 - p(vo + 0.4, 0.6)) * 30}px)` }}>Mandate</div>
        <div style={{ fontWeight: 500, fontSize: 48, color: 'rgba(255,255,255,0.75)', marginTop: 6, opacity: p(vo + 1.3, 0.6) }}>
          Let agents trade. <span style={{ color: C.mint }}>Inside the lines.</span>
        </div>
      </AbsoluteFill>
    </Bg>
  )
}

/* 4 — the mandate (cream) */
export const S04 = ({ vo }: P) => {
  const { p } = useT()
  const ats = [/markets/i, /leverage/i, /big/i, /stop/i].map((r, i) => vo + wt('s04', r, 0, 3 + i))
  const never = vo + wt('s04', /never/i, 0, 10)
  const clauses = ['BTC & ETH only', 'up to 3x', '$25 per market', '−15% → reduce-only']
  const cols = [C.mint, C.violet, '#2BA8FF', C.orange]
  return (
    <Bg light>
      <Label text="THE MANDATE · FIXED ON CHAIN" light />
      <div style={{ position: 'absolute', left: 140, top: 190, fontSize: 40, fontWeight: 600, color: 'rgba(11,21,48,0.55)', opacity: p(vo, 0.5) }}>This vault's leader can trade…</div>
      <div style={{ position: 'absolute', left: 140, top: 270, display: 'flex', flexWrap: 'wrap', gap: 26, width: 1640 }}>
        {clauses.map((c, i) => {
          const k = p(ats[i] - 0.1, 0.4)
          return (
            <div key={c} style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, padding: '18px 34px', borderRadius: 22, background: k > 0 ? `rgba(11,21,48,${0.9 * k})` : 'rgba(11,21,48,0.06)', color: k > 0.5 ? cols[i] : 'rgba(11,21,48,0.3)', transform: `scale(${0.96 + 0.04 * k})`, boxShadow: k > 0 ? `0 14px 40px rgba(11,21,48,${0.25 * k})` : 'none' }}>{c}</div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 140, top: 700, fontSize: 110, fontWeight: 900, letterSpacing: -3.5, color: C.ink, opacity: p(never - 0.15, 0.2), transform: `scale(${interpolate(p(never - 0.15, 0.3), [0, 1], [1.35, 1])})`, transformOrigin: 'left center' }}>
        The leader <span style={{ color: C.orange }}>cannot withdraw.</span>
      </div>
    </Bg>
  )
}

/* 5 — live site */
export const S05 = ({ vo, len }: P) => {
  const split = vo + wt('s05', /Depositors/i, 0, 4) - 0.3
  return (
    <Bg>
      <Label text="LIVE SITE · SOMNIA TOKYO TESTNET" />
      <Shot k="A" from={0} to={split} keys={[{ at: 0, zoom: 1 }, { at: 1.2, box: { x: 380, y: 438, w: 1180, h: 66 }, zoom: 1.35, hl: true, note: 'the mandate, on chain' }]} />
      <Shot k="B" from={split} to={len} keys={[
        { at: 0, box: 'nav', zoom: 1 },
        { at: 0.6, box: { x: 380, y: 180, w: 1160, h: 170 }, zoom: 1.25, hl: true, note: 'NAV · read from chain' },
        { at: 3.2, box: 'sentence', zoom: 1.2, hl: true },
        { at: 5.6, box: 'refused', zoom: 1.05, hl: true, note: 'refused orders shown' },
      ]} />
    </Bg>
  )
}

/* 6 — code */
const CODE = `function trade(address pool, bool isBid, uint256 price, uint256 quantity, uint8 orderType)
    external onlyLeader nonReentrant returns (uint128 orderId)
{
    if (!isAllowedPool[pool]) revert MarketNotAllowed();
    if (quantity == 0) revert ZeroAmount();
    uint256 navNow = _checkpoint(true);

    IPerpPool.ReducingCapacity memory cap = IPerpPool(pool).getReducingCapacity(address(this));
    bool reducing = _isReducing(cap, isBid, quantity);
    if (reduceOnly && !reducing) revert ReduceOnly();

    uint256 poolNotional;
    uint256 total;
    if (!reducing) {
        // Worst case after this order: position + every same-side resting order filling at mark.
        poolNotional = _worstCaseNotional(pool, isBid, quantity);
        if (poolNotional > maxNotionalPerPool) revert NotionalCapExceeded(poolNotional, maxNotionalPerPool);
        total = poolNotional;
        for (uint256 i; i < _allowedPools.length; ++i) {
            if (_allowedPools[i] != pool) total += _worstCaseNotional(_allowedPools[i], false, 0);
        }
        if (total * 100 > maxLeverageX1e2 * navNow) revert LeverageCapExceeded(total, navNow, maxLeverageX1e2);
    }

    orderId = _place(pool, isBid, price, quantity, orderType);
}`
export const S06 = ({ vo }: P) => {
  const { p, t } = useT()
  const lines = CODE.split('\n')
  // highlight order synced to: market → size → leverage → (order book) reduce-only
  const hl: [number, number][] = [
    [3, vo + wt('s06', /market/i, 0, 3)],
    [16, vo + wt('s06', /size/i, 0, 4)],
    [21, vo + wt('s06', /leverage/i, 0, 5)],
    [9, vo + wt('s06', /order/i, 1, 8)],
  ]
  const activeIdx = hl.reduce((acc, [, at], i) => (t >= at - 0.1 ? i : acc), -1)
  const tok = (s: string) => s
    .replace(/(revert \w+)/g, '§r$1§e')
    .replace(/\b(function|external|returns|if|for|memory|bool|uint256|uint128|uint8|address)\b/g, '§k$1§e')
  return (
    <Bg>
      <Label text="MANDATEVAULT.SOL · TRADE()" />
      <div style={{ position: 'absolute', left: 120, top: 120, width: 1680, height: 820, borderRadius: 20, background: 'rgba(5,9,22,0.85)', border: '1px solid rgba(255,255,255,0.08)', padding: '30px 36px', fontFamily: MONO, fontSize: 21.5, lineHeight: '30px', opacity: p(0, 0.5), transform: `translateY(${(1 - p(0, 0.5)) * 20}px)`, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        {lines.map((l, i) => {
          const hi = hl.findIndex(([n]) => n === i)
          const on = hi >= 0 && hi <= activeIdx
          const isNow = hi >= 0 && hi === activeIdx
          const parts = tok(l).split('§')
          return (
            <div key={i} style={{ whiteSpace: 'pre', position: 'relative', color: 'rgba(220,228,255,0.78)', background: on ? `rgba(255,107,44,${isNow ? 0.18 : 0.08})` : 'transparent', borderLeft: on ? `4px solid ${C.orange}` : '4px solid transparent', paddingLeft: 12, marginLeft: -16, opacity: activeIdx >= 0 && !on && l.trim() ? 0.55 : 1 }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', display: 'inline-block', width: 46 }}>{i + 1}</span>
              {parts.map((s, j) => {
                const c = s[0], body = s.slice(1)
                if (j === 0) return <span key={j}>{s}</span>
                if (c === 'r') return <span key={j} style={{ color: on ? C.orange : '#FF8FA0', fontWeight: 700 }}>{body}</span>
                if (c === 'k') return <span key={j} style={{ color: C.violet }}>{body}</span>
                return <span key={j}>{body}</span>
              })}
            </div>
          )
        })}
      </div>
    </Bg>
  )
}

/* 7 — refused on chain */
export const S07 = ({ vo, len }: P) => {
  const split = vo + wt('s07', /thirty/i, 0, 6) - 0.5
  const rev1 = vo + wt('s07', /Reverted/i, 0, 4)
  const rev2 = vo + wt('s07', /Refused/i, 0, 11)
  return (
    <Bg>
      <Label text="ON CHAIN · REFUSED" />
      <Shot k="D" from={0} to={split} keys={[{ at: 0, zoom: 1 }, { at: 1.0, box: SB, zoom: 1.5, hl: true, note: 'status: failed' }, { at: rev1 - 1.4, box: 'revert', zoom: 1.4, hl: true, note: '0x6f538c72' }]} />
      <Shot k="E" from={split} to={len} keys={[{ at: 0, zoom: 1 }, { at: 0.8, box: SB, zoom: 1.5, hl: true, note: 'status: failed' }, { at: 2.6, box: 'revert', zoom: 1.35, hl: true }]} />
      {useT().t < split && <Stamp at={rev1} text="REVERTED ON CHAIN" sub="MarketNotAllowed()" y={560} />}
      <Stamp at={rev2} text="REVERTED ON CHAIN" sub="NotionalCapExceeded · $32 vs $25 cap" y={560} />
    </Bg>
  )
}

/* 8 — AI leader journal */
export const S08 = ({ vo, len }: P) => {
  const { p, t } = useT()
  const statsAt = vo + wt('s08', /Eight/i, 0, 11) - 0.3
  const J = journal as { k: string; t: string }[]
  const per = (statsAt - 0.6) / J.length
  const n = (target: number, at: number) => Math.round(target * p(at, 0.9))
  return (
    <Bg>
      <Label text="AI LEADER · LIVE RUN" />
      <div style={{ position: 'absolute', left: 120, top: 130, width: 1680, height: 560, borderRadius: 20, background: 'rgba(5,9,22,0.85)', border: '1px solid rgba(255,255,255,0.08)', padding: '22px 30px', fontFamily: MONO, fontSize: 25, lineHeight: '40px', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>$ tail agent/journal.jsonl   # vault 0x1F3c…D2eF · BTC/ETH · 3x · $25/market</div>
        {J.map((j, i) => {
          const at = 0.4 + i * per
          if (t < at) return null
          const chars = Math.floor((t - at) * 90)
          const ref = j.k === 'ref'
          return <div key={i} style={{ whiteSpace: 'pre', color: ref ? C.orange : 'rgba(220,228,255,0.85)', fontWeight: ref ? 700 : 400 }}>{ref ? '⛔ ' : '✓  '}{j.t.slice(0, chars)}</div>
        })}
      </div>
      <div style={{ position: 'absolute', left: 120, top: 730, display: 'flex', gap: 30 }}>
        {[[`${n(8, statsAt)}`, 'orders, all via vault.trade()', C.mint], [`${n(3, statsAt + 0.3)}`, 'refusals · sized down', C.orange], ['flat', 'ended flat and up · NAV 27.50 → 27.57', C.violet]].map(([big, small, col], i) => {
          const k = p(statsAt + i * 0.3, 0.5)
          return (
            <div key={i} style={{ width: 540, height: 170, borderRadius: 22, background: 'rgba(255,255,255,0.06)', border: `1px solid ${col}55`, padding: '20px 30px', opacity: k, transform: `translateY(${(1 - k) * 30}px)` }}>
              <div style={{ fontSize: 76, fontWeight: 900, color: col as string, letterSpacing: -2, lineHeight: 1 }}>{big}</div>
              <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.75)', marginTop: 12 }}>{small}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'none' }}>{len}</div>
    </Bg>
  )
}

/* 9 — reactivity */
export const S09 = ({ vo, len }: P) => {
  const { p, t } = useT()
  const fAt = vo + wt('s09', /Reduce/i, 0, 7) - 0.2
  const gAt = vo + wt('s09', /next/i, 0, 13) - 0.6
  const rev = vo + wt('s09', /Reverted/i, 0, 15)
  const steps = ['Fill', 'PositionUpdated', 'Somnia Reactivity', 'MandateGuard', 'Reduce-only', 'Position closed']
  const flowOut = interpolate(t, [fAt - 0.3, fAt + 0.1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <Bg>
      <Label text="SOMNIA REACTIVITY · SAME BLOCK" />
      <div style={{ opacity: flowOut }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0 }}>
          {steps.map((s, i) => {
            const k = p(vo + 0.3 + i * 0.55, 0.45)
            const col = i === 2 ? C.violet : i >= 4 ? C.orange : C.mint
            return (
              <React.Fragment key={s}>
                {i > 0 && <div style={{ width: 46, height: 4, background: `linear-gradient(90deg, rgba(255,255,255,0.15), ${col})`, transform: `scaleX(${k})`, transformOrigin: 'left' }} />}
                <div style={{ padding: '24px 22px', borderRadius: 18, border: `2px solid ${col}`, background: `${col}14`, fontWeight: 700, fontSize: 30, opacity: k, transform: `translateY(${(1 - k) * 20}px)`, boxShadow: `0 0 30px ${col}33`, whiteSpace: 'nowrap' }}>{s}</div>
              </React.Fragment>
            )
          })}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 500, textAlign: 'center', opacity: p(vo + 3.6, 0.5) }}>
          <span style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: C.navy, background: C.mint, padding: '14px 30px', borderRadius: 40 }}>same block · 50,505,949</span>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 640, textAlign: 'center', fontSize: 40, color: 'rgba(255,255,255,0.7)', opacity: p(vo + 4.2, 0.5) }}>No keeper. No bot. The chain calls the guard.</div>
      </div>
      <Shot k="F" from={fAt} to={gAt} keys={[{ at: 0, zoom: 1 }, { at: 0.6, box: 'block', zoom: 1.55, hl: true, note: 'block 50,505,949' }, { at: 2.4, box: 'to', zoom: 1.4, hl: true, note: 'to: MandateGuard' }]} />
      <Shot k="G" from={gAt} to={len} keys={[{ at: 0, zoom: 1 }, { at: 0.6, box: SB, zoom: 1.5, hl: true, note: 'status: failed' }]} />
      <Stamp at={rev} text="REVERTED ON CHAIN" sub="ReduceOnly()" y={560} />
    </Bg>
  )
}

/* 11 — outro */
export const S11 = ({ vo, len }: P) => {
  const { p, t } = useT()
  const lineAt = vo + 0.2
  const logoAt = vo + wt('s11', /Mandate/i, 0, 10) - 0.2
  const tiles = [['41', 'tests passing'], ['30+', 'live transactions'], ['same-block', 'Reactivity'], ['mainnet', 'at launch']]
  const end = interpolate(t, [len - 1.6, len - 0.1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const tilesOut = 1 - p(logoAt - 0.3, 0.5)
  return (
    <Bg>
      <AbsoluteFill style={{ opacity: end }}>
        <Label text="MANDATE · BUILT ON DREAMDEX" />
        <div style={{ opacity: tilesOut }}>
          <div style={{ position: 'absolute', left: 120, top: 200, display: 'flex', gap: 28 }}>
            {tiles.map(([b, s], i) => {
              const k = p(0.2 + i * 0.25, 0.45)
              return (
                <div key={b} style={{ width: 400, height: 220, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '30px 34px', opacity: k, transform: `scale(${0.85 + 0.15 * k})` }}>
                  <div style={{ fontSize: b.length > 6 ? 62 : 96, fontWeight: 900, letterSpacing: -3, color: [C.mint, C.violet, C.orange, '#fff'][i], lineHeight: 1.05 }}>{b}</div>
                  <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.7)', marginTop: 14 }}>{s}</div>
                </div>
              )
            })}
          </div>
          <div style={{ position: 'absolute', left: 120, top: 520, fontSize: 50, fontWeight: 700, opacity: p(lineAt, 0.6), letterSpacing: -1 }}>
            Leaders earn on <span style={{ color: C.mint }}>new highs</span> · the app earns a <span style={{ color: C.orange }}>builder fee</span> on every order
          </div>
        </div>
        {/* rails extending across the screen */}
        {[380, 700].map((y) => <div key={y} style={{ position: 'absolute', left: 0, top: y, height: 4, width: 1920 * p(logoAt, 1.4), background: 'linear-gradient(90deg, transparent, #55607E 20%, #55607E 80%, transparent)', opacity: 0.7 }} />)}
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', opacity: p(logoAt, 0.6) }}>
          <Logo size={200} pulse={t > logoAt + 1 ? ((t - logoAt - 1) % 1.6) / 1.6 : 0} />
          <div style={{ fontWeight: 900, fontSize: 110, letterSpacing: -4, marginTop: 10 }}>Mandate</div>
          <div style={{ fontSize: 40, color: 'rgba(255,255,255,0.75)' }}>Let agents trade. <span style={{ color: C.mint }}>Inside the lines.</span></div>
          <div style={{ marginTop: 40, fontFamily: MONO, fontSize: 30, color: 'rgba(255,255,255,0.8)', display: 'flex', gap: 50, opacity: p(logoAt + 0.8, 0.6) }}>
            <span>github.com/SohamJuneja/mandate</span><span style={{ color: C.mint }}>sohamjuneja.github.io/mandate</span>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </Bg>
  )
}
