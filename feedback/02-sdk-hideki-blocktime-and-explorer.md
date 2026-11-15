# SDK hidekiTestnet chain says 10 ms blocks (it is 100 ms) and lists no explorer

Severity: normal
Area: SDK

## Steps to reproduce
1. `N=$(cast block-number -r https://api.hideki2.infra.testnet.somnia.network)`
2. Compare `cast block $N -f timestamp` with `cast block $((N-36000)) -f timestamp`.
3. Open `https://explorer.testnet.somnia.network/tokyo/tx/<any Hideki tx>`.

## Expected
`blockTime: 100` (or whatever v2 really runs at), and `blockExplorers.default = https://explorer.testnet.somnia.network/tokyo` in `src/chains/definitions/hidekiTestnet.ts` and docs/CHAINS.md.

## Actual
36,000 blocks span 3,602 s, i.e. **100 ms/block**; the explorer's `/api/v2/stats` agrees (`average_block_time: 100`). The chain definition says `blockTime: 10` and "No public block explorer is known for Hideki". The Tokyo explorer serves Hideki v2 transactions and has a Blockscout API (`/tokyo/api/v2/...`) with CORS enabled. viem sizes its polling and waits from `blockTime`, and code built on "~100 blocks/s" mis-sizes `eth_getLogs` windows and timeouts by 10x. Apps get no explorer links.

## Evidence
Measured 2026-11-15. Every tx link in Mandate's evidence/EVIDENCE.md resolves on that explorer.

## Environment
Somnia Tokyo testnet (Hideki v2, chain 50383), markets-sdk 0.32.1, 2026-11-15. Wallet: `0x6DFa3A03C1a46fC424a57a4c2A11c68c9AfAF80e` (deployer; the repro is read-only).
