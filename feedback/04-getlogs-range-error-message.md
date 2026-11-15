# eth_getLogs over 1000 blocks fails with a bare "invalid parameters"

Severity: normal
Area: API

## Steps to reproduce
`eth_getLogs` on the Hideki public RPC with `address = MarginBank` (`0x478769E1177C0773c43A593DCCc4Ad15F15F1394`), `fromBlock = head − 1001`, `toBlock = head`.

## Expected
Either the logs, or an error that names the limit (e.g. "block range exceeds 1000").

## Actual
`{"code":-32602,"message":"invalid parameters"}` with `data: null`. 1000 blocks works. At 100 ms blocks that is ~100 s of history per call, so any history view needs hundreds of calls.

## Evidence
Mandate's frontend samples archive state with `eth_call` at historical blocks, and uses the explorer API for tx history instead (web/src/chain.ts). The guard-log reader in scripts/phase5.ts caps each query at 1000 blocks for the same reason.

## Environment
Somnia Tokyo testnet (Hideki v2, chain 50383), public RPC `https://api.hideki2.infra.testnet.somnia.network`, 2026-11-15. Wallet: `0x6DFa3A03C1a46fC424a57a4c2A11c68c9AfAF80e` (deployer; the repro is read-only).
