# SDK: `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` points at the wrong USDso

- **Severity:** Medium. Approvals and deposits built from the SDK constant target a token the MarginBank does not accept.
- **Area:** `@somnia-chain/markets-sdk` 0.32.1, `src/addresses.ts`

## Steps to reproduce
1. `import { SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk"` → `collateral` / `testUsdc` = `0x9E9492cC533E8696A3b6afC7df730800DF75148f`.
2. `cast call 0x478769E1177C0773c43A593DCCc4Ad15F15F1394 "getSystemConfig()((address,address,address,address,address,address,uint16,bool))" -r https://api.hideki2.infra.testnet.somnia.network`

## Expected
The baked-in Hideki collateral equals the MarginBank's `collateralToken`.

## Actual
The MarginBank reports `collateralToken = 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`, which is the USDso Hyperlane synthetic that the SDK's own bridge registry also lists for Hideki. The `addresses.ts` constant still holds `0x9E94…`.

## Evidence
`getPerpSystemConfig(marginBank)` in the same SDK returns `0xed79…4F72`. Mandate reads it live for this reason (docs/INTERFACES.md).

## Environment
markets-sdk 0.32.1, Hideki v2 (chain 50383), block ~50.49M, 2026-11-15.
