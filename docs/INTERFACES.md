# dreamDEX perps — on-chain interfaces Mandate depends on

Hideki testnet (chain 50383), `@somnia-chain/markets-sdk` 0.32.1. Every signature below was
taken from the SDK's shipped ABIs (`src/readsAbi.ts`, `src/tradeAbi.ts`, `src/eventsAbi.ts`) and
then exercised against the live chain, either by `eth_call` (scripts/discover.ts) or by
executing the real contracts on a Foundry fork of Hideki (test/ForkProbe.t.sol).

| Contract | Address |
|---|---|
| MarginBank (proxy) | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` |
| Collateral (USDso, Hyperlane synthetic, 18 dp) | `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`, read live from `getSystemConfig().collateralToken` |
| PerpPoolFactory | `0xE631fAEE547baeE07353E290f0562ea67d856560` |
| OperatorPermissionsRegistry | `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a` (not used by Mandate: the vault trades as owner) |
| BTC perp pool (base 8 dp, oneBase 1e8) | `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0` |
| ETH perp pool (base 18 dp) | `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf` |
| SOL perp pool (used as the "not allowed" market) | `0xB483ec1fb34996638677c20ab087b16F1896FA53` |

> The SDK's baked-in `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` (`0x9E9492…`) is stale. The
> live MarginBank says USDso is `0xed79…4F72`.

## (a) Account equity including unrealized PnL at mark

**There is a direct view:**

```solidity
// MarginBank
function getAccountEquity(address account) view returns (int256);                // reverts on a stale/zero mark
function tryGetAccountEquity(address account) view returns (bool ok, int256 equity); // never reverts
function getAccountHealth(address account) view returns (int256 equity, uint256 imReq, uint256 mmReq, uint256 cmReq);
function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools));
function getWithdrawableCollateral(address account) view returns (uint256);
```

`getAccountHealth().equity`, the number behind the SDK's `getAccountHealth().equity`, is **the same
value** as `getAccountEquity()` (identical to the wei on all 4 accounts checked). It is

```
equity = unlockedCollateralBalance
       + Σ_pools  size × (mark − avgEntryPrice) / oneBase                         // unrealized PnL
       − Σ_pools  size × (projectedCumulativeFunding − entryFundingIndex) / (oneBase × 1e18)   // unsettled funding
```

It **excludes `lockedCollateral`**, the margin reserved behind resting orders. So the value of
the account is

```
accountValue = equity + lockedCollateral          (the SDK calls this totalEquity)
```

**Verification** (scripts/discover.ts, run on 4 live accounts that hold positions, each read
pinned to one block; log in docs/discovery-run.txt):

| Account | Pools | `getAccountEquity` | Formula above | Δ |
|---|---|---|---|---|
| `0x85C6…a831` | many | 3,473,250.964024 | 3,473,250.964024 | 5 wei |
| `0x4753…8bfF` | 25 | 4,444,691.666430 | 4,444,691.666430 | 12 wei |
| `0x6C29…1ce4` | 1 (ETH) | 864.187271 | 864.187271 | 1 wei |
| `0x8239…2E68` | 1 (BTC) | 1,835,351.100603 | 1,835,351.100603 | 0 wei |

Without the funding term the formula is off by 1.39 and 0.28 USDso on the two accounts with
unsettled funding, so the term is needed. Note its extra `1e18` scale: the cumulative funding
index is "quote-wei per base unit, 1e18-scaled". The SDK's `getAccountEquity(...).equity`
returned the same value as the bank on every account.

**Mandate's `nav()`** therefore uses the bank directly:

```
nav = max(0, tryGetAccountEquity(vault) + lockedCollateral(vault) + USDso.balanceOf(vault))
```

It uses `try…` so a stale oracle makes deposits and redeems revert `NavUnavailable()` instead of
pricing shares on a wrong number. The per-pool formula is reproduced off-chain (scripts, web)
for display only.

## (b) Position size and entry price per pool

```solidity
// MarginBank
function getPosition(address account, address perpPool)
    view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs));
// PerpPool: position plus resting quantities, read atomically
function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity,
    uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity));
```

`size` is signed base units (BTC: 1e8 = 1 BTC). `avgEntryPrice` is quote wei (1e18) per one whole
base unit. `effectiveReducingCapacity` is how much opposite-side quantity still counts as purely
reducing (|position| − resting opposite orders). Mandate uses it for the reduce-only check.

## (c) Mark price

```solidity
// PerpPool
function tryGetMarkPrice() view returns (bool ok, uint256 price);   // does not revert on a stale feed
function getMarkPrice() view returns (uint256);                     // reverts on a stale feed
function getHealthSnapshot() view returns ((uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding,
    uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps));
function getOneBase() view returns (uint256);
function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize));
```

BTC: tick 0.1 USDso (1e17), minQuantity 13000 (0.00013 BTC), lot 1000, effective IMF 250 bps (40x
max). ETH: tick 0.01, minQuantity 4e15 (0.004 ETH), lot 1e14. `notional = |size| × mark / oneBase`.

## (d) Builder address and fee on owner `placeOrder`

```solidity
// PerpPool (OrderBook base), owner path. msg.sender is the order owner; NOT payable on perps.
function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs,
    uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)
    returns (bool success, uint128 orderId);   // return shape observed on the fork: 64 bytes (true, id)
function cancelOrder(uint128 orderId);
function getOwnOpenOrders() view returns (uint128[]);       // answers for msg.sender: the vault lists its own orders
function getOrder(uint128 orderId) view returns (Order);    // reverts IncorrectOrder() once the order is gone

// Builder approval: per OWNER, per POOL, per builder
function approveBuilder(address builder, uint256 maxFeeBpsTimes1k);   // 0 revokes
function getEffectiveBuilderApproval(address user, address builder) view returns (uint256); // clamped by the pool cap
function getMaxBuilderFeeBpsTimes1k() view returns (uint256);          // BTC and ETH: 10000 = 10 bps
```

- Owner `placeOrder` **does** take a builder and a fee. The fee unit is bps × 1000 (1000 = 1 bp).
- The **owner** (the vault) must have called `approveBuilder(builder, cap)` on **each pool**. An
  absent approval is a zero cap, and a non-zero fee above the cap reverts `BuilderFeeExceedsApproval`.
- The pool clamps everything by `getMaxBuilderFeeBpsTimes1k()`. The rail is off while that is 0.
- The charge appears as `MarginBank.BuilderFeeCharged(address payer, address builder, address perpPool, uint256 amount)`.
- `approveBuilder` is a fee-cap approval, **not** a token approval. It never lets the pool spend
  the vault's USDso. Mandate's vault calls it once per allowed pool in its constructor when a
  builder is configured.
- `orderType`: 0 limit (rest), 1 fill-or-kill, 2 IOC/market, 3 post-only. Expiry is a nanosecond
  timestamp; there is no GTC sentinel.

## (e) MarginBank events when a position or collateral changes

```solidity
event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice,
    int256 realizedPnl, int256 entryFundingIndex);   // topic0 0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de
event FundingSettled(address indexed account, address indexed perpPool, int256 payment);   // + = account pays
event Deposited(address indexed account, uint256 amount);
event Withdrawn(address indexed account, uint256 amount);
event CollateralLocked(...); event CollateralUnlocked(...);
event PositionLiquidated(...); event BuilderFeeCharged(address payer, address builder, address perpPool, uint256 amount);
```

`PositionUpdated` is the hook for the Reactivity safety switch (Phase 5): filter on
`topic1 = vault`.

## Gotchas found

1. `eth_getLogs` on the public RPC accepts at most a 1000-block window (`-32602 invalid
   parameters` above that). At 10 ms blocks that is 10 seconds of history per call.
2. `eth_call` on Somnia charges simulated gas very differently from mined transactions. A view
   that reads one cold slot cost ~1.04M in `eth_estimateGas`, while the mined revert of the same
   call used 49,870. A simulation capped at 500k returns an **empty** revert (`0x`) that looks
   like "no reason". Always simulate with a cap of at least 3M.
3. `getAccountState` returns a **struct** with a dynamic array. Declaring it as three flat return
   values in Solidity makes the decode revert.
4. `getOrder` reverts `IncorrectOrder()` for filled or cancelled orders. That means "gone", not a
   failure.
5. A Foundry fork of Hideki works over the HTTP RPC, including executing `MarginBank.deposit` and
   `PerpPool.placeOrder` for real, but an unpinned fork test with several cold reads takes
   ~4 minutes. Mandate's fork tests pin a block so the RPC cache makes reruns fast.
