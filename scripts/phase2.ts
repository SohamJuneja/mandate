// Phase 2: deploy the factory, create the demo vault, and produce live on-chain evidence.
// Resumable: every completed step is recorded in deployments/hideki.json and skipped on rerun.
//
//   npx tsx scripts/phase2.ts
import { encodeDeployData, encodeFunctionData, parseUnits, type Address, type Hex, type PrivateKeyAccount } from "viem";
import {
  BTC_POOL,
  ETH_POOL,
  MARGIN_BANK,
  ORDER_GAS,
  SOL_POOL,
  assertChain,
  bankAbi,
  erc20Abi,
  keys,
  link,
  pub,
  readLedger,
  reserveVaultDeposit,
  send,
  usd,
} from "./lib.ts";
import {
  addEvidence,
  book,
  factoryAbi,
  factoryArt,
  fmtSnap,
  loadDeployments,
  marketablePrice,
  mark,
  roundTick,
  saveDeployments,
  snapshot,
  tradeData,
  vaultAbi,
} from "./vaultlib.ts";

const VAULT_NAME = "Mandate BTC/ETH Momentum";
const d = loadDeployments();
const { deployer, leader, depositor2 } = keys();

async function step(key: string, fn: () => Promise<{ hash?: Hex; note?: string } | void>) {
  if (d.steps[key]) {
    console.log(`· skip ${key} (done ${d.steps[key].hash ? link(d.steps[key].hash!) : ""})`);
    return;
  }
  console.log(`\n▶ ${key}`);
  const r = (await fn()) ?? {};
  d.steps[key] = { hash: r.hash, at: new Date().toISOString(), note: r.note };
  saveDeployments(d);
}

async function main() {
  await assertChain();
  const cfg = await pub.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "getSystemConfig" });
  const usdso = cfg.collateralToken as Address;
  d.collateral = usdso;
  console.log(`Hideki ${await pub.getChainId()} · collateral ${usdso} (live from getSystemConfig)`);
  console.log(`deployer ${deployer.address}\nleader   ${leader.address}\ndepositor2 ${depositor2.address}`);
  const bal = async (a: Address) => [await pub.getBalance({ address: a }), await pub.readContract({ address: usdso, abi: erc20Abi, functionName: "balanceOf", args: [a] })] as const;
  for (const [n, a] of [["deployer", deployer], ["leader", leader], ["depositor2", depositor2]] as const) {
    const [s, u] = await bal(a.address);
    console.log(`  ${n.padEnd(10)} ${usd(s)} STT · ${usd(u)} USDso`);
  }
  console.log(`ledger: ${usd(BigInt(readLedger().usdsoIntoVaults))} USDso into vaults, ${usd(BigInt(readLedger().sttGas))} STT gas so far`);

  // ---- fund the leader (a transfer, not a vault deposit)
  await step("fund-leader", async () => {
    const [s, u] = await bal(leader.address);
    let hash: Hex | undefined;
    if (u < parseUnits("10", 18)) {
      ({ hash } = await send("deployer → leader 10 USDso", deployer, {
        to: usdso,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [leader.address, parseUnits("10", 18) - u] }),
      }));
    }
    if (s < parseUnits("3", 18)) {
      ({ hash } = await send("deployer → leader STT for gas", deployer, { to: leader.address, data: "0x", value: parseUnits("3", 18) - s }));
    }
    return { hash, note: "leader funded with 10 USDso + gas" };
  });

  // ---- 1. factory
  await step("deploy-factory", async () => {
    const { receipt, hash } = await send("deploy MandateFactory(marginBank)", deployer, {
      data: encodeDeployData({ abi: factoryAbi, bytecode: factoryArt.bytecode, args: [MARGIN_BANK] }),
    });
    d.factory = receipt.contractAddress!;
    d.factoryTx = hash;
    console.log(`      factory ${d.factory}`);
    addEvidence({ phase: "2", step: "Deploy MandateFactory", proves: "Factory bound to the live MarginBank; collateral read from getSystemConfig", hash, status: "success", after: `factory ${d.factory}` });
    return { hash };
  });
  const factory = d.factory!;

  // ---- 2. vault
  await step("create-vault", async () => {
    const params = {
      name: VAULT_NAME,
      symbol: "mBTCETH",
      leader: leader.address,
      mandate: {
        allowedPools: [BTC_POOL, ETH_POOL],
        maxLeverageX1e2: 300n,
        maxNotionalPerPool: parseUnits("25", 18),
        drawdownBps: 1500,
        perfFeeBps: 1000,
        leaderMinShareBps: 500,
        lockSeconds: 120,
        builder: deployer.address, // the app's builder code
        builderFeeBpsTimes1k: 1000n, // 1 bp
      },
    };
    const data = encodeFunctionData({ abi: factoryAbi, functionName: "createVault", args: [params] });
    const { receipt, hash } = await send(`factory.createVault("${VAULT_NAME}")`, deployer, { to: factory, data });
    const vault = (await pub.readContract({ address: factory, abi: factoryAbi, functionName: "vaultOfLeader", args: [leader.address] })) as Address;
    d.vaults.main = { address: vault, leader: leader.address, tx: hash, params };
    console.log(`      vault ${vault} (gasUsed ${receipt.gasUsed})`);
    addEvidence({
      phase: "2",
      step: `Create vault "${VAULT_NAME}"`,
      proves: "Mandate fixed at deploy: BTC+ETH only, 3x, 25 USDso/market, 15% drawdown → reduce-only, 10% perf fee, leader ≥5%, 120 s lock, 1 bp builder fee",
      hash,
      status: "success",
      after: `vault ${vault}`,
    });
    return { hash };
  });
  const vault = d.vaults.main.address;
  const snap = () => snapshot(vault, usdso);

  // ---- 3. deposits
  const depositStep = async (key: string, who: PrivateKeyAccount, label: string, amount: bigint) =>
    step(key, async () => {
      const before = await snap();
      reserveVaultDeposit(amount);
      await send(`${label} approves the vault for exactly ${usd(amount)} USDso`, who, {
        to: usdso,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, amount] }),
      });
      const { hash } = await send(`${label} vault.deposit(${usd(amount)})`, who, {
        to: vault,
        data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [amount] }),
      });
      const after = await snap();
      const shares = (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [who.address] })) as bigint;
      console.log(`      ${fmtSnap(after)} · ${label} holds ${usd(shares)} shares`);
      addEvidence({ phase: "2", step: `${label} deposits ${usd(amount)} USDso`, proves: key === "deposit-leader" ? "First deposit must be the leader; shares 1:1 when empty; USDso goes straight into the vault's own MarginBank account" : "Shares priced at NAV; collateral lands in the bank, locked for 120 s", hash, status: "success", before: fmtSnap(before), after: fmtSnap(after) });
      return { hash };
    });
  await depositStep("deposit-leader", leader, "leader", parseUnits("10", 18));
  await depositStep("deposit-depositor2", depositor2, "depositor2", parseUnits("15", 18));
  await depositStep("deposit-deployer", deployer, "deployer", parseUnits("10", 18));

  // ---- 4. open + close a small BTC position
  const { minQty } = await book(BTC_POOL);
  await step("trade-open-btc", async () => {
    const before = await snap();
    const price = await marketablePrice(BTC_POOL, true);
    const { hash } = await send(`leader → vault.trade(BTC, BUY, ${minQty}, IOC @ ${usd(price, 1)})`, leader, {
      to: vault,
      gas: ORDER_GAS,
      data: tradeData(BTC_POOL, true, price, minQty, 2),
    });
    const after = await snap();
    console.log(`      ${fmtSnap(after)}`);
    const pos = after.positions.find((p) => p.pool === BTC_POOL)!;
    addEvidence({ phase: "2", step: `Leader opens a long of 0.00013 BTC (IOC)`, proves: `vault.trade() placed an IOC as owner and filled: position ${pos.size} @ ${usd(pos.entry, 1)}; margin from the bank, builder fee attached`, hash, status: "success", before: fmtSnap(before), after: fmtSnap(after) });
    return { hash };
  });
  await step("trade-close-btc", async () => {
    const before = await snap();
    const pos = before.positions.find((p) => p.pool === BTC_POOL)!;
    if (pos.size === 0n) return { note: "already flat" };
    const isBid = pos.size < 0n;
    const qty = pos.size < 0n ? -pos.size : pos.size;
    const price = await marketablePrice(BTC_POOL, isBid);
    const { hash } = await send(`leader → vault.trade(BTC, ${isBid ? "BUY" : "SELL"}, ${qty}, IOC) — close`, leader, {
      to: vault,
      gas: ORDER_GAS,
      data: tradeData(BTC_POOL, isBid, price, qty, 2),
    });
    const after = await snap();
    console.log(`      ${fmtSnap(after)}`);
    addEvidence({ phase: "2", step: "Leader closes the BTC position (IOC)", proves: "A reducing order passes; the vault is flat again; NAV reflects realized PnL and fees", hash, status: "success", before: fmtSnap(before), after: fmtSnap(after) });
    return { hash };
  });

  // ---- 5. on-chain reverts
  await step("revert-market-not-allowed", async () => {
    const before = await snap();
    const [solMark, solBook] = await Promise.all([mark(SOL_POOL), book(SOL_POOL)]);
    const price = roundTick((solMark * 97n) / 100n, solBook.tick, false);
    const { hash, revert } = await send("leader → vault.trade(SOL pool) — must revert", leader, {
      to: vault,
      gas: 3_000_000n,
      data: tradeData(SOL_POOL, true, price, solBook.minQty, 3),
    }, { expectRevert: "MarketNotAllowed" });
    addEvidence({ phase: "2", step: "Order on SOL (not in the mandate)", proves: "The contract refuses markets outside the allowlist, on chain", hash, status: "reverted (expected)", decoded: `${revert?.name}() ${revert?.data}`, before: fmtSnap(before), after: fmtSnap(await snap()) });
    return { hash };
  });
  await step("revert-notional-cap", async () => {
    const before = await snap();
    const m = await mark(BTC_POOL);
    const { tick } = await book(BTC_POOL);
    const price = roundTick((m * 97n) / 100n, tick, false);
    const qty = 50_000n; // 0.0005 BTC ≈ 32 USDso > the 25 USDso per-market cap
    const { hash, revert } = await send("leader → vault.trade(BTC, 0.0005 BTC) — over the notional cap", leader, {
      to: vault,
      gas: ORDER_GAS,
      data: tradeData(BTC_POOL, true, price, qty, 3),
    }, { expectRevert: "NotionalCapExceeded" });
    addEvidence({ phase: "2", step: "Order of 0.0005 BTC (~32 USDso) vs a 25 USDso cap", proves: "The per-market notional cap is enforced on chain", hash, status: "reverted (expected)", decoded: `${revert?.name} ${revert?.data}`, before: fmtSnap(before), after: fmtSnap(await snap()) });
    return { hash };
  });

  // ---- 6. checkpoint
  await step("checkpoint", async () => {
    const before = await snap();
    const { hash, receipt } = await send("anyone → vault.checkpoint()", deployer, { to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "checkpoint" }) });
    const after = await snap();
    console.log(`      ${fmtSnap(after)} · hwm ${usd(after.hwm, 6)} · logs ${receipt.logs.length}`);
    addEvidence({ phase: "2", step: "checkpoint()", proves: after.pps > before.hwm ? "Gain above the high-water mark → fee shares minted to the leader" : "pps is at or below the high-water mark → no fee; inside the 15% band → no breach", hash, status: "success", before: `${fmtSnap(before)} · hwm ${usd(before.hwm, 6)}`, after: `${fmtSnap(after)} · hwm ${usd(after.hwm, 6)}` });
    return { hash };
  });

  // ---- 7. redeem half after the lock
  await step("redeem-depositor2-half", async () => {
    const until = (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "lockedUntil", args: [depositor2.address] })) as bigint;
    const now = BigInt((await pub.getBlock()).timestamp);
    if (now <= until) {
      const wait = Number(until - now + 3n);
      console.log(`      waiting ${wait}s for depositor2's lock to expire`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
    const shares = (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [depositor2.address] })) as bigint;
    const half = shares / 2n;
    const before = await snap();
    const w0 = await pub.readContract({ address: usdso, abi: erc20Abi, functionName: "balanceOf", args: [depositor2.address] });
    const { hash } = await send(`depositor2 → vault.redeem(${usd(half)} shares)`, depositor2, {
      to: vault,
      data: encodeFunctionData({ abi: vaultAbi, functionName: "redeem", args: [half] }),
    });
    const w1 = await pub.readContract({ address: usdso, abi: erc20Abi, functionName: "balanceOf", args: [depositor2.address] });
    const after = await snap();
    console.log(`      depositor2 received ${usd(w1 - w0, 6)} USDso · ${fmtSnap(after)}`);
    addEvidence({ phase: "2", step: `depositor2 redeems half (${usd(half)} shares) after the lock`, proves: `Paid ${usd(w1 - w0, 6)} USDso = shares × NAV / supply, withdrawn from free bank margin straight to the depositor`, hash, status: "success", before: fmtSnap(before), after: fmtSnap(after) });
    return { hash };
  });

  const l = readLedger();
  console.log(`\n✓ phase 2 done · ledger ${usd(BigInt(l.usdsoIntoVaults))} USDso into vaults, ${usd(BigInt(l.sttGas))} STT gas`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✖", e?.message ?? e);
  saveDeployments(d);
  process.exit(1);
});
