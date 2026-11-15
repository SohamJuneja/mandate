# Progress

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery | ✅ done | docs/INTERFACES.md. Equity formula verified on 4 live accounts (≤12 wei); fork of Hideki works |
| 1 Contracts + tests | ✅ done | 38/38 tests: 36 unit (mocks, 2 fuzz × 10k runs) + 2 fork (real protocol, pinned block 50,487,900) |
| 2 Deploy + live evidence | ⏳ | |
| 3 Leader agent | ⏳ | |
| 4 Frontend | ⏳ | |
| 5 Reactivity switch | ⏳ | |
| 6 Docs | ⏳ | |

## Phase 0: discovery

- (a) `MarginBank.getAccountEquity` / `tryGetAccountEquity` give equity including uPnL at mark and
  unsettled funding, excluding locked collateral. The same value as `getAccountHealth().equity`.
- (b) `MarginBank.getPosition(account, pool)` returns size and avgEntryPrice;
  `PerpPool.getReducingCapacity(account)` adds the resting quantities.
- (c) `PerpPool.tryGetMarkPrice()` / `getHealthSnapshot()`.
- (d) Owner `placeOrder(..., builder, builderFeeBpsTimes1k)` returns `(bool, uint128 id)`. Builder
  approval is the owner's `approveBuilder(builder, cap)`, per pool. The cap is 10 bps on BTC and ETH.
- (e) `MarginBank.PositionUpdated(account, perpPool, newSize, avgEntryPrice, realizedPnl, entryFundingIndex)`.
- No transactions sent.

## Phase 1: contracts and tests

- src/MandateFactory.sol: createVault, one vault per leader, VaultCreated, collateral read live from the bank.
- src/MandateVault.sol: ERC-20 shares, immutable mandate, nav/pricePerShare, deposit/redeem with lock,
  leader minimum, trade with allowlist, per-pool notional and worst-case leverage caps, reduce-only,
  cancel/cancelAll/closePosition (anyone once breached), checkpoint (fee above HWM / drawdown latch).
- Runtime sizes: factory 19.1 KB, vault 13.6 KB.
- Error: ’test’ is not a Forge command.

Run forge --help to see the full list of available commands.: **38 passed, 0 failed**.
  - test/MandateVault.t.sol: 36 tests against mocks. Covers every revert path, share math with 3
    depositors, the lock, the leader minimum (redeem/deposit/transfer/dust), fee only above the HWM,
    drawdown → reduce-only → reducing passes / increasing reverts, keeper de-risking, the vault never
    approving a pool, and redeem with margin locked. Fuzz runs at 10,000 each (; default 512).
  - test/MandateFork.t.sol: 2 tests on a Foundry fork of Hideki against the real MarginBank and
    BTC/ETH/SOL pools. Deposit into the vault's own bank account, a resting order as owner (real
    order id), MarketNotAllowed, NotionalCapExceeded, cancelAll, no pool allowance, and redeem. An IOC
    filled 0.00013 BTC @ 63,751.5 on the real book and closePosition flattened it.
- Bugs found by the tests and fixed: a stale supply in deposit() after a fee checkpoint; dust trapping the leader.
