# Progress

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery | ✅ done | docs/INTERFACES.md. Equity formula verified on 4 live accounts (≤12 wei); fork of Hideki works |
| 1 Contracts + tests | ✅ done | 38/38 tests: 36 unit (mocks, 2 fuzz × 10k runs) + 2 fork (real protocol, pinned block 50,487,900) |
| 2 Deploy + live evidence | ✅ done | factory + vault live; 11 evidence rows incl. 2 on-chain reverts; evidence/EVIDENCE.md |
| 3 Leader agent | ✅ done | 8 live orders via vault.trade(), 3 pre-check refusals journaled, ended flat, NAV 27.4977 → 27.5725; MCP server smoke-tested |
| 4 Frontend | ✅ done | web/: list, detail (pps chart, mandate, positions, refused orders, deposit/redeem), create; npm run build OK; screenshots/ |
| 5 Reactivity switch | ✅ done | on-chain subscription; guard fired in the SAME block as the fill, latched reduce-only and flattened; ReduceOnly revert on chain |
| 6 Docs | ✅ done | README (judges table, mermaid, enforcement, business model, mainnet path, limitations), docs/X_POSTS.md, docs/DEMO_SCRIPT.md, 5 feedback reports |

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

## Phase 3: leader agent

- agent/leader.ts (core), agent/run.ts (autonomous loop), agent/mcp.ts (MCP: get_vault, get_mandate, propose_trade, trade, cancel), agent/mcp-smoke.ts (PASS).
- Live run: 8 IOC orders on BTC/ETH, all through vault.trade(), ended flat. NAV 27.4977 → 27.5725 (+0.27%), pps 1.00238. Journal: agent/journal.jsonl (38 lines: 3 precheck_refused NotionalCapExceeded for ×4 sizes, then resized ×3). Tx links in evidence/EVIDENCE.md (Phase 3 section).

## Phase 4: frontend

- web/ (Vite + React + viem, injected wallet). Reads the factory, vaults, bank and pools from chain (multicall + archive eth_call for the share-price chart). Trade history and refused orders come from the public explorer tx list, and each refusal reason is decoded by replaying the tx with eth_call at the parent block.
- npm run build passes. Screenshots: screenshots/list.png, vault.png, create.png, vault-mobile.png.

## Phase 5: Reactivity safety switch

- MandateGuard [0x7aaf47230520a7d1ebe07f862aca3b66e204d732](https://explorer.testnet.somnia.network/tokyo/address/0x7aaf47230520a7d1ebe07f862aca3b66e204d732), subscription id 44122688 on precompile 0x0100 (PositionUpdated, topic1 = tripwire vault).
- Tripwire vault [0xfAf0f9A5E71867A7ccaAff005082B9A71333A396](https://explorer.testnet.somnia.network/tokyo/address/0xfAf0f9A5E71867A7ccaAff005082B9A71333A396) (BTC, 3x, drawdown 20 bps, 5 USDso).
- Fill 1 (open 0.00023 BTC) → guard fired in the same block 50505412, inside the band, no action.
- Fill 2 (reducing slice after the mark moved) → guard fired in the same block 50505949: reduce-only latched, remaining position closed ([0xa40b162a…](https://explorer.testnet.somnia.network/tokyo/tx/0xa40b162a22f33df9e3278ca053016c341e367ed0d47f07f01169ba1473c13964)). Its own close re-triggered it once (no-op).
- Leader buy after the breach reverted ReduceOnly on chain ([0x3105fc64…](https://explorer.testnet.somnia.network/tokyo/tx/0x3105fc64b136633fe45b0030c05e5a94662c238a2c54f351eea2f3850b21110e)).
- Tests: 41/41 (3 new guard tests).
