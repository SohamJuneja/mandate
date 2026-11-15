# Progress

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery | ✅ done | docs/INTERFACES.md. Equity formula verified on 4 live accounts (≤12 wei); fork of Hideki works |
| 1 Contracts + tests | ⏳ | |
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
