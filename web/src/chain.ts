// Everything the UI knows comes from here: the chain (RPC, multicall, historical eth_call) and the
// public explorer's transaction list for a vault. No backend of our own.
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeErrorResult,
  decodeFunctionData,
  defineChain,
  formatUnits,
  http,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import abis from "./abi.json";
import deployments from "./deployments.json";

export const hideki = defineChain({
  id: 50383,
  name: "Somnia Hideki Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"], webSocket: ["wss://api.hideki2.infra.testnet.somnia.network/ws"] } },
  blockExplorers: { default: { name: "Somnia Explorer (Tokyo)", url: "https://explorer.testnet.somnia.network/tokyo" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 1 } },
  testnet: true,
});

export const EXPLORER = "https://explorer.testnet.somnia.network/tokyo";
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;

export const vaultAbi = abis.vault as Abi;
export const factoryAbi = abis.factory as Abi;
export const FACTORY = deployments.factory as Address;
export const COLLATERAL = deployments.collateral as Address;
export const MARGIN_BANK = deployments.marginBank as Address;
export const APP_BUILDER = deployments.appBuilder as Address;

export const MARKETS: { name: string; pool: Address; decimals: number }[] = [
  { name: "BTC", pool: "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0", decimals: 8 },
  { name: "ETH", pool: "0xD6Cb1DD58580B84D76068aC21594219ce03aeddf", decimals: 18 },
  { name: "SOL", pool: "0xB483ec1fb34996638677c20ab087b16F1896FA53", decimals: 9 },
];
export const marketOf = (pool: string) => MARKETS.find((m) => m.pool.toLowerCase() === pool.toLowerCase());

export const client = createPublicClient({ chain: hideki, transport: http(undefined, { batch: false }) });

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);
const bankAbi = parseAbi([
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
  "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))",
]);
const poolAbi = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);
const placeErrors = parseAbi(["error IncorrectOrder()", "error BuilderFeeExceedsApproval()"]);

// ---------------------------------------------------------------- formatting
export const num = (x: bigint, d = 18) => Number(formatUnits(x, d));
export const fmtUsd = (x: number, dp = 2) =>
  x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------------------------------------------------------------- vault reads
export type Mandate = {
  allowedPools: Address[];
  maxLeverageX1e2: bigint;
  maxNotionalPerPool: bigint;
  drawdownBps: number;
  perfFeeBps: number;
  leaderMinShareBps: number;
  lockSeconds: number;
  builder: Address;
  builderFeeBpsTimes1k: bigint;
};

export type VaultSummary = {
  address: Address;
  name: string;
  symbol: string;
  leader: Address;
  nav: number;
  pps: number;
  supply: number;
  hwm: number;
  reduceOnly: boolean;
  mandate: Mandate;
  navOk: boolean;
};

export async function listVaults(): Promise<Address[]> {
  return (await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "vaults" })) as Address[];
}

export async function readVault(address: Address): Promise<VaultSummary> {
  const c = { address, abi: vaultAbi } as const;
  const r = await client.multicall({
    allowFailure: true,
    contracts: [
      { ...c, functionName: "name" },
      { ...c, functionName: "symbol" },
      { ...c, functionName: "leader" },
      { ...c, functionName: "tryNav" },
      { ...c, functionName: "totalSupply" },
      { ...c, functionName: "highWaterMark" },
      { ...c, functionName: "reduceOnly" },
      { ...c, functionName: "mandate" },
    ],
  });
  const v = <T,>(i: number) => r[i].result as T;
  const [navOk, navRaw] = (v<[boolean, bigint]>(3) ?? [false, 0n]) as [boolean, bigint];
  const supply = v<bigint>(4) ?? 0n;
  const nav = num(navRaw);
  const s = num(supply);
  const m = v<any>(7);
  return {
    address,
    name: v<string>(0) ?? "?",
    symbol: v<string>(1) ?? "",
    leader: v<Address>(2),
    nav,
    pps: s === 0 ? 1 : nav / s,
    supply: s,
    hwm: num(v<bigint>(5) ?? 0n) || 1,
    reduceOnly: v<boolean>(6) ?? false,
    navOk,
    mandate: {
      allowedPools: m.allowedPools,
      maxLeverageX1e2: m.maxLeverageX1e2,
      maxNotionalPerPool: m.maxNotionalPerPool,
      drawdownBps: Number(m.drawdownBps),
      perfFeeBps: Number(m.perfFeeBps),
      leaderMinShareBps: Number(m.leaderMinShareBps),
      lockSeconds: Number(m.lockSeconds),
      builder: m.builder,
      builderFeeBpsTimes1k: m.builderFeeBpsTimes1k,
    },
  };
}

export type PositionRow = { market: string; size: number; entry: number; mark: number; upnl: number; notional: number };

export async function readPositions(vault: Address, pools: Address[]) {
  const r = await client.multicall({
    allowFailure: true,
    contracts: [
      ...pools.map((p) => ({ address: MARGIN_BANK, abi: bankAbi, functionName: "getPosition", args: [vault, p] }) as const),
      ...pools.map((p) => ({ address: p, abi: poolAbi, functionName: "tryGetMarkPrice" }) as const),
      { address: MARGIN_BANK, abi: bankAbi, functionName: "getAccountState", args: [vault] } as const,
      { address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [vault] } as const,
    ],
  });
  const rows: PositionRow[] = pools.map((p, i) => {
    const pos = r[i].result as any;
    const markR = r[pools.length + i].result as any;
    const d = marketOf(p)?.decimals ?? 18;
    const size = pos ? num(BigInt(pos.size), d) : 0;
    const entry = pos ? num(BigInt(pos.avgEntryPrice)) : 0;
    const mark = markR ? num(markR[1]) : 0;
    return { market: marketOf(p)?.name ?? short(p), size, entry, mark, upnl: size * (mark - entry), notional: Math.abs(size) * mark };
  });
  const st = r[pools.length * 2].result as any;
  const wallet = (r[pools.length * 2 + 1].result as bigint) ?? 0n;
  return { rows, free: st ? num(BigInt(st.unlockedCollateralBalance)) : 0, locked: st ? num(st.lockedCollateral) : 0, wallet: num(wallet) };
}

// ---------------------------------------------------------------- history (archive eth_call)
export async function vaultCreationBlock(vault: Address): Promise<bigint | null> {
  try {
    const r = await fetch(`${EXPLORER}/api/v2/addresses/${vault}`);
    const j = await r.json();
    const h = j.creation_transaction_hash ?? j.creation_tx_hash;
    if (h) return (await client.getTransactionReceipt({ hash: h })).blockNumber;
  } catch {
    /* fall through */
  }
  // Factory-created vaults have no creation tx on the explorer: binary-search the first block
  // where the vault has code (archive eth_getCode, ~22 calls).
  try {
    let hi = await client.getBlockNumber();
    let lo = 0n;
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n;
      const code = await client.getCode({ address: vault, blockNumber: mid });
      if (code && code !== "0x") hi = mid;
      else lo = mid;
    }
    return hi;
  } catch {
    return null;
  }
}

/** Price per share sampled at `points` blocks between creation and now. */
export async function ppsHistory(vault: Address, fromBlock: bigint, points = 36) {
  const head = await client.getBlockNumber();
  const span = head - fromBlock;
  const blocks = Array.from({ length: points }, (_, i) => fromBlock + (span * BigInt(i)) / BigInt(points - 1));
  const out = await Promise.all(
    blocks.map(async (b) => {
      try {
        const [pps, blk] = await Promise.all([
          client.readContract({ address: vault, abi: vaultAbi, functionName: "pricePerShare", blockNumber: b }) as Promise<bigint>,
          client.getBlock({ blockNumber: b }),
        ]);
        return { block: b, t: Number(blk.timestamp) * 1000, pps: num(pps) };
      } catch {
        return null;
      }
    }),
  );
  return out.filter((x): x is { block: bigint; t: number; pps: number } => x !== null);
}

// ---------------------------------------------------------------- activity (explorer tx list + chain decode)
export type Activity = {
  hash: Hex;
  block: number;
  time: string;
  from: Address;
  ok: boolean;
  method: string;
  summary: string;
  error?: string;
};

export async function vaultActivity(vault: Address): Promise<Activity[]> {
  const r = await fetch(`${EXPLORER}/api/v2/addresses/${vault}/transactions`);
  if (!r.ok) throw new Error(`explorer ${r.status}`);
  const j = await r.json();
  const items: any[] = j.items ?? [];
  return Promise.all(
    items.map(async (t) => {
      const ok = t.status === "ok";
      let method = t.method ?? "?";
      let summary = "";
      try {
        const d = decodeFunctionData({ abi: vaultAbi, data: t.raw_input as Hex });
        method = d.functionName;
        summary = describeCall(d.functionName, d.args as readonly unknown[]);
      } catch {
        /* not a vault call */
      }
      let error: string | undefined;
      if (!ok) error = await replayRevert(t.from.hash, vault, t.raw_input, BigInt(t.block_number));
      return { hash: t.hash, block: t.block_number, time: t.timestamp, from: t.from.hash, ok, method, summary, error };
    }),
  );
}

function describeCall(fn: string, a: readonly unknown[]): string {
  if (fn === "trade") {
    const [pool, isBid, price, qty, type] = a as [Address, boolean, bigint, bigint, number];
    const m = marketOf(pool);
    const types = ["limit", "FOK", "IOC", "post-only"];
    return `${isBid ? "Buy" : "Sell"} ${num(qty, m?.decimals ?? 18)} ${m?.name ?? short(pool)} @ ${fmtUsd(num(price), 1)} · ${types[Number(type)] ?? type}`;
  }
  if (fn === "deposit") return `${fmtUsd(num(a[0] as bigint))} USDso in`;
  if (fn === "redeem") return `${fmtUsd(num(a[0] as bigint), 4)} shares out`;
  if (fn === "closePosition" || fn === "cancelAll") return marketOf(a[0] as string)?.name ?? "";
  return "";
}

/** Recover a mined revert's reason by replaying the call at the parent block. */
async function replayRevert(from: Address, to: Address, data: Hex, block: bigint): Promise<string> {
  try {
    await client.call({ account: from, to, data, blockNumber: block - 1n, gas: 10_000_000n });
    return "reverted";
  } catch (e: any) {
    let raw: Hex | undefined;
    for (let x = e; x; x = x.cause) {
      if (typeof x.data === "string" && x.data.startsWith("0x")) raw = x.data;
      else if (typeof x.data?.data === "string") raw = x.data.data;
    }
    if (!raw) return "reverted";
    try {
      const d = decodeErrorResult({ abi: [...vaultAbi, ...placeErrors], data: raw });
      return d.errorName;
    } catch {
      return raw.slice(0, 10);
    }
  }
}

// ---------------------------------------------------------------- wallet
declare global {
  interface Window {
    ethereum?: any;
  }
}

export async function connect(): Promise<Address> {
  if (!window.ethereum) throw new Error("No injected wallet found. Install MetaMask or a compatible wallet.");
  const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
  const id = parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
  if (id !== hideki.id) {
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4cf" }] });
    } catch (e: any) {
      if (e?.code !== 4902) throw e;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: "0xc4cf", chainName: hideki.name, nativeCurrency: hideki.nativeCurrency, rpcUrls: hideki.rpcUrls.default.http, blockExplorerUrls: [EXPLORER] }],
      });
    }
  }
  return account as Address;
}

export const walletClient = () => createWalletClient({ chain: hideki, transport: custom(window.ethereum) });

/** Simulate (eth_call), estimate (+30%: Somnia's per-byte costs make deploys ~46M), send, wait. */
export async function write(account: Address, address: Address, abi: Abi, functionName: string, args: unknown[]): Promise<Hex> {
  const id = parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
  if (id !== hideki.id) throw new Error(`Wallet is on chain ${id}; switch to Hideki (50383).`);
  try {
    await client.simulateContract({ account, address, abi, functionName, args } as any);
  } catch (e: any) {
    throw new Error(e?.shortMessage ?? e?.message ?? String(e));
  }
  const est = await client.estimateContractGas({ account, address, abi, functionName, args } as any);
  const gas = (est * 13n) / 10n;
  const hash = await walletClient().writeContract({ account, address, abi, functionName, args, chain: hideki, gas } as any);
  await client.waitForTransactionReceipt({ hash });
  return hash;
}

