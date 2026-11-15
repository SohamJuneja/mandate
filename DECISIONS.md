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
