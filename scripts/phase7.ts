// Phase 7: an LLM (Claude, via the MCP server) as a vault leader.
//   1. Fund the CLAUDE_LEADER key from the deployer: 3 STT for gas, 6 USDso.
//   2. Create "Claude-led BTC": BTC only, 2x, 15 USDso per market, 10% drawdown, 120 s lock.
//   3. CLAUDE_LEADER deposits 5 USDso (the leader must deposit first).
// Then the user runs Claude with agent/mcp.ts bound to this vault (VAULT_ADDRESS,
// LEADER_KEY_ENV=CLAUDE_LEADER_PRIVATE_KEY). Resumable via deployments/hideki.json.
import { encodeFunctionData, parseUnits, type Address } from "viem";
import { BTC_POOL, assertChain, erc20Abi, key, keys, pub, reserveVaultDeposit, send, usd } from "./lib.ts";
import { addEvidence, factoryAbi, fmtSnap, loadDeployments, saveDeployments, snapshot, vaultAbi } from "./vaultlib.ts";

const d = loadDeployments();
const { deployer } = keys();
const claude = key("CLAUDE_LEADER_PRIVATE_KEY");

async function step(k: string, fn: () => Promise<{ hash?: `0x${string}`; note?: string } | void>) {
  if (d.steps[k]) return console.log(`· skip ${k}`);
  console.log(`\n▶ ${k}`);
  const r = (await fn()) ?? {};
  d.steps[k] = { hash: r.hash, at: new Date().toISOString(), note: r.note };
  saveDeployments(d);
}

async function main() {
  await assertChain();
  const usdso = d.collateral!;
  const factory = d.factory!;
  console.log(`CLAUDE_LEADER ${claude.address}`);

  await step("p7-fund-stt", async () => {
    const { hash } = await send("deployer → CLAUDE_LEADER 3 STT for gas", deployer, { to: claude.address, data: "0x", value: parseUnits("3", 18) });
    return { hash };
  });
  await step("p7-fund-usdso", async () => {
    const { hash } = await send("deployer → CLAUDE_LEADER 6 USDso", deployer, {
      to: usdso,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [claude.address, parseUnits("6", 18)] }),
    });
    return { hash };
  });

  await step("p7-create-vault", async () => {
    const params = {
      name: "Claude-led BTC",
      symbol: "mCLAUDE",
      leader: claude.address,
      mandate: {
        allowedPools: [BTC_POOL],
        maxLeverageX1e2: 200n,
        maxNotionalPerPool: parseUnits("15", 18),
        drawdownBps: 1000,
        perfFeeBps: 1000,
        leaderMinShareBps: 500,
        lockSeconds: 120,
        builder: deployer.address,
        builderFeeBpsTimes1k: 1000n,
      },
    };
    const { hash } = await send('factory.createVault("Claude-led BTC")', deployer, {
      to: factory,
      data: encodeFunctionData({ abi: factoryAbi, functionName: "createVault", args: [params] }),
    });
    const vault = (await pub.readContract({ address: factory, abi: factoryAbi, functionName: "vaultOfLeader", args: [claude.address] })) as Address;
    d.vaults.claude = { address: vault, leader: claude.address, tx: hash, params };
    console.log(`      vault ${vault}`);
    addEvidence({ phase: "7", step: 'Create "Claude-led BTC" for an LLM leader', proves: "Mandate fixed at deploy: BTC only, 2x, 15 USDso/market, 10% drawdown → reduce-only, 120 s lock; leader = a fresh key used only by the MCP server", hash, status: "success", after: `vault ${vault}` });
    return { hash };
  });
  const vault = d.vaults.claude.address;

  await step("p7-deposit", async () => {
    const amount = parseUnits("5", 18);
    reserveVaultDeposit(amount);
    await send("CLAUDE_LEADER approves exactly 5 USDso", claude, { to: usdso, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, amount] }) });
    const { hash } = await send("CLAUDE_LEADER deposits 5 USDso", claude, { to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [amount] }) });
    const s = await snapshot(vault, usdso);
    console.log(`      ${fmtSnap(s)}`);
    addEvidence({ phase: "7", step: "LLM leader's key seeds the vault with 5 USDso", proves: "Leader deposits first; exact-amount approval; collateral goes into the vault's own MarginBank account", hash, status: "success", after: fmtSnap(s) });
    return { hash };
  });

  const bal = await pub.getBalance({ address: claude.address });
  console.log(`\nDone. vault ${vault} · CLAUDE_LEADER STT ${usd(bal)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
