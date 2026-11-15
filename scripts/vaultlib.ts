// Vault-level helpers shared by the Phase 2 script, the agent and the keeper.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { BTC_POOL, ETH_POOL, MARGIN_BANK, ROOT, artifact, bankAbi, erc20Abi, poolAbi, pub, registerErrors, usd } from "./lib.ts";

export const vaultArt = artifact("MandateVault");
export const factoryArt = artifact("MandateFactory");
registerErrors(vaultArt.abi);
registerErrors(factoryArt.abi);
export const vaultAbi = vaultArt.abi as Abi;
export const factoryAbi = factoryArt.abi as Abi;

export const POOL_NAME: Record<string, string> = {
  [BTC_POOL.toLowerCase()]: "BTC",
  [ETH_POOL.toLowerCase()]: "ETH",
  "0xb483ec1fb34996638677c20ab087b16f1896fa53": "SOL",
};
export const poolName = (p: Address) => POOL_NAME[p.toLowerCase()] ?? p.slice(0, 10);

// ---------------------------------------------------------------- deployments file
export type Deployments = {
  chainId: number;
  marginBank: Address;
  collateral?: Address;
  factory?: Address;
  factoryTx?: Hex;
  vaults: Record<string, { address: Address; leader: Address; tx: Hex; params: unknown }>;
  steps: Record<string, { hash?: Hex; at: string; note?: string }>;
};
const DEPLOY = resolve(ROOT, "deployments", "hideki.json");
export function loadDeployments(): Deployments {
  if (!existsSync(DEPLOY)) return { chainId: 50383, marginBank: MARGIN_BANK, vaults: {}, steps: {} };
  return JSON.parse(readFileSync(DEPLOY, "utf8"));
}
export function saveDeployments(d: Deployments) {
  mkdirSync(dirname(DEPLOY), { recursive: true });
  writeFileSync(DEPLOY, JSON.stringify(d, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

// ---------------------------------------------------------------- reads
export type VaultSnapshot = {
  block: bigint;
  nav: bigint;
  pps: bigint;
  supply: bigint;
  hwm: bigint;
  reduceOnly: boolean;
  unlocked: bigint;
  locked: bigint;
  wallet: bigint;
  positions: { pool: Address; size: bigint; entry: bigint }[];
};

export async function snapshot(vault: Address, collateral: Address): Promise<VaultSnapshot> {
  const block = await pub.getBlockNumber();
  const V = { address: vault, abi: vaultAbi, blockNumber: block } as const;
  const [navR, supply, hwm, reduceOnly, pools, st, wallet] = await Promise.all([
    pub.readContract({ ...V, functionName: "tryNav" }) as Promise<[boolean, bigint]>,
    pub.readContract({ ...V, functionName: "totalSupply" }) as Promise<bigint>,
    pub.readContract({ ...V, functionName: "highWaterMark" }) as Promise<bigint>,
    pub.readContract({ ...V, functionName: "reduceOnly" }) as Promise<boolean>,
    pub.readContract({ ...V, functionName: "allowedPools" }) as Promise<Address[]>,
    pub.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "getAccountState", args: [vault], blockNumber: block }),
    pub.readContract({ address: collateral, abi: erc20Abi, functionName: "balanceOf", args: [vault], blockNumber: block }),
  ]);
  const nav = navR[1];
  const positions = await Promise.all(
    pools.map(async (pool) => {
      const p = await pub.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "getPosition", args: [vault, pool], blockNumber: block });
      return { pool, size: BigInt(p.size), entry: BigInt(p.avgEntryPrice) };
    }),
  );
  return {
    block,
    nav,
    pps: supply === 0n ? 10n ** 18n : (nav * 10n ** 18n) / supply,
    supply,
    hwm,
    reduceOnly,
    unlocked: BigInt(st.unlockedCollateralBalance),
    locked: st.lockedCollateral,
    wallet,
    positions,
  };
}

export const fmtSnap = (s: VaultSnapshot) =>
  `NAV ${usd(s.nav)} · pps ${usd(s.pps, 6)} · supply ${usd(s.supply)} · bank free ${usd(s.unlocked)} locked ${usd(s.locked)} · wallet ${usd(s.wallet)}` +
  (s.positions.some((p) => p.size !== 0n) ? ` · pos ${s.positions.filter((p) => p.size !== 0n).map((p) => `${poolName(p.pool)} ${p.size}`).join(", ")}` : "") +
  (s.reduceOnly ? " · REDUCE-ONLY" : "");

export async function mark(pool: Address): Promise<bigint> {
  const [ok, m] = await pub.readContract({ address: pool, abi: poolAbi, functionName: "tryGetMarkPrice" });
  if (!ok) throw new Error(`mark unavailable on ${pool}`);
  return m;
}

export async function book(pool: Address) {
  const p = await pub.readContract({ address: pool, abi: poolAbi, functionName: "getOrderBookParameters" });
  return { tick: p.tickSize, minQty: p.minQuantity, lot: p.lotSize };
}

export const roundTick = (price: bigint, tick: bigint, up: boolean) => (up ? ((price + tick - 1n) / tick) * tick : (price / tick) * tick);

/** A marketable limit price: mark ± slipBps, on tick (up for bids, down for asks). */
export async function marketablePrice(pool: Address, isBid: boolean, slipBps = 200n): Promise<bigint> {
  const [m, b] = await Promise.all([mark(pool), book(pool)]);
  const raw = isBid ? (m * (10_000n + slipBps)) / 10_000n : (m * (10_000n - slipBps)) / 10_000n;
  return roundTick(raw, b.tick, isBid);
}

export const tradeData = (pool: Address, isBid: boolean, price: bigint, qty: bigint, orderType: number): Hex =>
  encodeFunctionData({ abi: vaultAbi, functionName: "trade", args: [pool, isBid, price, qty, orderType] });

// ---------------------------------------------------------------- evidence
export type EvidenceRow = {
  phase: string;
  step: string;
  proves: string;
  hash?: Hex;
  status: "success" | "reverted (expected)" | "read";
  before?: string;
  after?: string;
  decoded?: string;
};
const EVJ = resolve(ROOT, "evidence", "evidence.json");
export function loadEvidence(): EvidenceRow[] {
  return existsSync(EVJ) ? JSON.parse(readFileSync(EVJ, "utf8")) : [];
}
export function addEvidence(row: EvidenceRow) {
  const rows = loadEvidence();
  rows.push(row);
  mkdirSync(dirname(EVJ), { recursive: true });
  writeFileSync(EVJ, JSON.stringify(rows, null, 2));
}
