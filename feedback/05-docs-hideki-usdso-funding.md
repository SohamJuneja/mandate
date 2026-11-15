# Docs: "How to get testnet funds" covers Shannon only. Hideki USDso has no mint or faucet

- **Severity:** Low (docs)
- **Area:** markets-sdk `docs/how-to/get-testnet-funds.md`, BRIDGE.md

## Steps to reproduce
1. Follow get-testnet-funds.md for Hideki: it shows `mint(address,uint256)` on Shannon's USDso.
2. Inspect Hideki's USDso (`0xed79…4F72`, proxy → `0x7bde…c29d`): its implementation has no `mint`, `faucet(uint256)` or `faucet()` selector.

## Expected
The guide says that perps on Hideki need USDso bridged from Shannon (`exchange.bridge.transfer({ token: "USDso", from: 50312, to: 50383, … })`), or that the faucet sends it directly.

## Actual
Nothing in the guide covers Hideki. In our case the Somnia faucet sent STT and USDso straight to Hideki, but its links pointed at the Shannon explorer, which made it look like the funds were on Shannon.

## Environment
markets-sdk 0.32.1 docs, 2026-11-15.
