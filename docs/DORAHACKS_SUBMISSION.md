# DoraHacks submission: Mandate

## Project name

Mandate

## Tagline

Let AI agents trade other people's money on dreamDEX perps, inside rules the contract enforces.

## Track / category

- **Track:** MVP
- **Category:** Bots & Agents (also: Consumer)

## Description (150 words)

Trading bots are easy to build. Trusting one with other people's money is the hard part. Mandate
is a vault protocol on dreamDEX perps on Somnia. A leader, human or AI agent, trades a pooled vault,
and every order first passes a mandate fixed in the contract:

- allowed markets
- maximum leverage
- maximum notional per market
- a drawdown breaker that switches the vault to reduce-only

The leader has no withdraw function. Depositors get ERC-20 shares priced at live NAV. The leader
earns a performance fee above the high-water mark, and the app earns a builder fee on every order.

The safety switch uses Somnia's on-chain Reactivity. When a fill pushes a vault past its drawdown
limit, the chain calls our guard contract in the same block. The guard latches reduce-only and
flattens the position, with no keeper. An MCP server lets any AI agent become a leader.

## The problem

This bounty produced dozens of trading bots, and almost all of them trade only their builder's
own money. The one pooled vault on dreamDEX was built from scratch for a single strategy. Mandate
is a factory: any strategy, human or AI, can become a vault, with the rules enforced on chain.

Today a depositor either hands an agent the private key or trusts an off-chain promise
about risk limits. Neither works for real money. Copy-trading vaults on other venues trust the
leader on markets, size and leverage. An AI agent can hallucinate, loop or be prompt-injected,
so "trust the leader" is the wrong model.

## How it works

1. **`MandateFactory.createVault`** deploys a vault with an immutable mandate: markets, max
   leverage, notional cap per market, drawdown threshold, performance fee, minimum leader stake
   and deposit lock. Each leader gets one vault.
2. **Deposit.** The depositor approves the exact amount. The vault deposits it straight into its
   own dreamDEX MarginBank account and mints shares at NAV, where NAV is bank equity plus locked
   margin plus the vault's wallet. The leader must deposit first and keep at least 5% of shares.
3. **Trade.** The leader calls `vault.trade()`. The vault checks the market allowlist, the
   notional cap and the leverage cap at mark, counting worst-case exposure with resting orders
   treated as filled. It also checks reduce-only when breached. Only then does it place the order
   on the dreamDEX book as the account owner, with the app's builder code. The leader cannot
   withdraw, transfer collateral or approve a pool.
4. **Safety switch.** `MandateGuard` subscribes, through the Somnia Reactivity precompile
   `0x0100`, to `MarginBank.PositionUpdated` for the vault. On every fill the chain calls
   `guard.onEvent` in the same block. The guard checkpoints the vault, and on a drawdown breach
   it latches reduce-only and calls `closePosition` on each market.
5. **Redeem.** After the lock, shares are burned for NAV and paid from free margin.
6. **AI leaders.** `agent/` holds a funding-plus-momentum leader. It pre-checks every order
   against the mandate with `eth_call` and sizes down when refused. An MCP server exposes
   `get_vault`, `get_mandate`, `propose_trade`, `trade` and `cancel` to any agent.

## What's live (Somnia Hideki testnet, chain 50383)

- **Live app:** <https://sohamjuneja.github.io/mandate/>
- **Factory:** [`0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58`](https://explorer.testnet.somnia.network/tokyo/address/0x139dd6fae2cdc3c729cab982bf9850dfd0ecea58)
- **Main vault:** [`0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF`](https://explorer.testnet.somnia.network/tokyo/address/0x1F3c6D3197b3d0BfE7E8D87AD56Ac2B32E53D2eF)
- **Reactivity guard:** [`0x7aaf47230520a7d1ebe07f862aca3b66e204d732`](https://explorer.testnet.somnia.network/tokyo/address/0x7aaf47230520a7d1ebe07f862aca3b66e204d732), subscription id 44122688

Five key transactions:

1. **Factory deployed:** [`0xcc8d75a6…`](https://explorer.testnet.somnia.network/tokyo/tx/0xcc8d75a61c292221d99634b96373b9e2758f866eb69e1ae52bd7dd9f5879c54a)
2. **Rule enforced on chain.** A SOL order reverted with `MarketNotAllowed`: [`0x7fe4b28f…`](https://explorer.testnet.somnia.network/tokyo/tx/0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990)
3. **Size cap enforced on chain.** A ~$32 BTC order against a $25 cap reverted with `NotionalCapExceeded`: [`0xea703717…`](https://explorer.testnet.somnia.network/tokyo/tx/0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832)
4. **AI agent trade through the vault.** The first of 8 autonomous orders: [`0x2087dba0…`](https://explorer.testnet.somnia.network/tokyo/tx/0x2087dba052bba2def2dc1efc6de37a1c53e869211442e23f1c1fa9d2970efcbe)
5. **Same-block Reactivity.** The guard latched reduce-only and closed the position with no keeper: [`0xa40b162a…`](https://explorer.testnet.somnia.network/tokyo/tx/0xa40b162a22f33df9e3278ca053016c341e367ed0d47f07f01169ba1473c13964)

The full list is in [evidence/EVIDENCE.md](../evidence/EVIDENCE.md): 29 evidence rows covering 32
transactions. The project has 41 passing Foundry tests, including fuzz tests and fork tests
against the real Hideki MarginBank.

## Somnia primitives used

- **On-chain Reactivity.** The guard subscribes through precompile `0x0100` to
  `MarginBank.PositionUpdated`, filtered to the vault account. The handler runs in the same block
  as the fill, with no off-chain keeper or bot.
- **dreamDEX perps.** The vault holds its own MarginBank cross-margin account and places orders
  as owner on the PerpPool order books. It uses dreamDEX builder codes for app revenue.

## Business model

- **Performance fee → leader.** By default 10% of gains above the high-water mark, minted as
  vault shares. It is charged only on new highs.
- **Builder fee → the app.** Every vault order carries the app's dreamDEX builder code: 1 bp in
  the demo, configurable up to the dreamDEX maximum. AI leaders trade often, so revenue scales
  with activity, not only with assets under management.
- **Later:** a factory listing fee and a curated "verified agent" tier.

## Mainnet path

1. Point the factory at the mainnet MarginBank. Collateral is read from `getSystemConfig`, so
   only the pool addresses change.
2. Audit `MandateVault` and `MandateGuard`, focusing on NAV under oracle failure, the leverage
   check and the fee math.
3. Have the factory create the Reactivity subscription automatically for every new vault.
4. Add price-driven risk checks. The guard would subscribe to oracle updates, or a
   block-tick/schedule trigger, so a price move alone can trip reduce-only between fills.
5. Add per-vault deposit caps and per-market risk bounds.
6. Publish the MCP server as an npm package, so a leader agent needs only a key and a vault
   address.

## Links

- **GitHub:** <https://github.com/SohamJuneja/mandate>
- **Live app:** <https://sohamjuneja.github.io/mandate/>
- **Demo video:** `<VIDEO_URL>`
- **X posts:** `<X_POST_1>` · `<X_POST_2>` · `<X_POST_3>`
- **Evidence:** <https://github.com/SohamJuneja/mandate/blob/main/evidence/EVIDENCE.md>
- **Report:** <https://github.com/SohamJuneja/mandate/blob/main/REPORT.md>
