// Leader-agent core: read the vault and its mandate, propose a trade (mandate pre-check + eth_call
// simulation), execute ONLY through vault.trade(), cancel, and journal every decision.
// Used by agent/run.ts (autonomous loop) and agent/mcp.ts (MCP server for any AI agent).
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { encodeFunctionData, formatUnits, parseUnits, type Address, type Hex } from "viem";
import {
  BTC_POOL,
  ETH_POOL,
  MARGIN_BANK,
  ORDER_GAS,
  ROOT,
  RevertError,
  assertChain,
  bankAbi,
  decodeRevertName,
  key,
  link,
  poolAbi,
  pub,
  send,
  simulate,
  usd,
} from "../scripts/lib.ts";
import { book, loadDeployments, mark, roundTick, snapshot, tradeData, vaultAbi } from "../scripts/vaultlib.ts";

export const MARKETS: Record<string, Address> = { BTC: BTC_POOL, ETH: ETH_POOL };
export type Market = keyof typeof MARKETS & string;
export const ORDER_TYPES = { limit: 0, fok: 1, ioc: 2, postOnly: 3 } as const;
export type OrderTypeName = keyof typeof ORDER_TYPES;

const JOURNAL = resolve(ROOT, "agent", "journal.jsonl");
export function journal(entry: Record<string, unknown>) {
  mkdirSync(dirname(JOURNAL), { recursive: true });
  appendFileSync(JOURNAL, JSON.stringify({ ts: new Date().toISOString(), ...entry }, (_, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");
}

export function vaultAddress(): Address {
  const env = process.env.VAULT_ADDRESS as Address | undefined;
  if (env) return env;
  const v = loadDeployments().vaults.main?.address;
  if (!v) throw new Error("no vault: set VAULT_ADDRESS or run scripts/phase2.ts");
  return v;
}
export const leaderAccount = () => key(process.env.LEADER_KEY_ENV ?? "OPERATOR_PRIVATE_KEY");

const oneBaseCache = new Map<Address, bigint>();
async function oneBase(pool: Address): Promise<bigint> {
  if (!oneBaseCache.has(pool)) oneBaseCache.set(pool, await pub.readContract({ address: pool, abi: poolAbi, functionName: "getOneBase" }));
  return oneBaseCache.get(pool)!;
}
const decimalsOf = (ob: bigint) => ob.toString().length - 1;

export async function collateral(): Promise<Address> {
  const c = await pub.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "getSystemConfig" });
  return c.collateralToken;
}

// ---------------------------------------------------------------- reads
export async function getMandate(vault = vaultAddress()) {
  const m = (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "mandate" })) as any;
  const [leader, reduceOnly] = await Promise.all([
    pub.readContract({ address: vault, abi: vaultAbi, functionName: "leader" }) as Promise<Address>,
    pub.readContract({ address: vault, abi: vaultAbi, functionName: "reduceOnly" }) as Promise<boolean>,
  ]);
  const snap = await snapshot(vault, await collateral());
  const exposures = await Promise.all((m.allowedPools as Address[]).map((p) => exposure(vault, p)));
  const total = exposures.reduce((a, e) => a + e.worstCaseNotional, 0n);
  const levCap = (BigInt(m.maxLeverageX1e2) * snap.nav) / 100n;
  return {
    vault,
    leader,
    reduceOnly,
    allowedMarkets: exposures.map((e) => e.market),
    maxLeverage: Number(m.maxLeverageX1e2) / 100,
    maxNotionalPerMarketUsd: usd(BigInt(m.maxNotionalPerPool)),
    drawdownPct: Number(m.drawdownBps) / 100,
    perfFeePct: Number(m.perfFeeBps) / 100,
    leaderMinSharePct: Number(m.leaderMinShareBps) / 100,
    lockSeconds: Number(m.lockSeconds),
    builder: m.builder as Address,
    builderFeeBps: Number(m.builderFeeBpsTimes1k) / 1000,
    navUsd: usd(snap.nav),
    leverageHeadroomUsd: usd(levCap > total ? levCap - total : 0n),
    perMarket: exposures.map((e) => ({
      market: e.market,
      worstCaseNotionalUsd: usd(e.worstCaseNotional),
      headroomUsd: usd(BigInt(m.maxNotionalPerPool) > e.worstCaseNotional ? BigInt(m.maxNotionalPerPool) - e.worstCaseNotional : 0n),
    })),
    _raw: { maxNotionalPerPool: BigInt(m.maxNotionalPerPool), maxLeverageX1e2: BigInt(m.maxLeverageX1e2), nav: snap.nav, total, levCap },
  };
}

const marketOf = (pool: Address) => Object.entries(MARKETS).find(([, p]) => p.toLowerCase() === pool.toLowerCase())?.[0] ?? pool;

/** Mirror of MandateVault._worstCaseNotional, optionally with one extra order. */
export async function exposure(vault: Address, pool: Address, extra?: { isBid: boolean; qty: bigint }) {
  const [cap, m, ob] = await Promise.all([
    pub.readContract({ address: pool, abi: poolAbi, functionName: "getReducingCapacity", args: [vault] }),
    mark(pool),
    oneBase(pool),
  ]);
  const pos = BigInt(cap.positionSize);
  const longExp = pos + cap.pendingBidQuantity + (extra?.isBid ? extra.qty : 0n);
  const shortExp = -pos + cap.pendingAskQuantity + (extra && !extra.isBid ? extra.qty : 0n);
  const worst = longExp > shortExp ? longExp : shortExp;
  return {
    market: marketOf(pool),
    pool,
    position: pos,
    mark: m,
    oneBase: ob,
    reducingCapacity: cap.effectiveReducingCapacity,
    worstCaseNotional: worst > 0n ? (worst * m) / ob : 0n,
  };
}

export async function getVault(vault = vaultAddress()) {
  const c = await collateral();
  const s = await snapshot(vault, c);
  const [name, supply] = await Promise.all([
    pub.readContract({ address: vault, abi: vaultAbi, functionName: "name" }) as Promise<string>,
    pub.readContract({ address: vault, abi: vaultAbi, functionName: "totalSupply" }) as Promise<bigint>,
  ]);
  const positions = await Promise.all(
    s.positions.map(async (p) => {
      const ob = await oneBase(p.pool);
      const m = await mark(p.pool);
      return {
        market: marketOf(p.pool),
        size: formatUnits(p.size, decimalsOf(ob)),
        entryPrice: usd(p.entry, 2),
        markPrice: usd(m, 2),
        unrealizedPnlUsd: usd((p.size * (m - p.entry)) / ob, 6),
      };
    }),
  );
  return {
    vault,
    name,
    block: s.block.toString(),
    navUsd: usd(s.nav, 6),
    pricePerShare: usd(s.pps, 6),
    highWaterMark: usd(s.hwm, 6),
    sharesOutstanding: usd(supply, 6),
    reduceOnly: s.reduceOnly,
    bankFreeUsd: usd(s.unlocked, 6),
    bankLockedUsd: usd(s.locked, 6),
    walletUsd: usd(s.wallet, 6),
    positions,
  };
}

// ---------------------------------------------------------------- propose / execute
export type TradeRequest = {
  market: Market;
  side: "buy" | "sell";
  /** Base quantity in human units ("0.00013"); defaults to the market's minimum size. */
  quantity?: string;
  orderType?: OrderTypeName;
  /** Limit price in USD; defaults to a marketable price (mark ± 2%) for IOC/FOK, mark ∓ 3% for resting. */
  price?: string;
};

export type Proposal = {
  request: TradeRequest;
  pool: Address;
  isBid: boolean;
  qty: bigint;
  price: bigint;
  orderType: number;
  reducing: boolean;
  worstCaseNotional: bigint;
  totalNotional: bigint;
  checks: { name: string; ok: boolean; detail: string }[];
  simulation: { ok: boolean; error?: string; errorName?: string };
  wouldPass: boolean;
};

export async function propose(req: TradeRequest, vault = vaultAddress()): Promise<Proposal> {
  const pool = MARKETS[req.market];
  if (!pool) throw new Error(`unknown market ${req.market}; allowed: ${Object.keys(MARKETS).join(", ")}`);
  const isBid = req.side === "buy";
  const orderType = ORDER_TYPES[req.orderType ?? "ioc"];
  const [b, ob, m] = await Promise.all([book(pool), oneBase(pool), mark(pool)]);
  const qty = req.quantity ? parseUnits(req.quantity, decimalsOf(ob)) : b.minQty;
  let price: bigint;
  if (req.price) price = roundTick(parseUnits(req.price, 18), b.tick, !isBid);
  else if (orderType === 1 || orderType === 2) price = roundTick(isBid ? (m * 10_200n) / 10_000n : (m * 9_800n) / 10_000n, b.tick, isBid);
  else price = roundTick(isBid ? (m * 9_700n) / 10_000n : (m * 10_300n) / 10_000n, b.tick, !isBid);

  const mandate = await getMandate(vault);
  const here = await exposure(vault, pool, { isBid, qty });
  const opposite = here.position !== 0n && (here.position > 0n ? !isBid : isBid);
  const reducing = opposite && qty <= here.reducingCapacity;
  const others = await Promise.all(Object.values(MARKETS).filter((p) => p !== pool).map((p) => exposure(vault, p)));
  const total = here.worstCaseNotional + others.reduce((a, e) => a + e.worstCaseNotional, 0n);

  const checks = [
    { name: "market allowed", ok: mandate.allowedMarkets.includes(req.market), detail: mandate.allowedMarkets.join(", ") },
    { name: "size on lot grid", ok: qty >= b.minQty && qty % b.lot === 0n, detail: `min ${b.minQty}, lot ${b.lot}, got ${qty}` },
    { name: "reduce-only", ok: !mandate.reduceOnly || reducing, detail: mandate.reduceOnly ? (reducing ? "reducing: allowed" : "vault is reduce-only") : "not breached" },
    { name: "per-market notional cap", ok: reducing || here.worstCaseNotional <= mandate._raw.maxNotionalPerPool, detail: `${usd(here.worstCaseNotional)} vs cap ${usd(mandate._raw.maxNotionalPerPool)}` },
    { name: "leverage cap", ok: reducing || total * 100n <= mandate._raw.maxLeverageX1e2 * mandate._raw.nav, detail: `${usd(total)} vs ${usd(mandate._raw.levCap)} (${mandate.maxLeverage}x × NAV ${usd(mandate._raw.nav)})` },
  ];

  let simulation: Proposal["simulation"] = { ok: true };
  try {
    await simulate("propose", leaderAccount().address, { to: vault, data: tradeData(pool, isBid, price, qty, orderType), gas: ORDER_GAS });
  } catch (e) {
    if (!(e instanceof RevertError)) throw e;
    const d = decodeRevertName(e.data);
    simulation = { ok: false, errorName: d.name, error: d.name ? `${d.name}(${d.args})` : `revert ${e.data}` };
  }
  return { request: req, pool, isBid, qty, price, orderType, reducing, worstCaseNotional: here.worstCaseNotional, totalNotional: total, checks, simulation, wouldPass: simulation.ok && checks.every((c) => c.ok) };
}

export async function execute(p: Proposal, vault = vaultAddress(), quiet = false): Promise<{ hash: Hex; link: string; orderId?: string }> {
  if (!p.wouldPass) throw new Error(`refusing to send: pre-check failed (${p.simulation.error ?? p.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")})`);
  await assertChain();
  const { hash, receipt } = await send(
    `leader → vault.trade(${p.request.market}, ${p.isBid ? "BUY" : "SELL"}, ${p.qty}, type ${p.orderType})`,
    leaderAccount(),
    { to: vault, gas: ORDER_GAS, data: tradeData(p.pool, p.isBid, p.price, p.qty, p.orderType) },
    { quiet },
  );
  // Traded(pool indexed, ..., orderId, ...) — read the id from the vault's own event.
  let orderId: string | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue;
    try {
      const { decodeEventLog } = await import("viem");
      const ev = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics as any }) as any;
      if (ev.eventName === "Traded") orderId = String(ev.args.orderId);
    } catch {
      /* other vault event */
    }
  }
  return { hash, link: link(hash), orderId };
}

export async function cancel(market: Market, orderIds?: string[], vault = vaultAddress(), quiet = false) {
  const pool = MARKETS[market];
  const data = orderIds?.length
    ? encodeFunctionData({ abi: vaultAbi, functionName: "cancel", args: [pool, orderIds.map((x) => BigInt(x))] })
    : encodeFunctionData({ abi: vaultAbi, functionName: "cancelAll", args: [pool] });
  const { hash } = await send(`leader → vault.${orderIds?.length ? "cancel" : "cancelAll"}(${market})`, leaderAccount(), { to: vault, gas: ORDER_GAS, data }, { quiet });
  return { hash, link: link(hash) };
}

export async function fundingRateBps8h(pool: Address): Promise<number> {
  const r = await pub.readContract({ address: pool, abi: poolAbi, functionName: "getCurrentFundingRate" });
  return Number(r) / 1e14; // 1e18-scaled per 8h window → bps
}

export const fmtProposal = (p: Proposal) => ({
  market: p.request.market,
  side: p.request.side,
  quantity: p.qty.toString(),
  price: usd(p.price, 2),
  orderType: p.orderType,
  reducing: p.reducing,
  worstCaseNotionalUsd: usd(p.worstCaseNotional),
  totalNotionalUsd: usd(p.totalNotional),
  checks: p.checks,
  simulation: p.simulation,
  wouldPass: p.wouldPass,
});
