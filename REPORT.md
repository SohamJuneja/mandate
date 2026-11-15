# Mandate: final report

Unattended run, 2026-11-15. Everything below is on **Somnia Tokyo testnet (Hideki, chain 50383)**. No
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

- **deployer** `0x6DFa3A03C1a46fC424a57a4c2A11c68c9AfAF80e`: 40.7783 STT 43 USDso
- **leader** `0xAbfAF8D4455b0d87776f955D5d7942aB92B60422`: 2.7865 STT 0 USDso
- **depositor2** `0xD791cd3163e56362778E04A123c3d81000f7A610`: 4.9340 STT 12.4993 USDso
- main 0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF: NAV 27.5725 · pps 1.002380 · supply 27.5070 · bank free 27.5725 locked 0 · wallet 0
- tripwire 0xfAf0f9A5E71867A7ccaAff005082B9A71333A396: NAV 4.9792 · pps 0.995849 · supply 5 · bank free 4.9792 locked 0 · wallet 0 · REDUCE-ONLY

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
| deployer → leader 10 USDso | success | [0xb5fcf87cbc…](https://explorer.testnet.somnia.network/tokyo/tx/0xb5fcf87cbc0308521480ace1df0f30cbb48218c38d0193be2d002a2989fd4b38) |
| deployer → leader STT for gas | success | [0xc16b43d276…](https://explorer.testnet.somnia.network/tokyo/tx/0xc16b43d27648f9629a633c14e7fee165738c841173268a5dfc86bd767f2778d2) |
| deploy MandateFactory(marginBank) | success | [0xcc8d75a61c…](https://explorer.testnet.somnia.network/tokyo/tx/0xcc8d75a61c292221d99634b96373b9e2758f866eb69e1ae52bd7dd9f5879c54a) |
| factory.createVault("Mandate BTC/ETH Momentum") | success | [0x4015b7ba88…](https://explorer.testnet.somnia.network/tokyo/tx/0x4015b7ba886466da3baf31f8b483efbbd3010d4019882dee1e54b41ba7deab1f) |
| leader approves the vault for exactly 10 USDso | success | [0xbf6d6d50d4…](https://explorer.testnet.somnia.network/tokyo/tx/0xbf6d6d50d47afd4c82e493ba555244bc9e0df2a6c175af0e468152d0ebb2e311) |
| leader vault.deposit(10) | success | [0x015b44f0e0…](https://explorer.testnet.somnia.network/tokyo/tx/0x015b44f0e0c819369fd1f871ef03a1fcb0607a31e38d9389a512624ed9d37f85) |
| depositor2 approves the vault for exactly 15 USDso | success | [0x008bb4bbd7…](https://explorer.testnet.somnia.network/tokyo/tx/0x008bb4bbd7e786baac25c3915f7016bc33bc81366b56c2eabf01f4f302a8e73c) |
| depositor2 vault.deposit(15) | success | [0xd2f90f9597…](https://explorer.testnet.somnia.network/tokyo/tx/0xd2f90f9597cb20c43b835e3a5815285535b78b949cba659b47f14a78b4a04965) |
| deployer approves the vault for exactly 10 USDso | success | [0xc5ecfb5be9…](https://explorer.testnet.somnia.network/tokyo/tx/0xc5ecfb5be98ade45e62158919e45f1b8b2385fe32cbf9570b4375b02f82b334b) |
| deployer vault.deposit(10) | success | [0x7cc0e67187…](https://explorer.testnet.somnia.network/tokyo/tx/0x7cc0e6718720c7f4fb244df00c4fd44af3853c8f3299ad8f67fc515a5cb686fd) |
| leader → vault.trade(BTC, BUY, 13000, IOC @ 64874.9) | success | [0x3a972fd5e3…](https://explorer.testnet.somnia.network/tokyo/tx/0x3a972fd5e31e0b7fed6c920a028d46d65d1d79bafb0aafb2843bb48812c5a76a) |
| leader → vault.trade(BTC, SELL, 13000, IOC) — close | success | [0x5fa5df10c1…](https://explorer.testnet.somnia.network/tokyo/tx/0x5fa5df10c12045edf931170d6a68cedc83a63fde311a5c893d13bf43941c29a9) |
| leader → vault.trade(SOL pool) — must revert | reverted | [0x7fe4b28f9e…](https://explorer.testnet.somnia.network/tokyo/tx/0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990) |
| leader → vault.trade(BTC, 0.0005 BTC) — over the notional cap | reverted | [0xea703717dc…](https://explorer.testnet.somnia.network/tokyo/tx/0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832) |
| anyone → vault.checkpoint() | success | [0xa278040698…](https://explorer.testnet.somnia.network/tokyo/tx/0xa2780406981c67f6f861a57fa8b876f9cd2ad8b4b1b0a8ee1633dca01ffcb873) |
| depositor2 → vault.redeem(7.5 shares) | success | [0x078ee210d9…](https://explorer.testnet.somnia.network/tokyo/tx/0x078ee210d905378e53f7a935093b25c0d99fa40082d72084d9e505c00c26a7a2) |
| leader → vault.trade(BTC, SELL, 39000, type 2) | success | [0x2087dba052…](https://explorer.testnet.somnia.network/tokyo/tx/0x2087dba052bba2def2dc1efc6de37a1c53e869211442e23f1c1fa9d2970efcbe) |
| leader → vault.trade(BTC, BUY, 39000, type 2) | success | [0x3662ee5375…](https://explorer.testnet.somnia.network/tokyo/tx/0x3662ee53750c6b124bfd4b97abe9a3aba4a2ed7b4f05ca696fb108be08f3f3ff) |
| leader → vault.trade(ETH, BUY, 12000000000000000, type 2) | success | [0x01f2d20fc7…](https://explorer.testnet.somnia.network/tokyo/tx/0x01f2d20fc741fdef3c632474193d49effb36be300a7e80eb12c3e8805b3da7a7) |
| leader → vault.trade(BTC, SELL, 39000, type 2) | success | [0x79fd389a05…](https://explorer.testnet.somnia.network/tokyo/tx/0x79fd389a059ba916b0a261f31880970759733d035479dbdce32d03b4a7c617c9) |
| leader → vault.trade(ETH, SELL, 12000000000000000, type 2) | success | [0x635d2218b1…](https://explorer.testnet.somnia.network/tokyo/tx/0x635d2218b1a80aea0cbaad168493fbf95693c1b85ae03c804821732e1f70e09c) |
| leader → vault.trade(ETH, SELL, 12000000000000000, type 2) | success | [0x006951e983…](https://explorer.testnet.somnia.network/tokyo/tx/0x006951e9836b25521dc837bed7992ed7079e917d653f056fdf56b3ed99334332) |
| leader → vault.trade(BTC, BUY, 39000, type 2) | success | [0x0b0cd3dd53…](https://explorer.testnet.somnia.network/tokyo/tx/0x0b0cd3dd53e7766376037a525736e7d8b88b01f420da48d09fb9949c0c621934) |
| leader → vault.trade(ETH, BUY, 12000000000000000, type 2) | success | [0xee605f5195…](https://explorer.testnet.somnia.network/tokyo/tx/0xee605f5195bfbf450502787872a7580516c78d429d1a72e17b0b264c00bf7746) |
| factory.createVault(tripwire) | success | [0x14066af3dc…](https://explorer.testnet.somnia.network/tokyo/tx/0x14066af3dc0812be4bdbdf5f2cd63aaaefca833a94c2f28e94b7b18d0f485047) |
| leader approves exactly 5 USDso | success | [0x775db52778…](https://explorer.testnet.somnia.network/tokyo/tx/0x775db52778c73ea40a667b0b29701977ee5a4f555c4941c8d12bc8a9c164fab9) |
| leader deposits 5 USDso | success | [0x9fc1710645…](https://explorer.testnet.somnia.network/tokyo/tx/0x9fc1710645953d2743951c305ff0f603fa043aa430e98c5a24ee1c712a3abb87) |
| deploy MandateGuard(factory) | success | [0x4dfd42b741…](https://explorer.testnet.somnia.network/tokyo/tx/0x4dfd42b741655bff5165f242a059839d41fa61600316484904dad5ad984119c1) |
| deployer → precompile 0x0100 subscribe(PositionUpdated[account=vault] → guard.onEvent) | success | [0x84da52e423…](https://explorer.testnet.somnia.network/tokyo/tx/0x84da52e423eb3ab44740732a392abfa94102b2cbc23fee00cd417d25a11a466e) |
| leader → vault.trade(BTC, BUY 23000, IOC) | success | [0xb83c3e971b…](https://explorer.testnet.somnia.network/tokyo/tx/0xb83c3e971b93f041bb031b6adb1c0df7c6b50fe58088b53c348ffa7b29adb46a) |
| leader → vault.trade(BTC, SELL 13000, IOC) (reducing slice) | success | [0x6071b3554e…](https://explorer.testnet.somnia.network/tokyo/tx/0x6071b3554e84127ca5535708838a483742352ec8223cffccccb90551402db022) |
| leader → vault.trade(BTC, BUY) after the breach | reverted | [0x3105fc64b1…](https://explorer.testnet.somnia.network/tokyo/tx/0x3105fc64b136633fe45b0030c05e5a94662c238a2c54f351eea2f3850b21110e) |

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
