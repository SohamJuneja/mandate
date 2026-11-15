// Shared plumbing for every Mandate script: chain guard, clients, keys, simulate-then-send,
// revert decoding, explorer links and the run-wide spend ledger (hard caps).
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  formatUnits,
  http,
  parseAbi,
  webSocket,
  type Abi,
  type Address,
  type Hex,
  type PrivateKeyAccount,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { contractErrorsAbi } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CHAIN_ID = 50383;
export const HTTP_RPC = "https://api.hideki2.infra.testnet.somnia.network";
export const WS_RPC = "wss://api.hideki2.infra.testnet.somnia.network/ws";
export const EXPLORER_TX = "https://explorer.testnet.somnia.network/tokyo/tx/";
export const EXPLORER_ADDR = "https://explorer.testnet.somnia.network/tokyo/address/";
export const MARGIN_BANK: Address = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
export const OPERATOR_REGISTRY: Address = "0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a";
export const PERP_FACTORY: Address = "0xE631fAEE547baeE07353E290f0562ea67d856560";
export const BTC_POOL: Address = "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0";
export const ETH_POOL: Address = "0xD6Cb1DD58580B84D76068aC21594219ce03aeddf";
export const SOL_POOL: Address = "0xB483ec1fb34996638677c20ab087b16F1896FA53";

/** eth_call gas floor: Somnia's simulated calls charge far more than mined txs (seen: 1M for one cold SLOAD). */
export const SIM_GAS_FLOOR = 3_000_000n;
export const ORDER_GAS = 10_000_000n;

// Hard caps for the whole unattended run.
export const CAP_USDSO_INTO_VAULTS = 45n * 10n ** 18n;
export const CAP_STT_GAS = 15n * 10n ** 18n;

export const transport = webSocket(WS_RPC, { retryCount: 5, timeout: 60_000 });
export const pub = createPublicClient({ chain: hidekiTestnet, transport });
export const pubHttp = createPublicClient({ chain: hidekiTestnet, transport: http(HTTP_RPC) });

export const link = (hash: Hex) => `${EXPLORER_TX}${hash}`;
export const usd = (x: bigint, d = 4) => {
  const s = formatUnits(x, 18);
  const [i, f = ""] = s.split(".");
  return f ? `${i}.${f.slice(0, d)}` : i;
};

export function key(name: string): PrivateKeyAccount {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`missing or malformed ${name} in .env`);
  return privateKeyToAccount(v as Hex);
}
export const keys = () => ({
  deployer: key("DEPLOYER_PRIVATE_KEY"),
  leader: key("OPERATOR_PRIVATE_KEY"),
  depositor2: key("DEPOSITOR2_PRIVATE_KEY"),
});

export async function assertChain(): Promise<void> {
  const id = await pub.getChainId();
  if (id !== CHAIN_ID) throw new Error(`REFUSING: connected chain is ${id}, not ${CHAIN_ID}`);
}

// ---------------------------------------------------------------- artifacts
export function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const p = resolve(ROOT, "out", `${name}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

let extraErrors: Abi = [];
export function registerErrors(abi: Abi) {
  extraErrors = [...extraErrors, ...abi.filter((x) => x.type === "error")];
}

// ---------------------------------------------------------------- revert decoding
export function revertData(e: unknown): Hex | undefined {
  if (!(e instanceof BaseError)) return undefined;
  let found: Hex | undefined;
  e.walk((x: any) => {
    const d = x?.data;
    if (typeof d === "string" && d.startsWith("0x")) found = d as Hex;
    else if (d && typeof d.data === "string" && d.data.startsWith("0x")) found = d.data as Hex;
    return false;
  });
  return found;
}

export function decodeRevertName(data: Hex | undefined): { name?: string; args?: string; data?: Hex } {
  if (!data || data === "0x") return { data };
  try {
    const d = decodeErrorResult({
      abi: [...extraErrors, ...contractErrorsAbi, ...parseAbi(["error IncorrectOrder()"])] as Abi,
      data,
    });
    const args = (d.args ?? []).map((a) => (typeof a === "bigint" ? a.toString() : String(a))).join(", ");
    return { name: d.errorName, args, data };
  } catch {
    return { data };
  }
}
export function describeRevert(data: Hex | undefined): string {
  const d = decodeRevertName(data);
  if (!data || data === "0x") return "revert data 0x (empty: no reason, or simulated out-of-gas)";
  return d.name ? `${d.name}(${d.args}) [${data}]` : `unknown selector ${data.slice(0, 10)} [${data}]`;
}

// ---------------------------------------------------------------- spend ledger (hard caps)
type Ledger = { usdsoIntoVaults: string; sttGas: string; txs: { step: string; hash: string; gasWei: string; status: string }[] };
const LEDGER = resolve(ROOT, "deployments", "ledger.json");
export function readLedger(): Ledger {
  if (!existsSync(LEDGER)) return { usdsoIntoVaults: "0", sttGas: "0", txs: [] };
  return JSON.parse(readFileSync(LEDGER, "utf8"));
}
function writeLedger(l: Ledger) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}
export function reserveVaultDeposit(amount: bigint) {
  const l = readLedger();
  const next = BigInt(l.usdsoIntoVaults) + amount;
  if (next > CAP_USDSO_INTO_VAULTS) throw new Error(`REFUSING: vault deposits would reach ${usd(next)} USDso > cap 45`);
  l.usdsoIntoVaults = next.toString();
  writeLedger(l);
}
function recordGas(step: string, r: TransactionReceipt) {
  const l = readLedger();
  const gasWei = r.gasUsed * r.effectiveGasPrice;
  l.sttGas = (BigInt(l.sttGas) + gasWei).toString();
  l.txs.push({ step, hash: r.transactionHash, gasWei: gasWei.toString(), status: r.status });
  writeLedger(l);
}
function assertGasBudget(gasLimit: bigint, gasPrice: bigint) {
  const spent = BigInt(readLedger().sttGas);
  // Budget against what the tx can actually burn at most.
  if (spent + gasLimit * gasPrice > CAP_STT_GAS) {
    throw new Error(`REFUSING: gas spent ${usd(spent)} STT + worst case ${usd(gasLimit * gasPrice)} would exceed the 15 STT cap`);
  }
}

// ---------------------------------------------------------------- send
export type Tx = { to?: Address; data: Hex; value?: bigint; gas?: bigint };
export type SendResult = { receipt: TransactionReceipt; hash: Hex };

export class RevertError extends Error {
  constructor(public step: string, public data: Hex | undefined, public hash?: Hex) {
    super(`${step} reverted: ${describeRevert(data)}${hash ? ` (tx ${link(hash)})` : " (eth_call)"}`);
  }
}

/** eth_call with a gas cap of at least SIM_GAS_FLOOR. Throws RevertError with the decoded data. */
export async function simulate(step: string, from: Address, tx: Tx, blockNumber?: bigint): Promise<void> {
  const gas = tx.gas && tx.gas > SIM_GAS_FLOOR ? tx.gas : SIM_GAS_FLOOR;
  try {
    await pub.call({ account: from, to: tx.to, data: tx.data, value: tx.value, gas, blockNumber });
  } catch (e) {
    throw new RevertError(step, revertData(e));
  }
}

/**
 * Simulate, then send, then wait. Refuses on the wrong chain or over the gas cap.
 * `expectRevert` sends WITHOUT the simulation gate (fixed gas) so the revert is on chain, then
 * replays the mined tx with eth_call to recover its revert data.
 */
export async function send(
  step: string,
  from: PrivateKeyAccount,
  tx: Tx,
  opts: { expectRevert?: string; quiet?: boolean } = {},
): Promise<SendResult & { revert?: { name?: string; data?: Hex } }> {
  await assertChain();
  const wallet = createWalletClient({ account: from, chain: hidekiTestnet, transport });
  const call = { to: tx.to, data: tx.data, value: tx.value };

  // No explicit gas (deploys, deposits): estimate first. A failing estimate carries the revert
  // data, and the estimate is the cap the simulation needs: a ~20 KB deploy on Somnia costs ~100M,
  // so simulating it under the 3M floor would report an empty out-of-gas revert.
  if (tx.gas === undefined && !opts.expectRevert) {
    try {
      const est = await pub.estimateGas({ account: from.address, ...call });
      tx = { ...tx, gas: (est * 13n) / 10n };
    } catch (e) {
      throw new RevertError(step, revertData(e));
    }
  }

  if (opts.expectRevert) {
    // Prove it reverts in simulation first, with the expected error.
    let simName: string | undefined;
    try {
      await simulate(step, from.address, tx);
    } catch (e) {
      if (e instanceof RevertError) simName = decodeRevertName(e.data).name;
      else throw e;
    }
    if (simName !== opts.expectRevert) throw new Error(`${step}: expected simulated revert ${opts.expectRevert}, got ${simName ?? "success"}`);
  } else {
    await simulate(step, from.address, tx);
  }

  let gas = tx.gas;
  if (gas === undefined) gas = ((await pub.estimateGas({ account: from.address, ...call })) * 13n) / 10n;
  const gasPrice = await pub.getGasPrice();
  assertGasBudget(gas, gasPrice);

  const hash = await wallet.sendTransaction({ to: tx.to ?? null, data: tx.data, value: tx.value, gas, chain: hidekiTestnet } as any);
  if (!opts.quiet) console.log(`  tx  ${step}\n      ${link(hash)}`);
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  recordGas(step, receipt);

  if (opts.expectRevert) {
    if (receipt.status === "success") throw new Error(`${step}: expected an on-chain revert, but it succeeded (${link(hash)})`);
    let data: Hex | undefined;
    try {
      await pub.call({ account: from.address, ...call, gas: gas > SIM_GAS_FLOOR ? gas : SIM_GAS_FLOOR, blockNumber: receipt.blockNumber - 1n });
    } catch (e) {
      data = revertData(e);
    }
    const name = decodeRevertName(data).name;
    if (!opts.quiet) console.log(`      ✓ reverted on chain (block ${receipt.blockNumber}); replay decodes ${describeRevert(data)}`);
    if (name !== opts.expectRevert) throw new Error(`${step}: mined revert decodes as ${name}, expected ${opts.expectRevert}`);
    return { receipt, hash, revert: { name, data } };
  }

  if (receipt.status !== "success") {
    let data: Hex | undefined;
    try {
      await pub.call({ account: from.address, ...call, gas: gas > SIM_GAS_FLOOR ? gas : SIM_GAS_FLOOR, blockNumber: receipt.blockNumber - 1n });
    } catch (e) {
      data = revertData(e);
    }
    throw new RevertError(step, data, hash);
  }
  if (!opts.quiet) console.log(`      ✓ block ${receipt.blockNumber}, gasUsed ${receipt.gasUsed}`);
  return { receipt, hash };
}

// ---------------------------------------------------------------- shared ABIs
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);
export const bankAbi = parseAbi([
  "function getSystemConfig() view returns ((address marginBank, address collateralToken, address perpPoolFactory, address liquidationEngine, address insuranceFund, address feeRecipient, uint16 maxLeverageLimit, bool fullyWired))",
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
  "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))",
  "function getAccountEquity(address account) view returns (int256)",
  "function tryGetAccountEquity(address account) view returns (bool ok, int256 equity)",
  "function getAccountHealth(address account) view returns (int256 equity, uint256 imReq, uint256 mmReq, uint256 cmReq)",
  "function getWithdrawableCollateral(address account) view returns (uint256)",
  "function getCollateralBasis(address account) view returns (uint256)",
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
]);
export const poolAbi = parseAbi([
  "function tryGetMarkPrice() view returns (bool ok, uint256 price)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function getHealthSnapshot() view returns ((uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding, uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps) snapshot)",
  "function tryGetHealthSnapshot() view returns (bool ok, (uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding, uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps) snapshot)",
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
  "function getOrder(uint128 orderId) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs))",
  "function getMaxBuilderFeeBpsTimes1k() view returns (uint256)",
  "function getEffectiveBuilderApproval(address user, address builder) view returns (uint256)",
  "function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity, uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity) capacity)",
  "function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))",
  "function getCurrentFundingRate() view returns (int256)",
  "function getProjectedCumulativeFundingPerUnit() view returns (int256)",
  "function getOneBase() view returns (uint256)",
  "function getOwnOpenOrders() view returns (uint128[])",
  "function marginBank() view returns (address)",
]);
