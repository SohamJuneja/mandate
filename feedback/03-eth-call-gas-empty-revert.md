# Somnia: `eth_call` under a modest gas cap returns an EMPTY revert, hiding the real error

- **Severity:** Medium (developer experience). Simulations look like "reverted with no reason" when the contract actually raises a custom error.
- **Area:** Somnia node RPC (`eth_call` / `eth_estimateGas` gas accounting), Hideki v2. Likely all Somnia networks.

## Steps to reproduce
1. Take any contract whose path reads a cold storage slot, then reverts with a custom error. For example, a vault's `trade()` on a market not in its allowlist (`MarketNotAllowed()`).
2. `cast call --gas-limit 500000 <contract> <calldata>` → `execution reverted, data: "0x"`.
3. `cast call <contract> <calldata>` (no cap) → `execution reverted, data: "0x6f538c72"` (`MarketNotAllowed()`).
4. Send the same call as a real transaction with a 3M gas limit. It reverts having used **49,870 gas**.

## Expected
Simulated gas roughly matches mined gas, or the out-of-gas is reported as such.

## Actual
`eth_estimateGas` for a single cold-slot view reported ~1.04M gas, ~20x the mined cost. Below that, the simulation runs out of gas and returns `0x`, indistinguishable from `revert()` without data. Viem and the markets-sdk then show "no reason".

## Evidence
vault-spike run 1 (step (c)); Mandate DECISIONS.md D2.5 and docs/INTERFACES.md "Gotchas". Mandate now simulates with a ≥3M cap, or with the estimate for deploys (a 19 KB deploy is ~63M).

## Environment
Hideki v2, public RPC `https://api.hideki2.infra.testnet.somnia.network`, 2026-11-15.
