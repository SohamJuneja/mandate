# Decisions log

Choices made while working unattended, newest last. Each says what was decided and why.

## Phase 0

- **D0.1 Repo and keys.** Fresh repo at `E:\blockchain\mandate`, branch `main`, `.gitignore` committed
  first (`.env`, `.env.*` except `.env.example`, `out/`, `cache/`, `node_modules/`, `broadcast/`,
  `*.log`). Keys are copied from `vault-spike/.env` into `mandate/.env` (ignored). Scripts only
  ever print addresses.
- **D0.2 Equity source.** The bank exposes equity directly (`getAccountEquity` /
  `tryGetAccountEquity`, same value as `getAccountHealth().equity`). The vault uses that rather
  than recomputing PnL itself: one external call instead of an N-pool walk, and it cannot drift
  from what the protocol liquidates on. The formula was still reconstructed and checked against 4
  live accounts (≤12 wei), see docs/INTERFACES.md.
- **D0.3 Locked collateral counts.** `getAccountEquity` excludes collateral locked behind resting
  orders, so `nav = equity + locked + wallet`. Without `+ locked`, placing a resting order would
  look like a loss and could trip the drawdown breaker.
- **D0.4 Spend ledger.** All scripts route sends through `scripts/lib.ts:send`, which refuses any
  chain id other than 50383 and keeps `deployments/ledger.json` (USDso deposited into vaults, STT
  gas burned). It refuses a send that could push either past its cap (45 USDso / 15 STT).

## Phase 1

- **D1.1 Test strategy: both mock and fork.** A Foundry fork of Hideki works (HTTP RPC, real
  `MarginBank.deposit` and `PerpPool.placeOrder` execute). But prices cannot be moved on a fork and
  the oracle has a 5 s staleness window (`maxOracleStalenessSec = 5`), so `vm.warp` past a lock
  makes marks stale. The full behavioural suite therefore runs against mocks
  (`test/mocks/Mocks.sol`: a bank that marks positions to the pool's price, a book with resting
  orders, locks, IOC fills and reducing capacity). `test/MandateFork.t.sol` proves the same code
  against the real protocol at a pinned block.
- **D1.2 Leverage = worst-case notional / NAV.** For each allowed pool, exposure is
  max(position + all resting bids, −position + all resting asks) at mark, so resting orders count
  as if they fill. The new order is included. Conservative: a leader cannot get past the cap by
  stacking resting orders.
- **D1.3 Reducing orders skip the caps.** An order on the opposite side whose size fits in
  `effectiveReducingCapacity` (|position| minus resting opposite orders, from the pool's own
  `getReducingCapacity`) can only lower exposure. It is always allowed, including in reduce-only.
- **D1.4 reduceOnly is a one-way latch.** Once breached, the vault stays reduce-only. There is no
  admin and no un-breach. Deposits are refused (`ReduceOnly`), redemptions keep working, and
  anyone may `cancelAll` or `closePosition`. Simplest safe rule; a recovering leader can launch a
  new vault.
- **D1.5 Checkpoint runs inside deposit, redeem and trade**, so fees and breaches never depend on
  a keeper, and nobody enters or exits at a price with an uncrystallized fee. A breach detected
  inside a refused `trade()` is rolled back with the revert; an explicit `checkpoint()` latches it.
- **D1.6 HWM in price-per-share terms.** Deposits and redeems do not move pps, so the high-water
  mark needs no per-depositor bookkeeping. The fee is minted as new shares to the leader:
  `feeShares = feeAssets × supply / (nav − feeAssets)`. After minting, HWM is set to the post-fee pps.
- **D1.7 Leader minimum also applies to deposits and transfers.** A deposit that would dilute the
  leader below `leaderMinShareBps` reverts (Hyperliquid-style: the leader keeps skin in the game).
  Leader share transfers are checked too. Holders with ≤ 1e12 share-wei of dust do not bind the
  rule: the fuzzer showed a 1-wei unredeemable holder could otherwise trap the leader forever.
- **D1.8 Inflation guard.** Only the leader can make the first deposit, and it must be at least
  1 USDso. Shares round down and `ZeroShares`/`ZeroAmount` revert on dust. With 18-dp shares, a
  donation would need ~1e18× the victim's deposit to steal it (see `test_inflationAttackIsUneconomic`).
- **D1.9 NAV unavailable ⇒ deposit/redeem/trade revert `NavUnavailable`.** Pricing shares on a
  stale oracle would be worse than pausing. `checkpoint()` is a no-op in that state.
- **D1.10 Redeem pays from the vault wallet first, then withdraws only the shortfall** from free
  bank margin (`getWithdrawableCollateral`). If that is not enough it reverts
  `InsufficientFreeMargin(needed, withdrawable)`.
- **D1.11 Shares are transferable** (ERC-20), but locked shares cannot move (`SharesLocked`), so
  the lock cannot be dodged by transferring.
- **D1.12 Builder.** If the mandate names a builder, the constructor calls
  `pool.approveBuilder(builder, fee)` on each allowed pool. That is a fee-cap approval, not a token
  approval. Every order carries the builder code. `builder = 0` with a non-zero fee is rejected.
- **D1.13 Order expiry** is `block.timestamp + 1 day` (in ns). `closePosition` sends an IOC with a
  3% slippage bound from mark.
- **D1.14 Factory bounds:** leverage ≤ 10x, lock ≤ 30 days, perf fee ≤ 50%, one vault per leader
  (so the Phase 5 demo vault uses a different leader key).
- **D1.15 Removed `VaultInsolvent`.** Zero NAV with live shares always trips the drawdown latch
  first, so the error was unreachable. Keeping only reachable errors lets the tests cover every
  revert path.
- **D1.16 Real bug fixed during testing:** `deposit()` read `totalSupply()` before the fee
  checkpoint minted shares, so a depositor entering just after a gain was priced on a stale supply
  and short-changed. Caught by `test_fee_crystallizesBeforeDepositAndRedeem`.

## Phase 2

- **D2.1 Demo mandate numbers.** maxNotionalPerPool = 25 USDso: small, but above one minimum order
  on each market (BTC 0.00013 ≈ 8.3, ETH 0.004 ≈ 7.1), so the agent can trade and a 0.0005 BTC
  order (~32) demonstrably breaches it. Leverage 3x, drawdown 15%, lock 120 s, as specified.
- **D2.2 Builder = the deployer address, 1 bp** (`builderFeeBpsTimes1k = 1000`). It stands in for
  "the app" so the builder-fee business model runs end to end. The pool cap is 10 bps.
- **D2.3 Leader funding.** The leader key had no USDso, so the deployer transferred it 10 USDso and
  3 STT for gas. That is a wallet transfer, not a vault deposit, so it does not count against the
  45 USDso vault cap. The 35 USDso of deposits do.
- **D2.4 The close is an explicit reducing `trade()`** (IOC sell of the full size), not
  `closePosition()`, to show that a reducing leader order passes the checks. `closePosition` is
  exercised in Phase 5 by the keeper.
- **D2.5 Simulation gas for unbounded txs.** The first factory deploy attempt stopped in
  simulation with an empty revert: a 3M cap is far below the ~63M a 19 KB deploy costs on Somnia.
  `send()` now estimates first and simulates with the estimate. Nothing was sent in the failed attempt.

## Phase 3

- **D3.1 Strategy.** score = 1-minute momentum (bps, 4 samples × 15 s) − 0.5 × funding (bps per
  8 h, from `getCurrentFundingRate`, 1e18-scaled → 1e14 = 1 bp). Long above +2, short below −2,
  else flat. One order per market per cycle. Flips go close first, open on a later cycle. Size =
  minQty × k with k = 1 + ⌊|score|/2⌋ ≤ 4. A deliberately simple signal: the point is the rails, not
  the alpha.
- **D3.2 Pre-check = mirror plus eth_call.** The agent recomputes the vault's checks off-chain
  (worst-case notional, leverage, reduce-only) to explain refusals, but the authority is an
  `eth_call` of `vault.trade()` from the leader (10M gas cap). The full size is always tried
  first, so mandate refusals show in the journal. The agent then steps down to the largest size
  that passes.
- **D3.3 Order budget includes flattening.** At most 8 orders in total. The loop stops opening once
  the remaining budget is only enough to flatten. The run took ~7 of the allowed 20 minutes,
  because the budget ran out first.
- **D3.4 MCP server** (`agent/mcp.ts`, stdio) uses the same core. `trade` re-runs the pre-check
  and refuses to send if it fails, so an LLM leader cannot even pay gas for a mandate violation.
  stdout is reserved for the protocol; all logs go to stderr.
- **D3.5 The dry-run journal** from testing the loop is kept separately as
  `agent/journal-dryrun.jsonl`. `agent/journal.jsonl` is the live run only.
