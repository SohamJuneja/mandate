// MCP server: lets any AI agent (Claude, Codex, …) be a Mandate vault leader.
// Tools: get_vault, get_mandate, propose_trade (pre-check only), trade, cancel.
// The signer is the leader key from .env; every trade goes through vault.trade(), so the agent
// can never exceed the mandate or touch depositor funds, whatever it decides.
//
//   claude mcp add mandate -- npx tsx E:/blockchain/mandate/agent/mcp.ts
//
// stdout carries the MCP protocol, so all logging goes to stderr.
console.log = console.error;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cancel, execute, fmtProposal, getMandate, getVault, journal, propose, vaultAddress, type Market } from "./leader.ts";

const server = new McpServer({ name: "mandate-leader", version: "0.1.0" });
const json = (x: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) }],
});
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: String((e as Error)?.message ?? e) }] });

const tradeShape = {
  market: z.enum(["BTC", "ETH"]).describe("Perp market"),
  side: z.enum(["buy", "sell"]),
  quantity: z.string().optional().describe('Base quantity in human units, e.g. "0.00013" BTC. Defaults to the minimum size.'),
  orderType: z.enum(["ioc", "postOnly", "limit", "fok"]).optional().describe("Default ioc (marketable)"),
  price: z.string().optional().describe("Limit price in USD. Default: mark ±2% for ioc/fok, mark ∓3% for resting orders."),
};

server.registerTool(
  "get_vault",
  { description: "Vault state: NAV, price per share, high-water mark, reduce-only flag, bank margin, positions with uPnL.", inputSchema: {} },
  async () => {
    try {
      return json(await getVault());
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "get_mandate",
  { description: "The rules the contract enforces on every order (markets, leverage, per-market cap, drawdown, fees, lock) and the current headroom.", inputSchema: {} },
  async () => {
    try {
      const m = await getMandate();
      return json({ ...m, _raw: undefined });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "propose_trade",
  { description: "Dry run: check an order against the mandate and simulate vault.trade() with eth_call. Sends nothing.", inputSchema: tradeShape },
  async (args) => {
    try {
      const p = await propose(args as any);
      journal({ kind: "mcp_propose", request: args, proposal: fmtProposal(p) });
      return json(fmtProposal(p));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "trade",
  { description: "Pre-check, then send vault.trade() as the leader. Refuses to send if the pre-check fails. Returns the tx hash and explorer link.", inputSchema: tradeShape },
  async (args) => {
    try {
      const p = await propose(args as any);
      if (!p.wouldPass) {
        journal({ kind: "mcp_precheck_refused", request: args, proposal: fmtProposal(p) });
        return json({ sent: false, reason: "pre-check failed", proposal: fmtProposal(p) });
      }
      const r = await execute(p, vaultAddress(), true);
      journal({ kind: "mcp_sent", request: args, tx: r.hash, link: r.link, orderId: r.orderId });
      return json({ sent: true, ...r, proposal: fmtProposal(p) });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "cancel",
  {
    description: "Cancel resting orders on a market: the given ids, or all of the vault's open orders there.",
    inputSchema: { market: z.enum(["BTC", "ETH"]), orderIds: z.array(z.string()).optional() },
  },
  async ({ market, orderIds }) => {
    try {
      const r = await cancel(market as Market, orderIds, vaultAddress(), true);
      journal({ kind: "mcp_cancel", market, orderIds, tx: r.hash });
      return json(r);
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`mandate-leader MCP server ready (vault ${vaultAddress()})`);
