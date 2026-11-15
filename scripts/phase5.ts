// Phase 5: Somnia Reactivity safety switch, live on Hideki.
//   1. A tiny "tripwire" vault: BTC only, drawdown breaker at 20 bps.
//   2. MandateGuard, subscribed ON CHAIN (reactivity precompile 0x0100) to
//      MarginBank.PositionUpdated where topic1 == the vault.
//   3. The leader opens a ~2.9x BTC long. Spread + taker fee alone cost more than 20 bps of NAV,
//      so the fill's PositionUpdated triggers the guard, which (in the same block) checkpoints →
//      latches reduce-only → flattens.
// Resumable via deployments/hideki.json.
import { encodeDeployData, encodeFunctionData, keccak256, pad, parseAbi, parseUnits, toBytes, toHex, decodeEventLog, type Address, type Hex } from "viem";
import { BTC_POOL, MARGIN_BANK, ORDER_GAS, artifact, assertChain, bankAbi, erc20Abi, keys, link, pub, registerErrors, reserveVaultDeposit, send, usd, HTTP_RPC } from "./lib.ts";
import { addEvidence, book, factoryAbi, fmtSnap, loadDeployments, mark, roundTick, saveDeployments, snapshot, tradeData, vaultAbi } from "./vaultlib.ts";

const guardArt = artifact("MandateGuard");
registerErrors(guardArt.abi);
const precompileAbi = parseAbi([
  "function subscribe((bytes32[4] eventTopics, address origin, address caller, address emitter, address handlerContractAddress, bytes4 handlerFunctionSelector, uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit, bool isGuaranteed, bool isCoalesced) subscriptionData) returns (uint256)",
  "function unsubscribe(uint256 subscriptionId)",
  "event SubscriptionCreated(uint256 indexed subscriptionId, address indexed owner, (bytes32[4] eventTopics, address origin, address caller, address emitter, address handlerContractAddress, bytes4 handlerFunctionSelector, uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit, bool isGuaranteed, bool isCoalesced) subscriptionData)",
]);
const PRECOMPILE: Address = "0x0000000000000000000000000000000000000100";
const POSITION_UPDATED = keccak256(toBytes("PositionUpdated(address,address,int128,uint128,int256,int256)"));
const ON_EVENT = keccak256(toBytes("onEvent(address,bytes32[],bytes)")).slice(0, 10) as Hex;
const GUARD_FIRED = keccak256(toBytes("GuardFired(address,bool,uint256,uint256,uint256,bool)"));

const d = loadDeployments();
const { deployer, depositor2 } = keys();
const leader = depositor2; // one vault per leader: the tripwire vault gets its own leader key

async function step(k: string, fn: () => Promise<{ hash?: Hex; note?: string } | void>) {
  if (d.steps[k]) return console.log(`· skip ${k}`);
  console.log(`\n▶ ${k}`);
  const r = (await fn()) ?? {};
  d.steps[k] = { hash: r.hash, at: new Date().toISOString(), note: r.note };
  saveDeployments(d);
}

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(HTTP_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return ((await r.json()) as any).result;
}

async function guardLogs(guard: Address, from: bigint) {
  const head = await pub.getBlockNumber();
  const to = from + 999n < head ? from + 999n : head;
  const logs = await rpc("eth_getLogs", [{ address: guard, fromBlock: toHex(from), toBlock: toHex(to), topics: [GUARD_FIRED] }]);
  return (logs ?? []) as { transactionHash: Hex; blockNumber: Hex; data: Hex; topics: Hex[] }[];
}

async function main() {
  await assertChain();
  const usdso = d.collateral!;
  const factory = d.factory!;

  await step("p5-create-vault", async () => {
    const params = {
      name: "Mandate Tripwire (reactivity demo)",
      symbol: "mTRIP",
      leader: leader.address,
      mandate: {
        allowedPools: [BTC_POOL],
        maxLeverageX1e2: 300n,
        maxNotionalPerPool: parseUnits("25", 18),
        drawdownBps: 20,
        perfFeeBps: 1000,
        leaderMinShareBps: 500,
        lockSeconds: 120,
        builder: deployer.address,
        builderFeeBpsTimes1k: 1000n,
      },
    };
    const { hash } = await send("factory.createVault(tripwire)", deployer, { to: factory, data: encodeFunctionData({ abi: factoryAbi, functionName: "createVault", args: [params] }) });
    const vault = (await pub.readContract({ address: factory, abi: factoryAbi, functionName: "vaultOfLeader", args: [leader.address] })) as Address;
    d.vaults.tripwire = { address: vault, leader: leader.address, tx: hash, params };
    console.log(`      tripwire vault ${vault}`);
    addEvidence({ phase: "5", step: "Create the tripwire vault", proves: "BTC only, 3x, drawdown breaker at 20 bps: a tiny loss must trip it", hash, status: "success", after: `vault ${vault}` });
    return { hash };
  });
  const vault = d.vaults.tripwire.address;
  const snap = () => snapshot(vault, usdso);

  await step("p5-deposit", async () => {
    const amount = parseUnits("5", 18);
    reserveVaultDeposit(amount);
    await send("leader approves exactly 5 USDso", leader, { to: usdso, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, amount] }) });
    const { hash } = await send("leader deposits 5 USDso", leader, { to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [amount] }) });
    const s = await snap();
    console.log(`      ${fmtSnap(s)}`);
    addEvidence({ phase: "5", step: "Leader seeds the tripwire vault with 5 USDso", proves: "First deposit by the leader; high-water mark set at 1.0", hash, status: "success", after: fmtSnap(s) });
    return { hash };
  });

  await step("p5-deploy-guard", async () => {
    const { receipt, hash } = await send("deploy MandateGuard(factory)", deployer, { data: encodeDeployData({ abi: guardArt.abi, bytecode: guardArt.bytecode, args: [factory] }) });
    (d as any).guard = receipt.contractAddress;
    console.log(`      guard ${receipt.contractAddress}`);
    addEvidence({ phase: "5", step: "Deploy MandateGuard", proves: "A reactivity handler with no funds and no privileges: checkpoint() is public, closePosition() opens to anyone on breach", hash, status: "success", after: `guard ${receipt.contractAddress}` });
    return { hash };
  });
  const guard = (d as any).guard as Address;

  await step("p5-subscribe", async () => {
    const bal = await pub.getBalance({ address: deployer.address });
    if (bal < parseUnits("32", 18)) throw new Error(`subscription owner needs ≥ 32 STT, deployer has ${usd(bal)}`);
    const sub = {
      eventTopics: [POSITION_UPDATED, pad(vault, { size: 32 }), pad("0x00", { size: 32 }), pad("0x00", { size: 32 })] as const,
      origin: "0x0000000000000000000000000000000000000000" as Address,
      caller: "0x0000000000000000000000000000000000000000" as Address,
      emitter: MARGIN_BANK,
      handlerContractAddress: guard,
      handlerFunctionSelector: ON_EVENT,
      priorityFeePerGas: 1_000_000_000n, // 1 gwei: don't get starved in the per-block queue
      maxFeePerGas: 20_000_000_000n,
      gasLimit: 12_000_000n, // checkpoint + cancelAll + IOC close
      isGuaranteed: false,
      isCoalesced: false,
    };
    const { receipt, hash } = await send("deployer → precompile 0x0100 subscribe(PositionUpdated[account=vault] → guard.onEvent)", deployer, {
      to: PRECOMPILE,
      gas: 3_000_000n,
      data: encodeFunctionData({ abi: precompileAbi, functionName: "subscribe", args: [sub as any] }),
    });
    let id: bigint | undefined;
    for (const l of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: precompileAbi, data: l.data, topics: l.topics as any }) as any;
        if (ev.eventName === "SubscriptionCreated") id = ev.args.subscriptionId;
      } catch {}
    }
    (d as any).subscriptionId = id?.toString();
    const listed = await rpc("somnia_reactivityGetSubscriptions", [deployer.address]);
    console.log(`      subscription id ${id} · somnia_reactivityGetSubscriptions → ${JSON.stringify(listed).slice(0, 160)}`);
    addEvidence({ phase: "5", step: `Subscribe on chain (id ${id})`, proves: "Reactivity precompile 0x0100: MarginBank.PositionUpdated with topic1 = vault → MandateGuard.onEvent, 12M gas, owner = deployer EOA", hash, status: "success" });
    return { hash, note: `subscription ${id}` };
  });

  await step("p5-trip", async () => {
    const before = await snap();
    const [m, b] = await Promise.all([mark(BTC_POOL), book(BTC_POOL)]);
    // Largest lot-multiple long that stays under 2.9x NAV (the cap is 3x at mark).
    let qty = ((before.nav * 29n * 10n ** 8n) / 10n / m / b.lot) * b.lot;
    if (qty < b.minQty) qty = b.minQty;
    const price = roundTick((m * 10_200n) / 10_000n, b.tick, true);
    console.log(`      before: ${fmtSnap(before)} · hwm ${usd(before.hwm, 6)} · floor ${usd((before.hwm * 9980n) / 10_000n, 6)}`);
    const { hash, receipt } = await send(`leader → vault.trade(BTC, BUY ${qty}, IOC)`, leader, { to: vault, gas: ORDER_GAS, data: tradeData(BTC_POOL, true, price, qty, 2) });
    addEvidence({ phase: "5", step: `Leader opens a ${qty}-unit BTC long (~2.9x)`, proves: "Fill emits MarginBank.PositionUpdated(account = vault): the subscription's trigger", hash, status: "success", before: `${fmtSnap(before)} · hwm ${usd(before.hwm, 6)}` });

    // Find the guard's reactive invocation(s).
    let fired: Awaited<ReturnType<typeof guardLogs>> = [];
    for (let i = 0; i < 20 && fired.length === 0; i++) {
      fired = await guardLogs(guard, receipt.blockNumber);
      if (!fired.length) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!fired.length) {
      addEvidence({ phase: "5", step: "Waiting for the reactive call", proves: "No GuardFired log within ~30 s of the fill: subscription did not fire (see PROGRESS.md)", status: "read" });
      return { hash, note: "guard did not fire" };
    }
    for (const f of fired) {
      const ev = decodeEventLog({ abi: guardArt.abi, data: f.data, topics: f.topics as any }) as any;
      const sameBlock = BigInt(f.blockNumber) === receipt.blockNumber;
      const after = await snap();
      console.log(`      ⚡ GuardFired in block ${BigInt(f.blockNumber)} (${sameBlock ? "SAME block as the fill" : `fill was ${receipt.blockNumber}`}) reduceOnly=${ev.args.reduceOnly} closed=${ev.args.closed} pps=${usd(ev.args.pricePerShare, 6)} · ${link(f.transactionHash)}`);
      addEvidence({
        phase: "5",
        step: `Reactive call: MandateGuard.onEvent (${sameBlock ? "same block as the fill" : `block +${BigInt(f.blockNumber) - receipt.blockNumber}`})`,
        proves: ev.args.reduceOnly
          ? `Validators invoked the guard; checkpoint() saw pps ${usd(ev.args.pricePerShare, 6)} < floor → MandateBreached → reduce-only latched → closePosition sent (${ev.args.closed} closed)`
          : `Validators invoked the guard; pps ${usd(ev.args.pricePerShare, 6)} still inside the band → no action`,
        hash: f.transactionHash,
        status: "success",
        after: `${fmtSnap(after)} · hwm ${usd(after.hwm, 6)}`,
      });
    }
    return { hash };
  });

  const s = await snap();
  console.log(`\nfinal: ${fmtSnap(s)} · hwm ${usd(s.hwm, 6)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✖", e?.message ?? e);
  saveDeployments(d);
  process.exit(1);
});
