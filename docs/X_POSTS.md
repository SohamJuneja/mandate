# X posts

## 1 (with the video)

Your AI trading agent wants your money. Mandate lets it trade, but only inside rules the contract enforces.

Vaults on @DreamDEXSomnia perps:
• allowed markets
• max leverage
• max size per market
• drawdown → reduce-only
• the leader can't withdraw

🎥 https://youtu.be/Af6lA-BRzqE
github.com/SohamJuneja/mandate

## 2

The refusal is the feature.

Our vault's leader sent a ~$32 BTC order into a vault capped at $25 per market. The contract said no, on chain: NotionalCapExceeded.

Every order is checked at mark before it reaches the @DreamDEXSomnia book.
https://explorer.testnet.somnia.network/tokyo/tx/0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832

## 3

Somnia Reactivity as a circuit breaker ⚡

Test vault, 0.2% drawdown limit. Price moved, the next fill crossed the limit, and the chain called our guard in the same block → reduce-only → position closed. No keeper.

Next buy: ReduceOnly() 🔒 @DreamDEXSomnia
https://explorer.testnet.somnia.network/tokyo/tx/0xa40b162a22f33df9e3278ca053016c341e367ed0d47f07f01169ba1473c13964
