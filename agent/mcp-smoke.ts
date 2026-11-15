// Smoke test for the MCP server: spawn it over stdio like an AI client would, list the tools, and
// call the read-only ones (get_vault, get_mandate, propose_trade). Sends nothing.
//   npx tsx agent/mcp-smoke.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(root, "node_modules", "tsx", "dist", "cli.mjs"), resolve(root, "agent", "mcp.ts")],
  cwd: root,
  env: { ...process.env } as Record<string, string>, // VAULT_ADDRESS / LEADER_KEY_ENV pass through
  stderr: "inherit",
});
const client = new Client({ name: "mandate-smoke", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const text = (r: any) => r.content?.[0]?.text ?? JSON.stringify(r);

const vault = JSON.parse(text(await client.callTool({ name: "get_vault", arguments: {} })));
console.log("get_vault:", { nav: vault.navUsd, pps: vault.pricePerShare, reduceOnly: vault.reduceOnly });
const mandate = JSON.parse(text(await client.callTool({ name: "get_mandate", arguments: {} })));
console.log("get_mandate:", { markets: mandate.allowedMarkets, lev: mandate.maxLeverage, cap: mandate.maxNotionalPerMarketUsd, headroom: mandate.perMarket });

const ok = JSON.parse(text(await client.callTool({ name: "propose_trade", arguments: { market: "BTC", side: "buy" } })));
console.log("propose_trade BTC buy min:", { wouldPass: ok.wouldPass, notional: ok.worstCaseNotionalUsd, sim: ok.simulation });
const big = JSON.parse(text(await client.callTool({ name: "propose_trade", arguments: { market: "BTC", side: "buy", quantity: "0.001" } })));
console.log("propose_trade BTC buy 0.001:", { wouldPass: big.wouldPass, sim: big.simulation, failed: big.checks.filter((c: any) => !c.ok).map((c: any) => `${c.name}: ${c.detail}`) });

// force_trade_for_demo must refuse an order that would succeed (sends nothing).
const forced = await client.callTool({ name: "force_trade_for_demo", arguments: { market: "BTC", side: "buy" } });
const forcedRefused = (forced as any).isError === true && /would SUCCEED/.test(text(forced));
console.log("force_trade_for_demo on a passing BTC order:", forcedRefused ? "refused, nothing sent" : text(forced));

await client.close();
const pass = tools.tools.length === 6 && forcedRefused && ok.wouldPass === true && big.wouldPass === false && big.simulation.errorName === "NotionalCapExceeded";
console.log(pass ? "MCP SMOKE: PASS" : "MCP SMOKE: FAIL");
process.exit(pass ? 0 : 1);
