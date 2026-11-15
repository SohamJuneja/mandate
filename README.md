# Mandate

**Hyperliquid-style vaults for AI agents on dreamDEX perps, with the mandate enforced on chain.** A
leader, human or AI agent, trades depositors' USDso only inside rules the contract checks on every
order. The leader has no way to withdraw a cent.

Live on Somnia Hideki testnet (chain 50383): factory
[`0x139d…ea58`](https://explorer.testnet.somnia.network/tokyo/address/0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58),
demo vault [`0x1F3c…D2eF`](https://explorer.testnet.somnia.network/tokyo/address/0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF).

![Vault detail](screenshots/vault.png)

## Judges start here

| Criterion | Where to look |
|---|---|
| **User value** | Depositors get a perp strategy without handing over keys. The rules are on chain and readable in one sentence on the vault page ("This leader can trade BTC and ETH, up to 3x, max $25 per market…"). Leaders, including bots, get capital without custody. [web/](web/), [screenshots/](screenshots/) |
| **Repeat-use loop** | Leader trades → share price moves → fee crystallizes above the high-water mark → depositors see the track record (pps chart, every executed and refused order) → more deposits. The MCP server lets any AI agent become a leader in one command. [agent/](agent/) |
| **Technical execution** | 41 Foundry tests: 39 against behavioural mocks (every revert path, 2 fuzz tests verified at 10k runs) and 2 on a **fork of Hideki against the real MarginBank and pools**. [src/](src/), [test/](test/), [PROGRESS.md](PROGRESS.md) |
| **Live orders and tx hashes** | 29 evidence rows and 32 transactions with explorer links. They include an IOC round trip, 8 orders by the autonomous agent, on-chain refusals (`MarketNotAllowed`, `NotionalCapExceeded`, `ReduceOnly`), and a redeem. [evidence/EVIDENCE.md](evidence/EVIDENCE.md) |
| **Somnia primitives** | **On-chain Reactivity**: `MandateGuard` subscribes, via precompile `0x0100`, to `MarginBank.PositionUpdated` for a vault. In the **same block** as a fill it checkpoints the vault, latches reduce-only on a drawdown breach, and flattens it. No keeper. Also 100 ms blocks, archive `eth_call` for charts, and the dreamDEX perp engine. [src/MandateGuard.sol](src/MandateGuard.sol), Phase 5 in [EVIDENCE.md](evidence/EVIDENCE.md) |
| **Business model** | Performance fee to the leader (default 10% above the high-water mark, paid in shares). Builder fee to the app on every order (dreamDEX builder codes, 1 bp in the demo). [Business model](#business-model) |
| **Mainnet path** | [Mainnet path](#mainnet-path) |

## Architecture

```mermaid
flowchart LR
    subgraph Users
      D[Depositors] -->|deposit / redeem| V
      L[Leader: human or AI agent] -->|trade / cancel| V
      A[Any AI agent] -->|MCP: get_mandate, propose_trade, trade| MCP[agent/mcp.ts]
      MCP -->|eth_call pre-check, then vault.trade| V
    end
    F[MandateFactory] -->|createVault: one per leader| V[MandateVault<br/>ERC-20 shares + immutable mandate]
    V -->|approve exact amount, deposit, withdraw| MB[(dreamDEX MarginBank)]
    V -->|placeOrder / cancelOrder as owner<br/>+ builder code| P[(PerpPools: BTC, ETH)]
    P -->|fills| MB
    MB -->|PositionUpdated account = vault| R{{Somnia Reactivity<br/>precompile 0x0100}}
    R -->|same block: onEvent| G[MandateGuard]
    G -->|checkpoint, then closePosition if breached| V
    W[web/: Vite + React + viem] -.->|reads chain + explorer API| V
```

## How the mandate is enforced

Everything is in [`MandateVault.sol`](src/MandateVault.sol). Settings are `immutable` (the market
list is written once in the constructor). There is no owner, admin or upgrade path.

1. **Custody.** USDso goes straight from the depositor into the vault's own MarginBank account. The
   only token approval the vault ever gives is to the MarginBank, for the exact deposit amount
   (tested: no pool ever gets an allowance). The leader's functions are `trade`, `cancel`,
   `cancelAll` and `closePosition`. None of them moves collateral out. `redeem` pays the shareholder only.
2. **Every order is checked at mark before it is placed**, against worst-case exposure (positions
   plus every resting order filling):
   - market not in `allowedPools` → `MarketNotAllowed()`
   - worst-case notional on that market > `maxNotionalPerPool` → `NotionalCapExceeded(notional, cap)`
   - Σ worst-case notional > `maxLeverage × NAV` → `LeverageCapExceeded(total, nav, max)`
   - Orders that only shrink a position (sized by the pool's `getReducingCapacity`) are always
     allowed. They are the only thing allowed once the vault is breached.
3. **NAV** = `MarginBank.tryGetAccountEquity` (free collateral + uPnL at mark − funding) +
   collateral locked behind orders + wallet USDso. It was verified against the bank to ≤12 wei on
   4 live accounts ([docs/INTERFACES.md](docs/INTERFACES.md)).
4. **High-water mark and drawdown breaker.** `checkpoint()` runs inside every deposit, redeem and
   trade, and anyone can call it. Above the high-water mark it mints fee shares to the leader. When
   price-per-share drops `drawdownBps` below the mark, it latches `reduceOnly` for good. From then on
   anyone may cancel orders and close positions, and deposits stop. Redemptions keep working.
5. **Skin in the game.** The leader makes the first deposit and must hold `leaderMinShareBps` of the
   shares while others hold any. Deposits are locked for `lockSeconds`, for redeem and transfer alike.
6. **Reactive enforcement.** `MandateGuard` makes the breaker fire within the same block as the
   fill that caused it, with nobody watching.

## Business model

- **Performance fee → leader.** `perfFeeBps` (default 10%) of gains above the high-water mark,
  minted as shares. Charged only on new highs, never on recovering losses. The leader is paid in the
  same asset depositors hold.
- **Builder fee → the app.** Each vault carries a dreamDEX builder code and fee (here: the app
  address, 1 bp of notional), approved per pool by the vault itself. Every agent order, keeper
  close and manual trade pays the app. Agent leaders trade often, so the fee scales with their
  activity, not with assets under management.
- Later: a factory listing fee, and a curated "verified agent" tier.

## Mainnet path

1. Point the factory at the mainnet MarginBank. Collateral is read from `getSystemConfig` at
   deploy, so nothing else is hardcoded besides pool addresses.
2. Audit `MandateVault` / `MandateGuard`, especially NAV under oracle failure, the leverage
   mirror, and fee math. The fork tests are the starting point.
3. Fund the reactivity subscription owner (32 SOMI minimum balance), one subscription per vault,
   created by the factory on `createVault`.
4. Raise the factory bounds (lock, leverage) per market risk, and add per-vault deposit caps.
5. Ship the MCP server as an npm package so a leader agent needs only a key and a vault address.

## Honest limitations

- **Leverage is checked at order time, at mark.** Price moves after a fill can push real leverage
  above the cap. That is bounded by the drawdown breaker, not prevented.
- **The reactive breaker needs an event.** Price moves alone emit nothing, so a breach is detected
  at the next fill on the vault (or any public `checkpoint()`/`poke()`). A periodic subscription
  (BlockTick/Schedule) or an oracle-update subscription would close that gap, at a gas cost.
- **NAV depends on the oracle.** If the mark is stale, deposits, redeems and trades revert
  `NavUnavailable` instead of pricing on bad data. Funds cannot move until it recovers.
- **Redeems need free margin.** With margin locked in positions, large redemptions revert
  `InsufficientFreeMargin` until the leader (or, once breached, anyone) frees it. There is no
  forced-unwind queue yet.
- **`closePosition` crosses up to 3% from mark.** That is fine for small vaults; larger vaults need
  sliced closes.
- **Testnet only, unaudited.** The frontend uses the public explorer API for tx history. Hideki
  `eth_getLogs` is limited to 1000 blocks.
- The agent's signal (momentum minus half the funding rate) is deliberately simple. The point is
  the rails.

## Run it

```bash
# contracts
forge build && forge test                      # 41 tests (fork tests use the pinned Hideki block)

# frontend (reads chain; connect any injected wallet on chain 50383)
cd web && npm install && npm run dev           # http://localhost:5173

# leader agent (needs .env with OPERATOR_PRIVATE_KEY = the vault's leader)
npm install
npx tsx agent/run.ts --minutes 15 --max-orders 8      # autonomous loop; add --dry to send nothing
claude mcp add mandate -- npx tsx E:/blockchain/mandate/agent/mcp.ts   # any MCP client as leader
npx tsx agent/mcp-smoke.ts                             # read-only MCP check
```

Repo map: [src/](src/) contracts · [test/](test/) Foundry · [scripts/](scripts/) deploy + evidence ·
[agent/](agent/) bot + MCP · [web/](web/) frontend · [evidence/](evidence/) tx proof ·
[docs/](docs/) interfaces, demo script, posts · [feedback/](feedback/) SDK/RPC bug reports ·
[DECISIONS.md](DECISIONS.md) · [PROGRESS.md](PROGRESS.md) · [REPORT.md](REPORT.md)
