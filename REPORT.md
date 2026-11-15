# Mandate: final report

Unattended run, 2026-11-15. Everything below is on Somnia **Hideki testnet (chain 50383)**. No
transaction was sent to any other chain, and no key was printed or committed.

## Status by phase

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery | ✅ Done | [docs/INTERFACES.md](docs/INTERFACES.md). The equity view is `MarginBank.getAccountEquity` (= `getAccountHealth().equity`). The reconstructed formula matched it to ≤12 wei on 4 live accounts. |
| 1 Contracts + tests | ✅ Done | MandateFactory, MandateVault (+ MandateGuard in Phase 5). **41/41 tests pass**: 39 on mocks, 2 on a **Hideki fork against the real protocol**. Two real bugs were found by the tests and fixed (DECISIONS D1.16, D1.7). |
| 2 Deploy + live evidence | ✅ Done | Factory and vault deployed. Deposits 10/15/10. BTC IOC open + close. On-chain reverts `MarketNotAllowed` and `NotionalCapExceeded`. `checkpoint()`. depositor2 redeemed half after the lock. |
| 3 Leader agent | ✅ Done | 8 live orders, all through `vault.trade()`. 3 mandate pre-check refusals journaled. Ended flat, NAV 27.4977 → 27.5725. MCP server with 5 tools, smoke test PASS. |
| 4 Frontend | ✅ Done | `web/`: list, detail, create. `npm run build` passes. Screenshots in [screenshots/](screenshots/). Not deployed, as requested. |
| 5 Reactivity switch | ✅ Done (on-chain, the preferred design) | Guard invoked by the chain **in the same block** as the fill. It latched reduce-only and flattened the vault. A later buy reverted `ReduceOnly` on chain. |
| 6 Docs | ✅ Done | [README](README.md) (judges table, mermaid, enforcement, business model, mainnet path, limitations), [X posts](docs/X_POSTS.md), [demo script](docs/DEMO_SCRIPT.md), [5 feedback reports](feedback/) |

## Deployed addresses

| What | Address |
|---|---|
| MandateFactory | [`0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58`](https://explorer.testnet.somnia.network/tokyo/address/0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58) |
| Vault "Mandate BTC/ETH Momentum" (leader = operator key `0xAbfA…0422`) | [`0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF`](https://explorer.testnet.somnia.network/tokyo/address/0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF) |
| Vault "Mandate Tripwire (reactivity demo)" (leader = DEPOSITOR2 `0xD791…A610`) | [`0xfAf0f9A5E71867A7ccaAff005082B9A71333A396`](https://explorer.testnet.somnia.network/tokyo/address/0xfAf0f9A5E71867A7ccaAff005082B9A71333A396) |
| MandateGuard | [`0x7aaf47230520a7d1ebe07f862aca3b66e204d732`](https://explorer.testnet.somnia.network/tokyo/address/0x7aaf47230520a7d1ebe07f862aca3b66e204d732) |
| Reactivity subscription | id **44122688** on precompile `0x0100`, owner = deployer. Still active; fires only on fills of the tripwire vault. |
| Used, not deployed | MarginBank `0x478769E1…1394`, USDso `0xed7993A7…4F72` (live from `getSystemConfig`), BTC pool `0x4181dd08…94C0`, ETH pool `0xD6Cb1DD5…eddf`, SOL pool `0xB483ec1f…FA53` (the "not allowed" market) |

Machine-readable: [deployments/hideki.json](deployments/hideki.json).

## Final state

FINALSTATE

The main vault's share price is up 0.24% since the first deposit, after the IOC round trip and the
agent's 8 orders. A performance fee crystallized during the run (high-water mark 1.0011).

## Spend vs caps

- **USDso into vaults: 40 / 45** (main 10 + 15 + 10, tripwire 5).
- **STT gas: 1.27 / 15** by the ledger, which counts every tx we sent. The reactive guard
  invocations are billed to the subscription owner outside our txs. There were 3, each ≤ 12M gas at
  ≤ 20 gwei (≤ 0.24 STT each, much less in practice). The deployer's balance went 44.59 → 40.78
  STT, which includes a 3 STT transfer to the leader for gas.
- Orders: minimum or small sizes only (0.00013–0.00039 BTC, 0.012 ETH). Leverage was ≤ 3x by contract.

## Test results

`forge test`: **41 passed, 0 failed** (test/MandateVault.t.sol 39, test/MandateFork.t.sol 2).

- **Mocks** (`test/mocks/Mocks.sol`): every revert path, share math with 3 depositors, the lock,
  the leader minimum (redeem/deposit/transfer/dust), fee only above the high-water mark, drawdown →
  reduce-only → reducing passes / increasing reverts, keeper de-risking, the vault never approving a
  pool, redeem with margin locked, and guard behaviour. 2 fuzz tests (512 runs by default; verified
  at 10,000 runs each with `--fuzz-runs 10000`).
- **Fork** of Hideki at block 50,487,900 over the HTTP RPC: deposit into the real MarginBank, a real
  resting order as owner, `MarketNotAllowed` / `NotionalCapExceeded` against real pools,
  `cancelAll`, no pool allowance, redeem, and an IOC that filled 0.00013 BTC on the real book before
  `closePosition` flattened it.
- MCP smoke test: `npx tsx agent/mcp-smoke.ts` → PASS.

## All transactions we sent (32)

Evidence with what each proves, and NAV and share price before and after:
[evidence/EVIDENCE.md](evidence/EVIDENCE.md).

| Step | Status | Tx |
|---|---|---|
TXTABLE

**Reactive transactions** (issued by the chain via Reactivity, not by us):

| What | Tx |
|---|---|
| Guard on fill 1 (same block 50505412; inside the band, no-op) | [0x2b6f58a2…](https://explorer.testnet.somnia.network/tokyo/tx/0x2b6f58a201e81a63cf3a644941a864fcc7063591343ebdeeab7a70144e6e2070) |
| Guard on fill 2 (same block 50505949): breach → reduce-only → BTC closed | [0xa40b162a…](https://explorer.testnet.somnia.network/tokyo/tx/0xa40b162a22f33df9e3278ca053016c341e367ed0d47f07f01169ba1473c13964) |
| Guard re-triggered by its own close (no-op) | [0x4cbb7722…](https://explorer.testnet.somnia.network/tokyo/tx/0x4cbb77224dbd7f1b2c5b51cfb70d742175e827c2ac38d450d32fa426a74c405e) |

Spike transactions from before this run are in `vault-spike/run*.log`.

## Deviations from the spec, and why

All are logged in [DECISIONS.md](DECISIONS.md).

1. **Tests use mocks *and* a fork.** The fork works, but it cannot move prices, and the oracle goes
   stale after 5 s of `vm.warp`, so the behavioural suite needs mocks (D1.1).
2. **Leverage uses worst-case notional** (resting orders counted as filled), which is stricter than
   positions-only (D1.2).
3. **The leader minimum also applies to deposits and transfers**, and ignores ≤1e12 share-wei of
   dust. The fuzzer showed that dust could otherwise trap the leader (D1.7).
4. **No `VaultInsolvent` error.** It was unreachable, because the drawdown latch always fires first (D1.15).
5. **Deposits are refused once reduce-only**, and the latch is permanent (D1.4).
6. **The tripwire vault uses 20 bps, not 50.** Price moves emit no event, so the breach was
   triggered by the next fill after the mark moved (D5.5).
7. **The Reactivity handler interface is mirrored, not imported**, because the package pins solc 0.8.30 (D5.4).
8. **The frontend takes tx history from the public Blockscout API**, because Hideki `eth_getLogs` is
   capped at 1000 blocks. Refusal reasons are still decoded from chain by `eth_call` replay, and
   everything else is chain reads.
9. **The agent run took ~7 of 20 minutes.** The 8-order budget, flattening included, ran out first (D3.3).
10. **Builder = the deployer address at 1 bp**, standing in for "the app" (D2.2).

## Known bugs and risks

- **Unaudited.** The leverage check is at order time, at mark; later price moves can exceed 3x until
  the breaker trips. `closePosition` crosses up to 3% from mark.
- **The breaker reacts only to fills** (or a manual `checkpoint()`/`poke()`). A vault holding a
  position with no further fills is not re-checked by Reactivity.
- **Stale oracle ⇒ deposits, redeems and trades revert `NavUnavailable`.** Funds are safe but stuck
  until the mark recovers.
- **Redeems revert `InsufficientFreeMargin` while margin is tied up.** There is no unwind queue.
- **Reactivity subscription 44122688 is still live.** Its owner (the deployer) must keep STT for up
  to 12M gas per invocation. To remove it, the deployer calls `unsubscribe(44122688)` on `0x0100`.
- **The create form always uses the app builder** from `web/src/deployments.json`.
- **A frontend deposit is 2 txs** (approve exact amount, then deposit). There is no permit.
- **SDK/RPC issues found**, with repro steps, are in [feedback/](feedback/): stale Hideki collateral
  constant; wrong `blockTime` (10 ms vs a measured 100 ms) and missing explorer in the chain
  definition; empty revert data from capped `eth_call`; an opaque `eth_getLogs` range error; missing
  Hideki USDso funding docs.

## Commands

```bash
cd E:/blockchain/mandate
forge test                                    # 41 tests (fork tests use the cached pinned block)
cd web && npm install && npm run dev          # frontend → http://localhost:5173 (wallet on chain 50383)
npm run build                                 # (in web/) production build → web/dist
cd .. && npm install
npx tsx agent/run.ts --minutes 15 --max-orders 8   # live leader agent; add --dry to send nothing
npx tsx agent/mcp-smoke.ts                          # MCP smoke test (read-only)
claude mcp add mandate -- npx tsx E:/blockchain/mandate/agent/mcp.ts   # use any MCP client as leader
npx tsx scripts/render-evidence.ts                  # regenerate evidence/EVIDENCE.md
```

`.env` (gitignored) holds `DEPLOYER_PRIVATE_KEY`, `OPERATOR_PRIVATE_KEY` and
`DEPOSITOR2_PRIVATE_KEY`, copied from `vault-spike/.env`. See [.env.example](.env.example).

## Left for you

1. **Review and push.** Commits are local only, on branch `main`; there is no remote.
2. **Record the demo** with [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md), and post
   [docs/X_POSTS.md](docs/X_POSTS.md) once you have links.
3. **Deploy the frontend** if you want it public: `web/dist` is a static site with a relative base.
4. **File the [feedback/](feedback/) reports** with the dreamDEX/Somnia team, if useful.
5. **Optional cleanup:** unsubscribe Reactivity subscription 44122688, and redeem the remaining
   shares (the deployer's 10, depositor2's 7.5 + 5, the leader's 10 plus fee shares).
6. **Before mainnet:** an audit, a periodic or oracle-driven breaker subscription, and per-vault
   deposit caps.
