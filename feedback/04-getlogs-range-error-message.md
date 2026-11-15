# RPC: `eth_getLogs` over 1000 blocks fails with a bare "invalid parameters"

- **Severity:** Low (developer experience)
- **Area:** Hideki public RPC

## Steps to reproduce
`eth_getLogs` with `address = MarginBank`, `fromBlock = head − 1001`, `toBlock = head`.

## Expected
Either the logs, or an error that names the limit (e.g. "block range exceeds 1000").

## Actual
`{"code":-32602,"message":"invalid parameters"}` with `data: null`. 1000 blocks works. At 100 ms blocks that is ~100 s of history per call, so any history view needs hundreds of calls. Mandate's frontend samples archive state with `eth_call` at historical blocks and uses the explorer API for tx history instead.

## Environment
Hideki v2, 2026-11-15.
