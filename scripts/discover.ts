// Phase 0 discovery: verify the equity / position / mark views on live accounts.
// Reads only. Output feeds docs/INTERFACES.md.
import { decodeEventLog, toHex, type Address, type Hex } from "viem";
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { HTTP_RPC, MARGIN_BANK, WS_RPC, assertChain, bankAbi, poolAbi, pub, usd } from "./lib.ts";

const TOPIC = "0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de"; // PositionUpdated (6-arg)

async function getLogs(from: bigint, to: bigint) {
  const r = await fetch(HTTP_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: MARGIN_BANK, fromBlock: toHex(from), toBlock: toHex(to), topics: [TOPIC] }] }),
  });
  const j: any = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result as { topics: Hex[]; data: Hex; blockNumber: Hex }[];
}

async function main() {
  await assertChain();
  const head = await pub.getBlockNumber();
  // Scan back in 1000-block windows (the RPC's eth_getLogs limit) for accounts that hold positions now.
  const accounts = new Map<Address, Set<Address>>();
  let windows = 0;
  for (let to = head; windows < 40 && accounts.size < 12; to -= 1000n, windows++) {
    for (const l of await getLogs(to - 999n, to)) {
      const ev = decodeEventLog({ abi: bankAbi, data: l.data, topics: l.topics as any }) as any;
      const a = ev.args.account as Address;
      if (!accounts.has(a)) accounts.set(a, new Set());
      accounts.get(a)!.add(ev.args.perpPool);
    }
  }
  console.log(`scanned ${windows} windows (${windows * 1000} blocks), ${accounts.size} accounts with PositionUpdated`);

  const exchange = new SomniaMarkets({ chain: hidekiTestnet, wsRpcUrl: WS_RPC, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES } as any);
  const sdk = (exchange as any).client;

  let checked = 0;
  for (const account of accounts.keys()) {
    if (checked >= 4) break;
    const blockNumber = await pub.getBlockNumber();
    const B = { address: MARGIN_BANK, abi: bankAbi, blockNumber } as const;
    const st = await pub.readContract({ ...B, functionName: "getAccountState", args: [account] });
    if (st.activePerpPools.length === 0) continue;
    const [eq, health] = await Promise.all([
      pub.readContract({ ...B, functionName: "tryGetAccountEquity", args: [account] }),
      pub.readContract({ ...B, functionName: "getAccountHealth", args: [account] }).catch(() => null),
    ]);
    if (!eq[0]) continue;
    let upnl = 0n;
    let funding = 0n;
    let notional = 0n;
    const rows: string[] = [];
    for (const pool of st.activePerpPools) {
      const P = { address: pool, abi: poolAbi, blockNumber } as const;
      const [pos, snap] = await Promise.all([
        pub.readContract({ ...B, functionName: "getPosition", args: [account, pool] }),
        pub.readContract({ ...P, functionName: "getHealthSnapshot" }),
      ]);
      const size = BigInt(pos.size);
      const u = (size * (BigInt(snap.markPrice) - BigInt(pos.avgEntryPrice))) / snap.oneBase;
      const f = (size * (snap.projectedCumulativeFunding - pos.entryFundingIndex)) / snap.oneBase / 10n ** 18n;
      const n = ((size < 0n ? -size : size) * snap.markPrice) / snap.oneBase;
      upnl += u;
      funding += f;
      notional += n;
      rows.push(`    pool ${pool} size=${size} entry=${usd(pos.avgEntryPrice, 2)} mark=${usd(snap.markPrice, 2)} oneBase=${snap.oneBase} uPnL=${usd(u)} fundingOwed=${usd(f)} notional=${usd(n)}`);
    }
    const unlocked = BigInt(st.unlockedCollateralBalance);
    const f1 = unlocked + upnl - funding;
    const f2 = unlocked + upnl;
    const sdkEq = await sdk.getAccountEquity(account, { scope: "perps", marginBank: MARGIN_BANK, blockNumber });
    console.log(`\naccount ${account} @ block ${blockNumber}`);
    rows.forEach((r) => console.log(r));
    console.log(`    unlocked=${usd(unlocked)} locked=${usd(st.lockedCollateral)}`);
    console.log(`    bank.getAccountEquity        = ${usd(eq[1], 6)}`);
    console.log(`    bank.getAccountHealth.equity = ${health ? usd(health[0], 6) : "reverted"}`);
    console.log(`    SDK getAccountEquity.equity  = ${usd(sdkEq.equity, 6)}  totalEquity=${usd(sdkEq.totalEquity, 6)}`);
    console.log(`    unlocked + ΣuPnL − Σfunding  = ${usd(f1, 6)}  (Δ vs bank ${f1 - eq[1]} wei)`);
    console.log(`    unlocked + ΣuPnL             = ${usd(f2, 6)}  (Δ vs bank ${f2 - eq[1]} wei)`);
    console.log(`    leverage Σnotional/(equity+locked) = ${Number((notional * 10000n) / (eq[1] + st.lockedCollateral)) / 10000}x`);
    checked++;
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
