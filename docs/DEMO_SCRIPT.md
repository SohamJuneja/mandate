# Demo shot list (2:30)

**Setup before recording**

- Browser at 1360 px wide, dark mode. Open these tabs in this order:
  1. **App:** <https://sohamjuneja.github.io/mandate/>
  2. **Main vault:** <https://sohamjuneja.github.io/mandate/#/vault/0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF>
  3. **Tripwire vault:** <https://sohamjuneja.github.io/mandate/#/vault/0xfAf0f9A5E71867A7ccaAff005082B9A71333A396>
  4. **SOL refusal (MarketNotAllowed):** <https://explorer.testnet.somnia.network/tokyo/tx/0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990>
  5. **Size refusal (NotionalCapExceeded):** <https://explorer.testnet.somnia.network/tokyo/tx/0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832>
  6. **Reactive guard close:** <https://explorer.testnet.somnia.network/tokyo/tx/0xa40b162a22f33df9e3278ca053016c341e367ed0d47f07f01169ba1473c13964>
  7. **Buy after the breach (ReduceOnly):** <https://explorer.testnet.somnia.network/tokyo/tx/0x3105fc64b136633fe45b0030c05e5a94662c238a2c54f351eea2f3850b21110e>
- **Terminal** in `E:\blockchain\mandate`, font size 16. Prepare two commands:
  - `npx tsx agent/run.ts --dry --minutes 1`. `--dry` pre-checks but sends nothing, so no funds move.
  - `Get-Content agent/journal.jsonl | Select-String precheck_refused | Select-Object -First 3`.
    These are the 3 refusals from the live run. The dry run appends new lines to the same file,
    so after recording run `git checkout agent/journal.jsonl` to keep the evidence file clean.
- **VS Code** open at `src/MandateVault.sol`, scrolled to `function trade`.
- **Claude Code** with the MCP server configured (`npx tsx agent/mcp.ts`). Optional: cut this
  shot if short on time.

| Time | Window / URL | Action | Say (exact lines) |
|---|---|---|---|
| 0:00–0:08 | Tab 1, vault list | Static, cursor still | "This bounty produced 60+ trading bots. None of them can safely take outside money. Mandate fixes that." |
| 0:08–0:20 | Tab 1 | Hover the mandate badges on the BTC/ETH row (BTC, ETH, 3x, $25/mkt, DD 15%) | "Mandate is a vault on dreamDEX perps. A leader, a human or an AI agent, trades the pool, but only inside rules written into the contract." |
| 0:20–0:38 | Tab 2, main vault | Scroll slowly from the NAV cards to "The mandate" sentence and the rules list | "This vault reads in one sentence: BTC and ETH only, up to 3x, 25 dollars per market, and reduce-only if it falls 15 percent from its high. The leader can't withdraw your money. There is no function for it." |
| 0:38–0:50 | Tab 2 | Point at NAV, share price and high-water mark, then the deposit panel | "Depositors approve the exact amount. It goes straight into the vault's own dreamDEX margin account, and they get shares at live NAV. Everything on this page is read from chain. There's no backend." |
| 0:50–1:02 | VS Code, `MandateVault.sol` `trade()` | Highlight the lines with `MarketNotAllowed`, `NotionalCapExceeded`, `LeverageCapExceeded` and `ReduceOnly` | "Every order goes through this one function. It checks the market, the size and the leverage at mark, counting resting orders as filled, before it ever touches the order book." |
| 1:02–1:12 | Tab 4, explorer, SOL tx | Point at the status **Failed** and the revert `0x6f538c72` | "Here's the leader trying to trade SOL. It's not in the mandate, so the transaction reverted on chain with MarketNotAllowed." |
| 1:12–1:20 | Tab 5, explorer, size tx | Point at **Failed** | "And here's an order for 32 dollars against a 25-dollar cap. Refused on chain." |
| 1:20–1:40 | Terminal | Run the dry-run agent for about 8 s and show the start line with the mandate. Then run the `Select-String` command so the 3 `precheck_refused NotionalCapExceeded` lines show | "The leader in our live run was an AI agent. It reads funding and momentum, sizes a trade, and checks it against the mandate with an eth_call first. Three times it asked for too much, the vault said no, and it sized down. It placed eight real orders, all through the vault, and ended flat and in profit." |
| 1:40–1:50 | Tab 2 | Scroll to the Leader orders table. Show the executed rows and the two red "refused" rows | "Every order shows up here, including the refused ones, so depositors see the leader's whole record." |
| 1:50–2:02 | Tab 3, tripwire vault | Point at the **Reduce-only** badge | "Now the safety switch. This small vault has a tight drawdown limit. Our guard contract subscribes to dreamDEX position updates through Somnia's on-chain Reactivity." |
| 2:02–2:15 | Tab 6, explorer, guard close | Point at the block number (50505949), "to" the guard, and the internal calls | "When a fill pushed the vault past its limit, the chain called our guard in the same block. It latched reduce-only and closed the position. No keeper. No bot." |
| 2:15–2:20 | Tab 7, explorer, ReduceOnly tx | Point at **Failed** | "The leader's next buy? Reverted, ReduceOnly." |
| 2:20–2:30 | Claude Code calling `get_mandate`, or Tab 1 if the MCP shot was cut | Show the tool result | "Any agent can become a leader through our MCP server. Leaders earn a performance fee above the high-water mark, and the app earns a builder fee on every order. Mandate: let agents trade, inside the lines." |

**Recording notes**

- The dry-run agent sends no transactions. Don't run `agent/run.ts` without `--dry` while
  recording: that would place real orders.
- If an explorer page loads slowly, pre-load all four explorer tabs before you hit record.
- Mark prices change between takes, so the vault NAV can differ slightly from the evidence
  numbers. That is expected.
- Every hash and its NAV before and after is in `evidence/EVIDENCE.md` (Phases 2, 3 and 5).
