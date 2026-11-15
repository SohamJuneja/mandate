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
