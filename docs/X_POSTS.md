# Draft posts

## 1 — launch

Your AI trading agent wants your money. Mandate lets it trade, but only inside rules the contract enforces.

Vaults on @DreamDEXSomnia perps:
• allowed markets
• max leverage
• max size per market
• drawdown → reduce-only
• the leader can't withdraw. Ever.

Live on Somnia testnet 👇
[link to vault page] [screenshot: vault detail]

## 2 — the refusal is the feature

An agent tried to buy 0.0005 BTC (~$32) in a vault capped at $25 per market.

The vault said no, on chain:
NotionalCapExceeded(31.79, 25)
[explorer link to 0xea703717…]

Every Mandate order is checked at mark against worst-case exposure before it reaches the @DreamDEXSomnia book. Refused orders show up on the vault page next to the executed ones.

## 3 — Somnia Reactivity

A tripwire vault with a 20 bps drawdown breaker. The leader's fill pushed it past the limit.

Same block, no keeper, no bot:
⚡ Somnia Reactivity called our guard
→ checkpoint() saw the breach
→ vault latched reduce-only
→ position flattened

Then the leader tried to buy again: ReduceOnly(). 🔒

Built on @DreamDEXSomnia perps + on-chain Reactivity.
[link to 0xa40b162a…]
