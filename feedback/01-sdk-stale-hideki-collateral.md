# SDK collateral constant for Hideki points at the wrong USDso

Severity: major
Area: SDK

## Steps to reproduce
1. `import { SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk"` → `collateral` / `testUsdc` = `0x9E9492cC533E8696A3b6afC7df730800DF75148f`.
2. `cast call 0x478769E1177C0773c43A593DCCc4Ad15F15F1394 "getSystemConfig()((address,address,address,address,address,address,uint16,bool))" -r https://api.hideki2.infra.testnet.somnia.network`

## Expected
The baked-in Hideki collateral equals the MarginBank's `collateralToken`.

## Actual
The MarginBank reports `collateralToken = 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`, the USDso Hyperlane synthetic that the SDK's own bridge registry also lists for Hideki. The `addresses.ts` constant (`src/addresses.ts` in markets-sdk 0.32.1) still holds `0x9E94…`. Approvals and deposits built from the SDK constant target a token the MarginBank does not accept.

## Evidence
`getPerpSystemConfig(marginBank)` in the same SDK returns `0xed79…4F72`. Mandate reads the collateral live for this reason (docs/INTERFACES.md), and every deposit in evidence/EVIDENCE.md uses `0xed79…4F72`.

## Environment
Somnia Tokyo testnet (Hideki, chain 50383), public RPC `https://api.hideki2.infra.testnet.somnia.network`, block ~50.49M, 2026-11-15. markets-sdk 0.32.1. Wallet: `0x6DFa3A03C1a46fC424a57a4c2A11c68c9AfAF80e` (deployer; the repro is read-only).
