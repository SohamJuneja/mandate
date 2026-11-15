# Demo script (2:00)

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:12 | Vault list (`#/`), hover the mandate badges | "AI agents can trade. The problem is trusting one with your money. Mandate is a perp vault on dreamDEX where the rules are in the contract, not in a promise." |
| 0:12–0:30 | Vault detail: the mandate sentence, then the rules list | "This vault reads in one sentence: BTC and ETH only, up to 3x, $25 per market, reduce-only if it falls 15% from its high. And the leader cannot withdraw your funds: there is simply no function for it." |
| 0:30–0:45 | Deposit panel: approve exact amount → deposit; NAV and shares update | "Depositors approve the vault for exactly what they put in. It goes straight into the vault's own dreamDEX margin account and buys shares at NAV." |
| 0:45–1:05 | Terminal: `npx tsx agent/run.ts`, signals scrolling; then the journal line `precheck_refused NotionalCapExceeded` | "The leader here is an AI agent. It reads funding and momentum, sizes the trade, and checks it against the mandate with an eth_call first. When it asked for four times the minimum size, the vault refused, so it sized down." |
| 1:05–1:20 | Vault page: Leader orders table, the two red "refused" rows, click into the explorer | "Every order shows here, including the ones the contract refused: a SOL order, outside the mandate, and an oversized BTC order. Both reverted on chain." |
| 1:20–1:45 | Tripwire vault page (reduce-only badge) + explorer for tx 0xa40b162a… | "The safety switch uses Somnia Reactivity. Our guard subscribes to the margin bank's position updates. When a fill pushed this vault past its drawdown limit, the chain itself called the guard in the same block. It latched reduce-only and flattened the position. No keeper, no bot. The next buy reverted ReduceOnly." |
| 1:45–2:00 | Claude Code with the MCP server: `get_mandate`, `propose_trade` | "Any agent can be a leader through our MCP server. The leader earns a performance fee above the high-water mark, and the app earns a builder fee on every order. Mandate: let agents trade, inside the lines." |

Recording notes: use the live pages. The tx hashes are in evidence/EVIDENCE.md (Phases 2, 3 and 5).
Keep the browser at 1360 px wide so the orders table fits.
