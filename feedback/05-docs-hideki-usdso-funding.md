# Testnet funds guide covers Shannon only; Hideki USDso has no mint or faucet

Severity: normal
Area: docs

## Steps to reproduce
1. Follow markets-sdk `docs/how-to/get-testnet-funds.md` (and BRIDGE.md) for Hideki: it shows `mint(address,uint256)` on Shannon's USDso.
2. Inspect Hideki's USDso (`0xed79…4F72`, proxy → `0x7bde…c29d`): its implementation has no `mint`, `faucet(uint256)` or `faucet()` selector.

## Expected
The guide says that perps on Hideki need USDso bridged from Shannon (`exchange.bridge.transfer({ token: "USDso", from: 50312, to: 50383, … })`), or that the faucet sends it directly.

## Actual
Nothing in the guide covers Hideki. In our case the Somnia faucet sent STT and USDso straight to Hideki, but its links pointed at the Shannon explorer, which made it look like the funds were on Shannon.

## Evidence
The funds check in vault-spike (step 0) found the USDso on Hideki, not Shannon. Selector scan of the implementation behind `0xed79…4F72` returns none of the mint/faucet selectors.

## Environment
Somnia Tokyo testnet (Hideki, chain 50383), markets-sdk 0.32.1 docs, 2026-11-15. Wallet: `0x6DFa3A03C1a46fC424a57a4c2A11c68c9AfAF80e` (deployer, whose Hideki and Shannon balances were checked in vault-spike step 0).
