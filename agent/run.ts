// Autonomous leader bot. Trades ONLY through vault.trade(). Funding + momentum on BTC/ETH.
//
//   npx tsx agent/run.ts [--minutes 15] [--max-orders 8] [--dry]
//
// Each cycle, per market:
//   momentum  = (mark_now − mark_lookback) / mark_lookback   (bps over LOOKBACK samples)
//   funding   = current funding rate (bps per 8h); positive ⇒ longs pay ⇒ lean short
//   score     = momentum − 0.5 × funding
//   target    = +1 (long) if score > +TH, −1 (short) if score < −TH, else 0 (flat)
// Moving to a target is one order per cycle: close first, open on a later cycle.
// Size = minQty × k, k = 1 + ⌊|score| / TH⌋ capped at 4. The full size is pre-checked first; if the
// mandate refuses, the refusal is journaled and the size is cut to what fits.
// The run ends after --minutes or --max-orders (flattening orders included), then goes flat.
import { addEvidence } from "../scripts/vaultlib.ts";
import { assertChain, usd } from "../scripts/lib.ts";
import { MARKETS, execute, exposure, fmtProposal, fundingRateBps8h, getMandate, getVault, journal, propose, vaultAddress, type Market } from "./leader.ts";
import { book, mark } from "../scripts/vaultlib.ts";
import { formatUnits } from "viem";

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? d : process.argv[i + 1];
};
const MINUTES = Number(arg("--minutes", "15"));
const MAX_ORDERS = Number(arg("--max-orders", "8"));
const DRY = process.argv.includes("--dry");
const SAMPLE_MS = 15_000;
const LOOKBACK = 4; // samples → 1 minute
const TH_BPS = 2;
const MAX_K = 4;

const hist: Record<string, { t: number; m: number }[]> = { BTC: [], ETH: [] };
let sent = 0;
const started = Date.now();
const vault = vaultAddress();

async function sample() {
  for (const mk of Object.keys(MARKETS)) {
    const m = Number(await mark(MARKETS[mk])) / 1e18;
    hist[mk].push({ t: Date.now(), m });
    if (hist[mk].length > 40) hist[mk].shift();
  }
}

async function signal(mk: Market) {
  const h = hist[mk];
  if (h.length <= LOOKBACK) return null;
  const now = h[h.length - 1].m;
  const then = h[h.length - 1 - LOOKBACK].m;
  const momentumBps = ((now - then) / then) * 1e4;
  const fundingBps = await fundingRateBps8h(MARKETS[mk]);
  const score = momentumBps - 0.5 * fundingBps;
  const target = score > TH_BPS ? 1 : score < -TH_BPS ? -1 : 0;
  return { momentumBps: +momentumBps.toFixed(3), fundingBps8h: +fundingBps.toFixed(3), score: +score.toFixed(3), target, mark: now };
}

async function send(mk: Market, side: "buy" | "sell", qtyUnits: bigint, why: string, sig: unknown) {
  const ob = 10n ** BigInt(mk === "BTC" ? 8 : 18);
  const quantity = formatUnits(qtyUnits, ob.toString().length - 1);
  const p = await propose({ market: mk, side, quantity, orderType: "ioc" }, vault);
  journal({ kind: "intent", market: mk, why, signal: sig, proposal: fmtProposal(p) });
  if (!p.wouldPass) {
    journal({ kind: "precheck_refused", market: mk, why, reason: p.simulation.error ?? p.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("; ") });
    console.log(`  ⛔ ${mk} ${side} ${quantity}: pre-check refused (${p.simulation.error ?? "mandate check"})`);
    return null;
  }
  if (DRY) {
    journal({ kind: "dry_run", market: mk, side, quantity });
    console.log(`  (dry) would ${side} ${quantity} ${mk}`);
    return null;
  }
  const before = await getVault(vault);
  const r = await execute(p, vault, true);
  sent++;
  const after = await getVault(vault);
  journal({ kind: "sent", market: mk, side, quantity, why, tx: r.hash, link: r.link, orderId: r.orderId, navBefore: before.navUsd, navAfter: after.navUsd });
  console.log(`  ✅ ${mk} ${side} ${quantity} (${why}) → ${r.link}`);
  addEvidence({
    phase: "3",
    step: `Agent ${side} ${quantity} ${mk} (${why})`,
    proves: "AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending",
    hash: r.hash,
    status: "success",
    before: `NAV ${before.navUsd} · pps ${before.pricePerShare} · pos ${before.positions.map((x) => `${x.market} ${x.size}`).join(", ")}`,
    after: `NAV ${after.navUsd} · pps ${after.pricePerShare} · pos ${after.positions.map((x) => `${x.market} ${x.size}`).join(", ")}`,
  });
  return r;
}

/** Choose the largest k ≤ want whose order passes the mandate, journaling the refusal of `want`. */
async function openSized(mk: Market, side: "buy" | "sell", want: number, sig: unknown) {
  const { minQty } = await book(MARKETS[mk]);
  for (let k = want; k >= 1; k--) {
    const qty = minQty * BigInt(k);
    const ob = mk === "BTC" ? 8 : 18;
    const p = await propose({ market: mk, side, quantity: formatUnits(qty, ob), orderType: "ioc" }, vault);
    if (p.wouldPass) {
      if (k < want) journal({ kind: "resized", market: mk, from: want, to: k, reason: "largest size inside the mandate" });
      return send(mk, side, qty, `open ${side === "buy" ? "long" : "short"} ×${k}`, sig);
    }
    journal({ kind: "precheck_refused", market: mk, side, k, reason: p.simulation.error ?? p.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("; ") });
    console.log(`  ⛔ ${mk} ×${k}: ${p.simulation.error ?? "mandate check"} → trying smaller`);
  }
  return null;
}

async function flatten(reason: string) {
  for (const mk of Object.keys(MARKETS) as Market[]) {
    const e = await exposure(vault, MARKETS[mk]);
    if (e.position === 0n) continue;
    const side = e.position > 0n ? "sell" : "buy";
    await send(mk, side, e.position > 0n ? e.position : -e.position, reason, null);
  }
}

async function openPositions() {
  let n = 0;
  for (const mk of Object.keys(MARKETS)) if ((await exposure(vault, MARKETS[mk])).position !== 0n) n++;
  return n;
}

async function main() {
  await assertChain();
  const m = await getMandate(vault);
  console.log(`agent leading ${vault} · NAV ${m.navUsd} · markets ${m.allowedMarkets.join("/")} · ${m.maxLeverage}x · cap ${m.maxNotionalPerMarketUsd}/market · ${MINUTES} min / ${MAX_ORDERS} orders${DRY ? " · DRY" : ""}`);
  journal({ kind: "start", vault, minutes: MINUTES, maxOrders: MAX_ORDERS, dry: DRY, mandate: { ...m, _raw: undefined } });

  let cycle = 0;
  while (Date.now() - started < MINUTES * 60_000) {
    await sample().catch((e) => journal({ kind: "error", where: "sample", error: String(e) }));
    cycle++;
    if (cycle % LOOKBACK === 0) {
      for (const mk of Object.keys(MARKETS) as Market[]) {
        try {
          const sig = await signal(mk);
          if (!sig) continue;
          const e = await exposure(vault, MARKETS[mk]);
          const current = e.position > 0n ? 1 : e.position < 0n ? -1 : 0;
          journal({ kind: "signal", market: mk, ...sig, current, position: e.position });
          console.log(`[${new Date().toISOString().slice(11, 19)}] ${mk} mom ${sig.momentumBps}bp fund ${sig.fundingBps8h}bp/8h score ${sig.score} → target ${sig.target} (now ${current})`);
          if (sig.target === current) continue;
          // Budget: keep enough orders to flatten everything at the end.
          const willHold = (await openPositions()) + (current === 0 ? 1 : 0);
          if (current !== 0) {
            if (sent + 1 + (willHold - 1) > MAX_ORDERS) continue;
            await send(mk, current > 0 ? "sell" : "buy", current > 0 ? e.position : -e.position, `close (target ${sig.target})`, sig);
          } else {
            if (sent + 1 + willHold > MAX_ORDERS) {
              journal({ kind: "skip", market: mk, reason: "order budget reserved for flattening" });
              continue;
            }
            const k = Math.min(MAX_K, 1 + Math.floor(Math.abs(sig.score) / TH_BPS));
            await openSized(mk, sig.target > 0 ? "buy" : "sell", k, sig);
          }
        } catch (err) {
          journal({ kind: "error", market: mk, error: String((err as Error).message ?? err) });
          console.log(`  ! ${mk}: ${(err as Error).message}`);
        }
      }
    }
    if (sent >= MAX_ORDERS) break;
    await new Promise((r) => setTimeout(r, SAMPLE_MS));
  }
  console.log("time/budget reached → flattening");
  await flatten("end of run: flatten");
  const v = await getVault(vault);
  journal({ kind: "end", ordersSent: sent, nav: v.navUsd, pps: v.pricePerShare, positions: v.positions });
  console.log(`done · ${sent} orders · NAV ${v.navUsd} · pps ${v.pricePerShare} · ${v.positions.map((p) => `${p.market} ${p.size}`).join(", ")}`);
  process.exit(0);
}

main().catch(async (e) => {
  console.error("fatal:", e);
  journal({ kind: "fatal", error: String(e?.message ?? e) });
  try {
    await flatten("fatal: flatten");
  } catch {}
  process.exit(1);
});
