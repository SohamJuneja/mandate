// Render evidence/evidence.json → evidence/EVIDENCE.md.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXPLORER_ADDR, ROOT, link, readLedger, usd } from "./lib.ts";
import { loadDeployments, loadEvidence } from "./vaultlib.ts";

const d = loadDeployments();
const rows = loadEvidence();
const ledger = readLedger();
const addr = (a?: string) => (a ? `[\`${a}\`](${EXPLORER_ADDR}${a})` : "—");

const PHASES: Record<string, string> = {
  "2": "Phase 2: deploy and live evidence",
  "3": "Phase 3: leader agent",
  "5": "Phase 5: Reactivity safety switch",
  "7": "Phase 7: LLM leader via MCP",
};

let md = `# Evidence: Mandate on dreamDEX perps (Somnia Tokyo testnet (Hideki, chain 50383))

Every row is a real transaction on Somnia Tokyo testnet (Hideki, chain 50383) unless marked *read*. "Reverted
(expected)" rows were sent on purpose as real transactions so the refusal has a hash; the decoded
error comes from replaying the mined tx with \`eth_call\` at the parent block.
NAV = bank equity (free collateral + uPnL at mark − funding) + locked collateral + vault wallet.
pps = NAV / share supply.

| Contract | Address |
|---|---|
| MarginBank | ${addr(d.marginBank)} |
| USDso (live from \`getSystemConfig\`) | ${addr(d.collateral)} |
| MandateFactory | ${addr(d.factory)} |
${Object.entries(d.vaults).map(([k, v]) => `| MandateVault (${k}) | ${addr(v.address)} |`).join("\n")}

Run totals (deployments/ledger.json): **${usd(BigInt(ledger.usdsoIntoVaults))} USDso** deposited into vaults (cap 52; 45 until Phase 7) ·
**${usd(BigInt(ledger.sttGas))} STT** of gas burned (cap 15) · ${ledger.txs.length} transactions.
`;

const byPhase = new Map<string, typeof rows>();
for (const r of rows) {
  if (!byPhase.has(r.phase)) byPhase.set(r.phase, []);
  byPhase.get(r.phase)!.push(r);
}
for (const [phase, list] of byPhase) {
  md += `\n## ${PHASES[phase] ?? `Phase ${phase}`}\n\n| # | Step | What it proves | Tx | Result | NAV / pps before → after |\n|---|---|---|---|---|---|\n`;
  list.forEach((r, i) => {
    const tx = r.hash ? `[${r.hash.slice(0, 10)}…](${link(r.hash)})` : "*read*";
    const res = r.status === "reverted (expected)" ? `⛔ reverted (expected)<br>\`${(r.decoded ?? "").slice(0, 90)}\`` : r.status === "read" ? "read" : "✅ success";
    const navs = r.before || r.after ? `${r.before ? short(r.before) : ""}${r.before && r.after ? "<br>→ " : ""}${r.after ? short(r.after) : ""}` : "";
    md += `| ${i + 1} | ${r.step} | ${r.proves} | ${tx} | ${res} | ${navs} |\n`;
  });
}

function short(s: string) {
  // Keep the NAV/pps/position part of a snapshot string compact.
  return s.replace(/ · supply [^·]+/, "").replace(/ · bank free /, " · free ").replace(/ · wallet [0-9.]+/, "");
}

md += `\n## All transactions (from the spend ledger)\n\n| Step | Status | Tx |\n|---|---|---|\n`;
for (const t of ledger.txs) md += `| ${t.step} | ${t.status} | ${link(t.hash as `0x${string}`)} |\n`;

writeFileSync(resolve(ROOT, "evidence", "EVIDENCE.md"), md);
console.log(`wrote evidence/EVIDENCE.md (${rows.length} evidence rows, ${ledger.txs.length} txs)`);
