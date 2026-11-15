import { useState } from "react";
import { parseUnits, type Address } from "viem";
import {
  COLLATERAL,
  client,
  erc20Abi,
  fmtUsd,
  num,
  ppsHistory,
  readPositions,
  readVault,
  vaultAbi,
  vaultActivity,
  vaultCreationBlock,
  write,
} from "../chain";
import { PpsChart } from "../components/Chart";
import { Addr, Badge, Card, ErrorNote, Pct, Skeleton, Stat, TxLink, useAsync } from "../components/ui";
import { MandateBadges, mandateRules, mandateSentence } from "../mandate";

export function VaultDetailPage({ address, account, onConnect }: { address: Address; account?: Address; onConnect: () => void }) {
  const v = useAsync(() => readVault(address), [address], 15_000);
  const pos = useAsync(async () => (v.data ? readPositions(address, v.data.mandate.allowedPools) : null), [address, v.data?.mandate.allowedPools.length], 15_000);
  const hist = useAsync(async () => {
    const from = (await vaultCreationBlock(address)) ?? (await client.getBlockNumber()) - 360_000n;
    return ppsHistory(address, from);
  }, [address]);
  const act = useAsync(() => vaultActivity(address), [address], 30_000);

  if (v.error) return <div className="page"><ErrorNote e={v.error} /></div>;
  const s = v.data;
  const drawdown = s ? Math.max(0, 1 - s.pps / s.hwm) : 0;
  const trades = act.data?.filter((a) => a.method === "trade" || a.method === "closePosition" || a.method === "cancelAll" || a.method === "cancel") ?? [];
  const refused = trades.filter((a) => !a.ok);
  const flows = act.data?.filter((a) => a.method === "deposit" || a.method === "redeem" || a.method === "checkpoint") ?? [];

  return (
    <div className="page">
      <a href="#/" className="back">← All vaults</a>
      <div className="detail-head">
        <div>
          <h1>{s ? s.name : <Skeleton w={280} h={30} />}</h1>
          <div className="muted head-meta">
            <Addr a={address} /> · leader {s ? <Addr a={s.leader} /> : "…"}
          </div>
        </div>
        {s && <MandateBadges m={s.mandate} reduceOnly={s.reduceOnly} />}
      </div>

      {s?.reduceOnly && (
        <div className="note note-bad">
          <strong>Mandate breached.</strong> The share price fell more than {s.mandate.drawdownBps / 100}% below its high, so the vault now accepts only
          position-reducing orders. Anyone can cancel its orders and close its positions. Redemptions stay open.
        </div>
      )}

      <div className="stats">
        <Stat label="NAV" value={s ? `$${fmtUsd(s.nav, 4)}` : <Skeleton w={100} h={26} />} sub="bank equity + locked + wallet" />
        <Stat label="Share price" value={s ? s.pps.toFixed(6) : <Skeleton w={100} h={26} />} sub={s ? <>return <Pct v={s.pps - 1} /></> : null} />
        <Stat label="High-water mark" value={s ? s.hwm.toFixed(6) : <Skeleton w={100} h={26} />} sub={s ? `fee ${s.mandate.perfFeeBps / 100}% above this` : null} />
        <Stat
          label="From high"
          value={s ? `−${(drawdown * 100).toFixed(2)}%` : <Skeleton w={80} h={26} />}
          tone={s && drawdown > (s.mandate.drawdownBps / 10_000) * 0.6 ? "bad" : undefined}
          sub={s ? `breaker at −${s.mandate.drawdownBps / 100}%` : null}
        />
        <Stat label="Shares" value={s ? fmtUsd(s.supply, 4) : <Skeleton w={80} h={26} />} sub={s?.symbol} />
      </div>

      <div className="grid-2">
        <Card title="Share price" right={<span className="muted small">sampled from chain state at {hist.data?.length ?? "…"} blocks</span>}>
          {hist.data && s ? <PpsChart data={hist.data} hwm={s.hwm} drawdownBps={s.mandate.drawdownBps} /> : <Skeleton h={220} />}
          <ErrorNote e={hist.error} />
        </Card>
        <Card title="The mandate" className="mandate-card">
          {s ? (
            <>
              <p className="mandate-sentence">{mandateSentence(s.mandate)}</p>
              <dl className="rules">
                {mandateRules(s.mandate).map((r) => (
                  <div key={r.k} className="rule">
                    <dt>{r.k}</dt>
                    <dd>
                      <span className="num">{r.v}</span>
                      <span className="muted small">{r.note}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="muted small">Fixed at deploy. No admin key, no upgrade path.</p>
            </>
          ) : (
            <Skeleton h={180} />
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Positions" right={pos.data ? <span className="muted small num">free ${fmtUsd(pos.data.free, 4)} · locked ${fmtUsd(pos.data.locked, 4)}</span> : null}>
          <table className="compact">
            <thead>
              <tr>
                <th>Market</th>
                <th className="r">Size</th>
                <th className="r">Entry</th>
                <th className="r">Mark</th>
                <th className="r">Notional</th>
                <th className="r">uPnL</th>
              </tr>
            </thead>
            <tbody>
              {pos.data?.rows.map((p) => (
                <tr key={p.market}>
                  <td>{p.market}</td>
                  <td className={`r num ${p.size > 0 ? "tone-good" : p.size < 0 ? "tone-bad" : "muted"}`}>{p.size === 0 ? "flat" : p.size}</td>
                  <td className="r num">{p.size ? fmtUsd(p.entry, 1) : "—"}</td>
                  <td className="r num">{fmtUsd(p.mark, 1)}</td>
                  <td className="r num">{p.size ? `$${fmtUsd(p.notional)}` : "—"}</td>
                  <td className={`r num ${p.upnl > 0 ? "tone-good" : p.upnl < 0 ? "tone-bad" : ""}`}>{p.size ? fmtUsd(p.upnl, 4) : "—"}</td>
                </tr>
              ))}
              {!pos.data && (
                <tr>
                  <td colSpan={6}>
                    <Skeleton />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        {s && <DepositRedeem vault={address} account={account} onConnect={onConnect} pps={s.pps} reduceOnly={s.reduceOnly} lockSeconds={s.mandate.lockSeconds} onDone={() => { v.reload(); pos.reload(); act.reload(); }} />}
      </div>

      <Card title="Leader orders" right={<span className="muted small">{trades.length} sent · {refused.length} refused by the contract</span>}>
        <table className="compact activity">
          <thead>
            <tr>
              <th>Time</th>
              <th>Call</th>
              <th>Order</th>
              <th>Result</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((a) => (
              <tr key={a.hash} className={a.ok ? "" : "row-refused"}>
                <td className="muted num small">{new Date(a.time).toLocaleTimeString()}</td>
                <td className="mono small">{a.method}</td>
                <td>{a.summary}</td>
                <td>{a.ok ? <Badge tone="good">executed</Badge> : <Badge tone="bad" title="Reverted by the vault: the mandate refused it">refused · {a.error}</Badge>}</td>
                <td>
                  <TxLink h={a.hash} />
                </td>
              </tr>
            ))}
            {act.loading && !act.data && (
              <tr>
                <td colSpan={5}>
                  <Skeleton />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <ErrorNote e={act.error} />
      </Card>

      <Card title="Deposits, redemptions, checkpoints">
        <table className="compact">
          <tbody>
            {flows.map((a) => (
              <tr key={a.hash}>
                <td className="muted num small">{new Date(a.time).toLocaleTimeString()}</td>
                <td className="mono small">{a.method}</td>
                <td>{a.summary}</td>
                <td>
                  <Addr a={a.from} />
                </td>
                <td>
                  <TxLink h={a.hash} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DepositRedeem(props: { vault: Address; account?: Address; onConnect: () => void; pps: number; reduceOnly: boolean; lockSeconds: number; onDone: () => void }) {
  const { vault, account } = props;
  const [tab, setTab] = useState<"deposit" | "redeem">("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState<string>();
  const me = useAsync(async () => {
    if (!account) return null;
    const [usd, shares, until] = await Promise.all([
      client.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [account] }) as Promise<bigint>,
      client.readContract({ address: vault, abi: vaultAbi, functionName: "lockedUntil", args: [account] }) as Promise<bigint>,
    ]);
    return { usd: num(usd), shares: num(shares), until: Number(until) };
  }, [account, vault, done], 15_000);

  const now = Date.now() / 1000;
  const locked = me.data && me.data.until > now;
  const amt = Number(amount) || 0;

  async function go() {
    if (!account) return props.onConnect();
    setErr(undefined);
    setDone(undefined);
    try {
      const raw = parseUnits(amount || "0", 18);
      if (tab === "deposit") {
        setBusy("Approving exactly this amount…");
        await write(account, COLLATERAL, erc20Abi as any, "approve", [vault, raw]);
        setBusy("Depositing…");
        const h = await write(account, vault, vaultAbi, "deposit", [raw]);
        setDone(h);
      } else {
        setBusy("Redeeming…");
        const h = await write(account, vault, vaultAbi, "redeem", [raw]);
        setDone(h);
      }
      setAmount("");
      props.onDone();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Card title={<div className="tabs">{(["deposit", "redeem"] as const).map((t) => <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t === "deposit" ? "Deposit" : "Redeem"}</button>)}</div>}>
      <div className="form">
        <label className="field">
          <span>{tab === "deposit" ? "USDso" : "Shares"}</span>
          <div className="input-row">
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            {me.data && (
              <button className="ghost small" onClick={() => setAmount(String(tab === "deposit" ? me.data!.usd : me.data!.shares))}>
                max
              </button>
            )}
          </div>
        </label>
        <div className="muted small num">
          {tab === "deposit" ? `≈ ${(amt / props.pps || 0).toFixed(4)} shares at ${props.pps.toFixed(6)}` : `≈ $${fmtUsd(amt * props.pps, 4)} at ${props.pps.toFixed(6)}`}
        </div>
        {me.data && (
          <div className="muted small num">
            Wallet ${fmtUsd(me.data.usd)} · {fmtUsd(me.data.shares, 4)} shares
            {locked ? ` · locked for ${Math.ceil(me.data.until - now)}s` : ""}
          </div>
        )}
        {tab === "deposit" && props.reduceOnly && <div className="note note-bad small">Deposits are closed: the mandate is breached.</div>}
        {tab === "deposit" && <div className="muted small">Shares lock for {props.lockSeconds}s. You approve the vault for exactly this amount, and the vault approves only the MarginBank.</div>}
        <button className="primary" disabled={!!busy || (!!account && (!amt || (tab === "deposit" && props.reduceOnly) || (tab === "redeem" && !!locked)))} onClick={go}>
          {busy ?? (!account ? "Connect wallet" : tab === "deposit" ? "Deposit" : locked ? "Locked" : "Redeem")}
        </button>
        {done && (
          <div className="note note-good small">
            Done · <TxLink h={done} />
          </div>
        )}
        <ErrorNote e={err} />
      </div>
    </Card>
  );
}
