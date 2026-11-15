// Phase 5b: wait for the mark to push the tripwire vault below its 20 bps floor, then let the next
// fill (a small reducing order by the leader) trigger the reactive guard, which flattens the rest.
import { decodeEventLog, keccak256, toBytes, toHex, type Address, type Hex } from "viem";
import { BTC_POOL, HTTP_RPC, ORDER_GAS, artifact, assertChain, keys, link, pub, registerErrors, send, usd } from "./lib.ts";
import { addEvidence, book, fmtSnap, loadDeployments, mark, roundTick, saveDeployments, snapshot, tradeData, vaultAbi } from "./vaultlib.ts";

const guardArt = artifact("MandateGuard");
registerErrors(guardArt.abi);
const GUARD_FIRED = keccak256(toBytes("GuardFired(address,bool,uint256,uint256,uint256,bool)"));
const d = loadDeployments();
const { depositor2: leader } = keys();
const vault = d.vaults.tripwire.address;
const guard = (d as any).guard as Address;
const usdso = d.collateral!;

async function guardLogs(from: bigint) {
  const head = await pub.getBlockNumber();
  const r = await fetch(HTTP_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: guard, fromBlock: toHex(from), toBlock: toHex(from + 999n < head ? from + 999n : head), topics: [GUARD_FIRED] }] }) });
  return (((await r.json()) as any).result ?? []) as { transactionHash: Hex; blockNumber: Hex; data: Hex; topics: Hex[] }[];
}

async function main() {
  await assertChain();
  if (d.steps["p5-breach"]) return console.log("done already");
  const start = Date.now();
  let s = await snapshot(vault, usdso);
  const floor = (s.hwm * 9980n) / 10_000n;
  console.log(`watching ${vault}: pps ${usd(s.pps, 6)} floor ${usd(floor, 6)}`);
  // Trigger a little above the floor: the reducing fill's own spread + fee add the last few bps.
  const trigger = (s.hwm * 9984n) / 10_000n;
  while (Date.now() - start < 10 * 60_000) {
    s = await snapshot(vault, usdso);
    process.stdout.write(`\r  pps ${usd(s.pps, 6)} (trigger ≤ ${usd(trigger, 6)})   `);
    if (s.pps <= trigger) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log();
  const pos = s.positions.find((p) => p.pool === BTC_POOL)!;
  const [m, b] = await Promise.all([mark(BTC_POOL), book(BTC_POOL)]);
  const price = roundTick((m * 9_800n) / 10_000n, b.tick, false);
  const breaching = s.pps <= trigger;
  const qty = breaching ? b.minQty : pos.size; // reduce a slice (guard closes the rest) or just close
  const before = s;
  const { hash, receipt } = await send(`leader → vault.trade(BTC, SELL ${qty}, IOC) ${breaching ? "(reducing slice)" : "(timeout: close)"}`, leader, { to: vault, gas: ORDER_GAS, data: tradeData(BTC_POOL, false, price, qty, 2) });
  addEvidence({ phase: "5", step: breaching ? `Mark moved against the vault; leader sells a ${qty}-unit slice` : "BTC never moved against the vault in 10 min; leader closes", proves: breaching ? "Reducing orders stay allowed; the fill emits PositionUpdated → reactive guard" : "Timeout path", hash, status: "success", before: `${fmtSnap(before)} · hwm ${usd(before.hwm, 6)}` });
  let fired: Awaited<ReturnType<typeof guardLogs>> = [];
  for (let i = 0; i < 20 && !fired.length; i++) {
    fired = await guardLogs(receipt.blockNumber);
    if (!fired.length) await new Promise((r) => setTimeout(r, 1500));
  }
  for (const f of fired) {
    const ev = decodeEventLog({ abi: guardArt.abi, data: f.data, topics: f.topics as any }) as any;
    const after = await snapshot(vault, usdso);
    const same = BigInt(f.blockNumber) === receipt.blockNumber;
    console.log(`  ⚡ GuardFired block ${BigInt(f.blockNumber)} (${same ? "same block" : "later"}) reduceOnly=${ev.args.reduceOnly} closed=${ev.args.closed} · ${link(f.transactionHash)}\n  after: ${fmtSnap(after)}`);
    addEvidence({
      phase: "5",
      step: `Reactive call: MandateGuard.onEvent (${same ? "same block as the fill" : "later block"})`,
      proves: ev.args.reduceOnly ? `Vault is breached (pps ${usd(ev.args.pricePerShare, 6)} vs high ${usd(ev.args.highWaterMark, 6)}): reduce-only latched and the guard sent closePosition (${ev.args.closed} market closed), with no keeper and no leader` : "Guard checked; inside the band",
      hash: f.transactionHash,
      status: "success",
      after: `${fmtSnap(after)} · hwm ${usd(after.hwm, 6)}`,
    });
  }
  // Show the latch now refuses an increasing order (eth_call only; one on-chain proof is enough).
  const after = await snapshot(vault, usdso);
  if (after.reduceOnly) {
    const { hash: h2, revert } = await send("leader → vault.trade(BTC, BUY) after the breach", leader, { to: vault, gas: ORDER_GAS, data: tradeData(BTC_POOL, true, roundTick((m * 10_200n) / 10_000n, b.tick, true), b.minQty, 2) }, { expectRevert: "ReduceOnly" });
    addEvidence({ phase: "5", step: "Leader tries to buy again after the breach", proves: "Reduce-only is latched on chain: increasing orders revert", hash: h2, status: "reverted (expected)", decoded: `${revert?.name}() ${revert?.data}` });
  }
  d.steps["p5-breach"] = { hash, at: new Date().toISOString() };
  saveDeployments(d);
  console.log(`final: ${fmtSnap(after)} · reduceOnly ${after.reduceOnly}`);
  process.exit(0);
}
main().catch((e) => { console.error("✖", e?.message ?? e); process.exit(1); });
