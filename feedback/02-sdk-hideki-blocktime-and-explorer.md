# SDK: `hidekiTestnet` declares `blockTime: 10` (it is 100 ms) and no block explorer (one exists)

- **Severity:** Low/Medium. viem sizes its polling and waits from `blockTime`, and code built on "~100 blocks/s" mis-sizes `eth_getLogs` windows and timeouts by 10x. Apps get no explorer links.
- **Area:** `@somnia-chain/markets-sdk` 0.32.1, `src/chains/definitions/hidekiTestnet.ts`, docs/CHAINS.md

## Steps to reproduce
1. `N=$(cast block-number -r https://api.hideki2.infra.testnet.somnia.network)`
2. Compare `cast block $N -f timestamp` with `cast block $((N-36000)) -f timestamp`.
3. Open `https://explorer.testnet.somnia.network/tokyo/tx/<any Hideki tx>`.

## Expected
`blockTime: 100` (or whatever v2 really runs at), and `blockExplorers.default = https://explorer.testnet.somnia.network/tokyo`.

## Actual
36,000 blocks span 3,602 s, i.e. **100 ms/block**; the explorer's `/api/v2/stats` agrees (`average_block_time: 100`). The chain definition says 10 ms and states "No public block explorer is known for Hideki". The Tokyo explorer serves Hideki v2 transactions and has a Blockscout API (`/tokyo/api/v2/...`) with CORS enabled.

## Evidence
Measured 2026-11-15. Every tx link in Mandate's evidence/EVIDENCE.md resolves on that explorer.

## Environment
markets-sdk 0.32.1, Hideki v2.
