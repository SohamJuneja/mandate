# Evidence: Mandate on dreamDEX perps (Somnia Hideki testnet, chain 50383)

Every row is a real transaction on Hideki (chain id 50383) unless marked *read*. "Reverted
(expected)" rows were sent on purpose as real transactions so the refusal has a hash; the decoded
error comes from replaying the mined tx with `eth_call` at the parent block.
NAV = bank equity (free collateral + uPnL at mark − funding) + locked collateral + vault wallet.
pps = NAV / share supply.

| Contract | Address |
|---|---|
| MarginBank | [`0x478769E1177C0773c43A593DCCc4Ad15F15F1394`](https://explorer.testnet.somnia.network/tokyo/address/0x478769E1177C0773c43A593DCCc4Ad15F15F1394) |
| USDso (live from `getSystemConfig`) | [`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`](https://explorer.testnet.somnia.network/tokyo/address/0xed7993A74dAe1e6656B704A424DcD8711aAf4F72) |
| MandateFactory | [`0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58`](https://explorer.testnet.somnia.network/tokyo/address/0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58) |
| MandateVault (main) | [`0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF`](https://explorer.testnet.somnia.network/tokyo/address/0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF) |
| MandateVault (tripwire) | [`0xfAf0f9A5E71867A7ccaAff005082B9A71333A396`](https://explorer.testnet.somnia.network/tokyo/address/0xfAf0f9A5E71867A7ccaAff005082B9A71333A396) |
| MandateVault (claude) | [`0xf8819aA0Edc173fE0744eF52626C493996f70f47`](https://explorer.testnet.somnia.network/tokyo/address/0xf8819aA0Edc173fE0744eF52626C493996f70f47) |

Run totals (deployments/ledger.json): **45 USDso** deposited into vaults (cap 52; 45 until Phase 7) ·
**1.5627 STT** of gas burned (cap 15) · 37 transactions.

## Phase 2: deploy and live evidence

| # | Step | What it proves | Tx | Result | NAV / pps before → after |
|---|---|---|---|---|---|
| 1 | Deploy MandateFactory | Factory bound to the live MarginBank; collateral read from getSystemConfig | [0xcc8d75a6…](https://explorer.testnet.somnia.network/tokyo/tx/0xcc8d75a61c292221d99634b96373b9e2758f866eb69e1ae52bd7dd9f5879c54a) | ✅ success | factory 0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58 |
| 2 | Create vault "Mandate BTC/ETH Momentum" | Mandate fixed at deploy: BTC+ETH only, 3x, 25 USDso/market, 15% drawdown → reduce-only, 10% perf fee, leader ≥5%, 120 s lock, 1 bp builder fee | [0x4015b7ba…](https://explorer.testnet.somnia.network/tokyo/tx/0x4015b7ba886466da3baf31f8b483efbbd3010d4019882dee1e54b41ba7deab1f) | ✅ success | vault 0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF |
| 3 | leader deposits 10 USDso | First deposit must be the leader; shares 1:1 when empty; USDso goes straight into the vault's own MarginBank account | [0x015b44f0…](https://explorer.testnet.somnia.network/tokyo/tx/0x015b44f0e0c819369fd1f871ef03a1fcb0607a31e38d9389a512624ed9d37f85) | ✅ success | NAV 0 · pps 1· bank free 0 locked 0<br>→ NAV 10 · pps 1· bank free 10 locked 0 |
| 4 | depositor2 deposits 15 USDso | Shares priced at NAV; collateral lands in the bank, locked for 120 s | [0xd2f90f95…](https://explorer.testnet.somnia.network/tokyo/tx/0xd2f90f9597cb20c43b835e3a5815285535b78b949cba659b47f14a78b4a04965) | ✅ success | NAV 10 · pps 1· bank free 10 locked 0<br>→ NAV 25 · pps 1· bank free 25 locked 0 |
| 5 | deployer deposits 10 USDso | Shares priced at NAV; collateral lands in the bank, locked for 120 s | [0x7cc0e671…](https://explorer.testnet.somnia.network/tokyo/tx/0x7cc0e6718720c7f4fb244df00c4fd44af3853c8f3299ad8f67fc515a5cb686fd) | ✅ success | NAV 25 · pps 1· bank free 25 locked 0<br>→ NAV 35 · pps 1· bank free 35 locked 0 |
| 6 | Leader opens a long of 0.00013 BTC (IOC) | vault.trade() placed an IOC as owner and filled: position 13000 @ 63630.5; margin from the bank, builder fee attached | [0x3a972fd5…](https://explorer.testnet.somnia.network/tokyo/tx/0x3a972fd5e31e0b7fed6c920a028d46d65d1d79bafb0aafb2843bb48812c5a76a) | ✅ success | NAV 35 · pps 1· bank free 35 locked 0<br>→ NAV 34.9936 · pps 0.999817· bank free 34.9991 locked 0 · pos BTC 13000 |
| 7 | Leader closes the BTC position (IOC) | A reducing order passes; the vault is flat again; NAV reflects realized PnL and fees | [0x5fa5df10…](https://explorer.testnet.somnia.network/tokyo/tx/0x5fa5df10c12045edf931170d6a68cedc83a63fde311a5c893d13bf43941c29a9) | ✅ success | NAV 34.9938 · pps 0.999823· bank free 34.9991 locked 0 · pos BTC 13000<br>→ NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0 |
| 8 | Order on SOL (not in the mandate) | The contract refuses markets outside the allowlist, on chain | [0x7fe4b28f…](https://explorer.testnet.somnia.network/tokyo/tx/0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990) | ⛔ reverted (expected)<br>`MarketNotAllowed() 0x6f538c72` | NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0<br>→ NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0 |
| 9 | Order of 0.0005 BTC (~32 USDso) vs a 25 USDso cap | The per-market notional cap is enforced on chain | [0xea703717…](https://explorer.testnet.somnia.network/tokyo/tx/0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832) | ⛔ reverted (expected)<br>`NotionalCapExceeded 0xd8c73c46000000000000000000000000000000000000000000000001b9410857d224` | NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0<br>→ NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0 |
| 10 | checkpoint() | pps is at or below the high-water mark → no fee; inside the 15% band → no breach | [0xa2780406…](https://explorer.testnet.somnia.network/tokyo/tx/0xa2780406981c67f6f861a57fa8b876f9cd2ad8b4b1b0a8ee1633dca01ffcb873) | ✅ success | NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0 · hwm 1<br>→ NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0 · hwm 1 |
| 11 | depositor2 redeems half (7.5 shares) after the lock | Paid 7.499380 USDso = shares × NAV / supply, withdrawn from free bank margin straight to the depositor | [0x078ee210…](https://explorer.testnet.somnia.network/tokyo/tx/0x078ee210d905378e53f7a935093b25c0d99fa40082d72084d9e505c00c26a7a2) | ✅ success | NAV 34.9971 · pps 0.999917· bank free 34.9971 locked 0<br>→ NAV 27.4977 · pps 0.999917· bank free 27.4977 locked 0 |

## Phase 3: leader agent

| # | Step | What it proves | Tx | Result | NAV / pps before → after |
|---|---|---|---|---|---|
| 1 | Agent sell 0.00039 BTC (open short ×3) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0x2087dba0…](https://explorer.testnet.somnia.network/tokyo/tx/0x2087dba052bba2def2dc1efc6de37a1c53e869211442e23f1c1fa9d2970efcbe) | ✅ success | NAV 27.497729 · pps 0.999917 · pos BTC 0, ETH 0<br>→ NAV 27.507422 · pps 1.000269 · pos BTC -0.00039, ETH 0 |
| 2 | Agent buy 0.00039 BTC (close (target 1)) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0x3662ee53…](https://explorer.testnet.somnia.network/tokyo/tx/0x3662ee53750c6b124bfd4b97abe9a3aba4a2ed7b4f05ca696fb108be08f3f3ff) | ✅ success | NAV 27.482874 · pps 0.999377 · pos BTC -0.00039, ETH 0<br>→ NAV 27.464269 · pps 0.998700 · pos BTC 0, ETH 0 |
| 3 | Agent buy 0.012 ETH (open long ×3) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0x01f2d20f…](https://explorer.testnet.somnia.network/tokyo/tx/0x01f2d20fc741fdef3c632474193d49effb36be300a7e80eb12c3e8805b3da7a7) | ✅ success | NAV 27.464269 · pps 0.998700 · pos BTC 0, ETH 0<br>→ NAV 27.472448 · pps 0.998998 · pos BTC 0, ETH 0.012 |
| 4 | Agent sell 0.00039 BTC (open short ×3) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0x79fd389a…](https://explorer.testnet.somnia.network/tokyo/tx/0x79fd389a059ba916b0a261f31880970759733d035479dbdce32d03b4a7c617c9) | ✅ success | NAV 27.442467 · pps 0.997907 · pos BTC 0, ETH 0.012<br>→ NAV 27.450935 · pps 0.998215 · pos BTC -0.00039, ETH 0.012 |
| 5 | Agent sell 0.012 ETH (close (target -1)) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0x635d2218…](https://explorer.testnet.somnia.network/tokyo/tx/0x635d2218b1a80aea0cbaad168493fbf95693c1b85ae03c804821732e1f70e09c) | ✅ success | NAV 27.455081 · pps 0.998366 · pos BTC -0.00039, ETH 0.012<br>→ NAV 27.444968 · pps 0.997998 · pos BTC -0.00039, ETH 0 |
| 6 | Agent sell 0.012 ETH (open short ×3) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0x006951e9…](https://explorer.testnet.somnia.network/tokyo/tx/0x006951e9836b25521dc837bed7992ed7079e917d653f056fdf56b3ed99334332) | ✅ success | NAV 27.540748 · pps 1.001481 · pos BTC -0.00039, ETH 0<br>→ NAV 27.480001 · pps 0.999148 · pos BTC -0.00039, ETH -0.012 |
| 7 | Agent buy 0.00039 BTC (close (target 1)) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0x0b0cd3dd…](https://explorer.testnet.somnia.network/tokyo/tx/0x0b0cd3dd53e7766376037a525736e7d8b88b01f420da48d09fb9949c0c621934) | ✅ success | NAV 27.558062 · pps 1.001987 · pos BTC -0.00039, ETH -0.012<br>→ NAV 27.551449 · pps 1.001672 · pos BTC 0, ETH -0.012 |
| 8 | Agent buy 0.012 ETH (close (target 1)) | AI leader trades only via vault.trade(); pre-checked against the mandate with eth_call before sending | [0xee605f51…](https://explorer.testnet.somnia.network/tokyo/tx/0xee605f5195bfbf450502787872a7580516c78d429d1a72e17b0b264c00bf7746) | ✅ success | NAV 27.564535 · pps 1.002148 · pos BTC 0, ETH -0.012<br>→ NAV 27.572516 · pps 1.002380 · pos BTC 0, ETH 0 |

## Phase 5: Reactivity safety switch

| # | Step | What it proves | Tx | Result | NAV / pps before → after |
|---|---|---|---|---|---|
| 1 | Create the tripwire vault | BTC only, 3x, drawdown breaker at 20 bps: a tiny loss must trip it | [0x14066af3…](https://explorer.testnet.somnia.network/tokyo/tx/0x14066af3dc0812be4bdbdf5f2cd63aaaefca833a94c2f28e94b7b18d0f485047) | ✅ success | vault 0xfAf0f9A5E71867A7ccaAff005082B9A71333A396 |
| 2 | Leader seeds the tripwire vault with 5 USDso | First deposit by the leader; high-water mark set at 1.0 | [0x9fc17106…](https://explorer.testnet.somnia.network/tokyo/tx/0x9fc1710645953d2743951c305ff0f603fa043aa430e98c5a24ee1c712a3abb87) | ✅ success | NAV 5 · pps 1· bank free 5 locked 0 |
| 3 | Deploy MandateGuard | A reactivity handler with no funds and no privileges: checkpoint() is public, closePosition() opens to anyone on breach | [0x4dfd42b7…](https://explorer.testnet.somnia.network/tokyo/tx/0x4dfd42b741655bff5165f242a059839d41fa61600316484904dad5ad984119c1) | ✅ success | guard 0x7aaf47230520a7d1ebe07f862aca3b66e204d732 |
| 4 | Subscribe on chain (id 44122688) | Reactivity precompile 0x0100: MarginBank.PositionUpdated with topic1 = vault → MandateGuard.onEvent, 12M gas, owner = deployer EOA | [0x84da52e4…](https://explorer.testnet.somnia.network/tokyo/tx/0x84da52e423eb3ab44740732a392abfa94102b2cbc23fee00cd417d25a11a466e) | ✅ success |  |
| 5 | Leader opens a 23000-unit BTC long (~2.9x) | Fill emits MarginBank.PositionUpdated(account = vault): the subscription's trigger | [0xb83c3e97…](https://explorer.testnet.somnia.network/tokyo/tx/0xb83c3e971b93f041bb031b6adb1c0df7c6b50fe58088b53c348ffa7b29adb46a) | ✅ success | NAV 5 · pps 1· bank free 5 locked 0 · hwm 1 |
| 6 | Reactive call: MandateGuard.onEvent (same block as the fill) | Validators invoked the guard; pps 0.999684 still inside the band → no action | [0x2b6f58a2…](https://explorer.testnet.somnia.network/tokyo/tx/0x2b6f58a201e81a63cf3a644941a864fcc7063591343ebdeeab7a70144e6e2070) | ✅ success | NAV 4.9972 · pps 0.999449· bank free 4.9985 locked 0 · pos BTC 23000 · hwm 1 |
| 7 | Mark moved against the vault; leader sells a 13000-unit slice | Reducing orders stay allowed; the fill emits PositionUpdated → reactive guard | [0x6071b355…](https://explorer.testnet.somnia.network/tokyo/tx/0x6071b3554e84127ca5535708838a483742352ec8223cffccccb90551402db022) | ✅ success | NAV 4.9828 · pps 0.996561· bank free 4.9985 locked 0 · pos BTC 23000 · hwm 1 |
| 8 | Reactive call: MandateGuard.onEvent (same block as the fill) | Vault is breached (pps 0.995849 vs high 1): reduce-only latched and the guard sent closePosition (1 market closed), with no keeper and no leader | [0xa40b162a…](https://explorer.testnet.somnia.network/tokyo/tx/0xa40b162a22f33df9e3278ca053016c341e367ed0d47f07f01169ba1473c13964) | ✅ success | NAV 4.9792 · pps 0.995849· bank free 4.9792 locked 0 · REDUCE-ONLY · hwm 1 |
| 9 | Reactive call: MandateGuard.onEvent (same block as the fill) | Vault is breached (pps 0.995849 vs high 1): reduce-only latched and the guard sent closePosition (0 market closed), with no keeper and no leader | [0x4cbb7722…](https://explorer.testnet.somnia.network/tokyo/tx/0x4cbb77224dbd7f1b2c5b51cfb70d742175e827c2ac38d450d32fa426a74c405e) | ✅ success | NAV 4.9792 · pps 0.995849· bank free 4.9792 locked 0 · REDUCE-ONLY · hwm 1 |
| 10 | Leader tries to buy again after the breach | Reduce-only is latched on chain: increasing orders revert | [0x3105fc64…](https://explorer.testnet.somnia.network/tokyo/tx/0x3105fc64b136633fe45b0030c05e5a94662c238a2c54f351eea2f3850b21110e) | ⛔ reverted (expected)<br>`ReduceOnly() 0x5b0f71a2` |  |

## Phase 7: LLM leader via MCP

| # | Step | What it proves | Tx | Result | NAV / pps before → after |
|---|---|---|---|---|---|
| 1 | Create "Claude-led BTC" for an LLM leader | Mandate fixed at deploy: BTC only, 2x, 15 USDso/market, 10% drawdown → reduce-only, 120 s lock; leader = a fresh key used only by the MCP server | [0xa2ee9f6c…](https://explorer.testnet.somnia.network/tokyo/tx/0xa2ee9f6cbed5f1c99bf50543909bc40de882be89d1ab1ce326c1661323d71a13) | ✅ success | vault 0xf8819aA0Edc173fE0744eF52626C493996f70f47 |
| 2 | LLM leader's key seeds the vault with 5 USDso | Leader deposits first; exact-amount approval; collateral goes into the vault's own MarginBank account | [0x975ad952…](https://explorer.testnet.somnia.network/tokyo/tx/0x975ad95272ede3790c7c31912b7a23b625cfd216bc4d9f61bfedc006fab279e1) | ✅ success | NAV 5 · pps 1· bank free 5 locked 0 |

## All transactions (from the spend ledger)

| Step | Status | Tx |
|---|---|---|
| deployer → leader 10 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0xb5fcf87cbc0308521480ace1df0f30cbb48218c38d0193be2d002a2989fd4b38 |
| deployer → leader STT for gas | success | https://explorer.testnet.somnia.network/tokyo/tx/0xc16b43d27648f9629a633c14e7fee165738c841173268a5dfc86bd767f2778d2 |
| deploy MandateFactory(marginBank) | success | https://explorer.testnet.somnia.network/tokyo/tx/0xcc8d75a61c292221d99634b96373b9e2758f866eb69e1ae52bd7dd9f5879c54a |
| factory.createVault("Mandate BTC/ETH Momentum") | success | https://explorer.testnet.somnia.network/tokyo/tx/0x4015b7ba886466da3baf31f8b483efbbd3010d4019882dee1e54b41ba7deab1f |
| leader approves the vault for exactly 10 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0xbf6d6d50d47afd4c82e493ba555244bc9e0df2a6c175af0e468152d0ebb2e311 |
| leader vault.deposit(10) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x015b44f0e0c819369fd1f871ef03a1fcb0607a31e38d9389a512624ed9d37f85 |
| depositor2 approves the vault for exactly 15 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0x008bb4bbd7e786baac25c3915f7016bc33bc81366b56c2eabf01f4f302a8e73c |
| depositor2 vault.deposit(15) | success | https://explorer.testnet.somnia.network/tokyo/tx/0xd2f90f9597cb20c43b835e3a5815285535b78b949cba659b47f14a78b4a04965 |
| deployer approves the vault for exactly 10 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0xc5ecfb5be98ade45e62158919e45f1b8b2385fe32cbf9570b4375b02f82b334b |
| deployer vault.deposit(10) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x7cc0e6718720c7f4fb244df00c4fd44af3853c8f3299ad8f67fc515a5cb686fd |
| leader → vault.trade(BTC, BUY, 13000, IOC @ 64874.9) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x3a972fd5e31e0b7fed6c920a028d46d65d1d79bafb0aafb2843bb48812c5a76a |
| leader → vault.trade(BTC, SELL, 13000, IOC) — close | success | https://explorer.testnet.somnia.network/tokyo/tx/0x5fa5df10c12045edf931170d6a68cedc83a63fde311a5c893d13bf43941c29a9 |
| leader → vault.trade(SOL pool) — must revert | reverted | https://explorer.testnet.somnia.network/tokyo/tx/0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990 |
| leader → vault.trade(BTC, 0.0005 BTC) — over the notional cap | reverted | https://explorer.testnet.somnia.network/tokyo/tx/0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832 |
| anyone → vault.checkpoint() | success | https://explorer.testnet.somnia.network/tokyo/tx/0xa2780406981c67f6f861a57fa8b876f9cd2ad8b4b1b0a8ee1633dca01ffcb873 |
| depositor2 → vault.redeem(7.5 shares) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x078ee210d905378e53f7a935093b25c0d99fa40082d72084d9e505c00c26a7a2 |
| leader → vault.trade(BTC, SELL, 39000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x2087dba052bba2def2dc1efc6de37a1c53e869211442e23f1c1fa9d2970efcbe |
| leader → vault.trade(BTC, BUY, 39000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x3662ee53750c6b124bfd4b97abe9a3aba4a2ed7b4f05ca696fb108be08f3f3ff |
| leader → vault.trade(ETH, BUY, 12000000000000000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x01f2d20fc741fdef3c632474193d49effb36be300a7e80eb12c3e8805b3da7a7 |
| leader → vault.trade(BTC, SELL, 39000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x79fd389a059ba916b0a261f31880970759733d035479dbdce32d03b4a7c617c9 |
| leader → vault.trade(ETH, SELL, 12000000000000000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x635d2218b1a80aea0cbaad168493fbf95693c1b85ae03c804821732e1f70e09c |
| leader → vault.trade(ETH, SELL, 12000000000000000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x006951e9836b25521dc837bed7992ed7079e917d653f056fdf56b3ed99334332 |
| leader → vault.trade(BTC, BUY, 39000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x0b0cd3dd53e7766376037a525736e7d8b88b01f420da48d09fb9949c0c621934 |
| leader → vault.trade(ETH, BUY, 12000000000000000, type 2) | success | https://explorer.testnet.somnia.network/tokyo/tx/0xee605f5195bfbf450502787872a7580516c78d429d1a72e17b0b264c00bf7746 |
| factory.createVault(tripwire) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x14066af3dc0812be4bdbdf5f2cd63aaaefca833a94c2f28e94b7b18d0f485047 |
| leader approves exactly 5 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0x775db52778c73ea40a667b0b29701977ee5a4f555c4941c8d12bc8a9c164fab9 |
| leader deposits 5 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0x9fc1710645953d2743951c305ff0f603fa043aa430e98c5a24ee1c712a3abb87 |
| deploy MandateGuard(factory) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x4dfd42b741655bff5165f242a059839d41fa61600316484904dad5ad984119c1 |
| deployer → precompile 0x0100 subscribe(PositionUpdated[account=vault] → guard.onEvent) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x84da52e423eb3ab44740732a392abfa94102b2cbc23fee00cd417d25a11a466e |
| leader → vault.trade(BTC, BUY 23000, IOC) | success | https://explorer.testnet.somnia.network/tokyo/tx/0xb83c3e971b93f041bb031b6adb1c0df7c6b50fe58088b53c348ffa7b29adb46a |
| leader → vault.trade(BTC, SELL 13000, IOC) (reducing slice) | success | https://explorer.testnet.somnia.network/tokyo/tx/0x6071b3554e84127ca5535708838a483742352ec8223cffccccb90551402db022 |
| leader → vault.trade(BTC, BUY) after the breach | reverted | https://explorer.testnet.somnia.network/tokyo/tx/0x3105fc64b136633fe45b0030c05e5a94662c238a2c54f351eea2f3850b21110e |
| deployer → CLAUDE_LEADER 3 STT for gas | success | https://explorer.testnet.somnia.network/tokyo/tx/0x670b54514c2abd44bd7afc56d11cfba08d9fb7aa01a7fcaafae38ba331d72beb |
| deployer → CLAUDE_LEADER 6 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0x5660b734711a96d0860803208a6599e6d527c07cee4f2e4537edfdfc08bfc94b |
| factory.createVault("Claude-led BTC") | success | https://explorer.testnet.somnia.network/tokyo/tx/0xa2ee9f6cbed5f1c99bf50543909bc40de882be89d1ab1ce326c1661323d71a13 |
| CLAUDE_LEADER approves exactly 5 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0x0a0396bde400b41e590108a829ec381322cd8767593e5789218f5fb02a04e303 |
| CLAUDE_LEADER deposits 5 USDso | success | https://explorer.testnet.somnia.network/tokyo/tx/0x975ad95272ede3790c7c31912b7a23b625cfd216bc4d9f61bfedc006fab279e1 |
