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

Run totals (deployments/ledger.json): **35 USDso** deposited into vaults (cap 45) ·
**0.7314 STT** of gas burned (cap 15) · 16 transactions.

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
