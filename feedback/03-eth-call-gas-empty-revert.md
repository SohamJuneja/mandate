# eth_call under a modest gas cap returns an empty revert, hiding the real error

Severity: normal
Area: API

## Steps to reproduce
1. Take any contract whose path reads a cold storage slot, then reverts with a custom error. For example, a vault's `trade()` on a market not in its allowlist (`MarketNotAllowed()`).
2. `cast call --gas-limit 500000 <contract> <calldata>` → `execution reverted, data: "0x"`.
3. `cast call <contract> <calldata>` (no cap) → `execution reverted, data: "0x6f538c72"` (`MarketNotAllowed()`).
4. Send the same call as a real transaction with a 3M gas limit. It reverts having used **49,870 gas**.

## Expected
Simulated gas roughly matches mined gas, or the out-of-gas is reported as such.

## Actual
`eth_estimateGas` for a single cold-slot view reported ~1.04M gas, ~20x the mined cost. Below that, the simulation runs out of gas and returns `0x`, indistinguishable from `revert()` without data. Viem and the markets-sdk then show "no reason", so simulations look like "reverted with no reason" when the contract actually raises a custom error. This is in the Somnia node's `eth_call` / `eth_estimateGas` gas accounting, likely on all Somnia networks.

## Evidence
vault-spike run 1 (step (c)); Mandate DECISIONS.md D2.5 and docs/INTERFACES.md "Gotchas". Mandate now simulates with a ≥3M cap, or with the estimate for deploys (a 19 KB deploy is ~63M). On-chain example of the same revert: https://explorer.testnet.somnia.network/tokyo/tx/0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990

## Environment
Somnia Tokyo testnet (Hideki v2, chain 50383), public RPC `https://api.hideki2.infra.testnet.somnia.network`, 2026-11-15. Wallet: `0xAbfAF8D4455b0d87776f955D5d7942aB92B60422` (vault leader, sender of the reverted tx).
