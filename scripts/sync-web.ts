// Copy contract ABIs and deployment addresses into web/src so the frontend builds standalone.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./lib.ts";
import { loadDeployments } from "./vaultlib.ts";

const abi = (n: string) => JSON.parse(readFileSync(resolve(ROOT, "out", `${n}.sol`, `${n}.json`), "utf8")).abi;
writeFileSync(resolve(ROOT, "web", "src", "abi.json"), JSON.stringify({ vault: abi("MandateVault"), factory: abi("MandateFactory") }, null, 2));
const d = loadDeployments();
writeFileSync(
  resolve(ROOT, "web", "src", "deployments.json"),
  JSON.stringify({ chainId: d.chainId, marginBank: d.marginBank, collateral: d.collateral, factory: d.factory, appBuilder: (d.vaults.main?.params as any)?.mandate?.builder }, null, 2),
);
console.log("synced web/src/abi.json + deployments.json");
