import { useState } from "react";
import { parseUnits, type Address } from "viem";
import { APP_BUILDER, FACTORY, MARKETS, client, factoryAbi, write } from "../chain";
import { Card, ErrorNote, TxLink } from "../components/ui";
import { mandateSentence } from "../mandate";

export function CreateVaultPage({ account, onConnect }: { account?: Address; onConnect: () => void }) {
  const [f, setF] = useState({
    name: "",
    symbol: "mVLT",
    leader: "",
    markets: ["BTC", "ETH"] as string[],
    leverage: "3",
    cap: "25",
    drawdown: "15",
    fee: "10",
    leaderMin: "5",
    lock: "120",
    builderFee: "1",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState<{ hash: string; vault?: Address }>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const leader = (f.leader || account || "") as Address;
  const mandate = {
    allowedPools: MARKETS.filter((m) => f.markets.includes(m.name)).map((m) => m.pool),
    maxLeverageX1e2: BigInt(Math.round(Number(f.leverage) * 100)),
    maxNotionalPerPool: parseUnits(f.cap || "0", 18),
    drawdownBps: Math.round(Number(f.drawdown) * 100),
    perfFeeBps: Math.round(Number(f.fee) * 100),
    leaderMinShareBps: Math.round(Number(f.leaderMin) * 100),
    lockSeconds: Number(f.lock),
    builder: APP_BUILDER,
    builderFeeBpsTimes1k: BigInt(Math.round(Number(f.builderFee) * 1000)),
  };

  async function submit() {
    if (!account) return onConnect();
    setErr(undefined);
    setBusy(true);
    try {
      const hash = await write(account, FACTORY, factoryAbi, "createVault", [{ name: f.name, symbol: f.symbol, leader, mandate }]);
      const vault = (await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "vaultOfLeader", args: [leader] })) as Address;
      setDone({ hash, vault });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <a href="#/" className="back">← All vaults</a>
      <h1>Create a vault</h1>
      <p className="lede">Set the rules once. The factory deploys a vault whose mandate can never change. One vault per leader.</p>
      <div className="grid-2 create">
        <Card title="Identity">
          <div className="form">
            <label className="field">
              <span>Name</span>
              <input value={f.name} onChange={set("name")} placeholder="Mandate BTC Trend" />
            </label>
            <label className="field">
              <span>Share symbol</span>
              <input value={f.symbol} onChange={set("symbol")} />
            </label>
            <label className="field">
              <span>Leader (human or agent)</span>
              <input value={f.leader} onChange={set("leader")} placeholder={account ?? "0x… (defaults to your wallet)"} className="mono" />
            </label>
            <fieldset className="field">
              <span>Markets</span>
              <div className="chips">
                {MARKETS.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    className={`chip ${f.markets.includes(m.name) ? "on" : ""}`}
                    onClick={() => setF({ ...f, markets: f.markets.includes(m.name) ? f.markets.filter((x) => x !== m.name) : [...f.markets, m.name] })}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>
        <Card title="Mandate">
          <div className="form two-col">
            <label className="field"><span>Max leverage (x)</span><input value={f.leverage} onChange={set("leverage")} inputMode="decimal" /></label>
            <label className="field"><span>Max per market ($)</span><input value={f.cap} onChange={set("cap")} inputMode="decimal" /></label>
            <label className="field"><span>Drawdown breaker (%)</span><input value={f.drawdown} onChange={set("drawdown")} inputMode="decimal" /></label>
            <label className="field"><span>Performance fee (%)</span><input value={f.fee} onChange={set("fee")} inputMode="decimal" /></label>
            <label className="field"><span>Leader min share (%)</span><input value={f.leaderMin} onChange={set("leaderMin")} inputMode="decimal" /></label>
            <label className="field"><span>Lock (seconds)</span><input value={f.lock} onChange={set("lock")} inputMode="numeric" /></label>
            <label className="field"><span>App builder fee (bps)</span><input value={f.builderFee} onChange={set("builderFee")} inputMode="decimal" /></label>
          </div>
        </Card>
      </div>
      <Card title="What depositors will read">
        <p className="mandate-sentence">{mandate.allowedPools.length ? mandateSentence({ ...mandate } as any) : "Pick at least one market."}</p>
        <button className="primary" disabled={busy || !f.name || !mandate.allowedPools.length} onClick={submit}>
          {busy ? "Deploying…" : account ? "Create vault" : "Connect wallet"}
        </button>
        {done && (
          <div className="note note-good">
            Vault deployed · <TxLink h={done.hash} /> · <a href={`#/vault/${done.vault}`}>open it</a>
          </div>
        )}
        <ErrorNote e={err} />
      </Card>
    </div>
  );
}
