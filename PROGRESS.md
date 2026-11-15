# Progress

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery | ✅ done | docs/INTERFACES.md. Equity formula verified on 4 live accounts (≤12 wei); fork of Hideki works |
| 1 Contracts + tests | ✅ done | 38/38 tests: 36 unit (mocks, 2 fuzz × 10k runs) + 2 fork (real protocol, pinned block 50,487,900) |
| 2 Deploy + live evidence | ✅ done | factory + vault live; 11 evidence rows incl. 2 on-chain reverts; evidence/EVIDENCE.md |
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
- `forge test`: **38 passed, 0 failed**.
  - test/MandateVault.t.sol: 36 tests against mocks. Covers every revert path, share math with 3
    depositors, the lock, the leader minimum (redeem/deposit/transfer/dust), fee only above the HWM,
    drawdown → reduce-only → reducing passes / increasing reverts, keeper de-risking, the vault never
    approving a pool, and redeem with margin locked. Fuzz verified at 10,000 runs each (`--fuzz-runs 10000`; the default profile uses 512).
  - test/MandateFork.t.sol: 2 tests on a Foundry fork of Hideki against the real MarginBank and
    BTC/ETH/SOL pools. Deposit into the vault's own bank account, a resting order as owner (real
    order id), MarketNotAllowed, NotionalCapExceeded, cancelAll, no pool allowance, and redeem. An IOC
    filled 0.00013 BTC @ 63,751.5 on the real book and closePosition flattened it.
- Bugs found by the tests and fixed: a stale supply in deposit() after a fee checkpoint; dust trapping the leader.

## Phase 2: deploy and live evidence

- MandateFactory [0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58](https://explorer.testnet.somnia.network/tokyo/address/0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58) (deploy tx [0xcc8d75a6…](https://explorer.testnet.somnia.network/tokyo/tx/0xcc8d75a61c292221d99634b96373b9e2758f866eb69e1ae52bd7dd9f5879c54a), 63.4M gas)
- Vault "Mandate BTC/ETH Momentum" [0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF](https://explorer.testnet.somnia.network/tokyo/address/0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF) (create tx [0x4015b7ba…](https://explorer.testnet.somnia.network/tokyo/tx/0x4015b7ba886466da3baf31f8b483efbbd3010d4019882dee1e54b41ba7deab1f), 46.3M gas)
- Deposits 10 + 15 + 10 = 35 USDso; BTC IOC open/close round trip cost ~0.003 USDso.
- On-chain reverts: MarketNotAllowed [0x7fe4b28f…](https://explorer.testnet.somnia.network/tokyo/tx/0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990), NotionalCapExceeded(31.79, 25) [0xea703717…](https://explorer.testnet.somnia.network/tokyo/tx/0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832).
- depositor2 redeemed 7.5 shares → 7.49938 USDso [0x078ee210…](https://explorer.testnet.somnia.network/tokyo/tx/0x078ee210d905378e53f7a935093b25c0d99fa40082d72084d9e505c00c26a7a2).
- Every tx with before/after NAV: evidence/EVIDENCE.md. Spend so far: 35 USDso into vaults, 0.73 STT gas.
