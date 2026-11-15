import { fmtUsd, listVaults, readVault, type VaultSummary } from "../chain";
import { Addr, ErrorNote, Pct, Skeleton, useAsync } from "../components/ui";
import { MandateBadges } from "../mandate";

export function VaultsPage() {
  const { data, error, loading } = useAsync(async () => {
    const addrs = await listVaults();
    const vs = await Promise.all(addrs.map((a) => readVault(a).catch(() => null)));
    return vs.filter((v): v is VaultSummary => v !== null).reverse();
  }, [], 20_000);

  const tvl = (data ?? []).reduce((a, v) => a + v.nav, 0);

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>Perp vaults with the rules written on chain.</h1>
          <p className="lede">
            A leader, human or AI agent, trades the pool on dreamDEX perps. Every order passes the vault's mandate first: markets, leverage,
            size, a drawdown breaker. The leader can never withdraw your funds.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <div className="stat-label">Vaults</div>
            <div className="stat-value num">{data ? data.length : <Skeleton w={40} h={28} />}</div>
          </div>
          <div>
            <div className="stat-label">Total NAV</div>
            <div className="stat-value num">{data ? `$${fmtUsd(tvl)}` : <Skeleton w={90} h={28} />}</div>
          </div>
        </div>
      </div>

      <ErrorNote e={error} />
      <div className="table-wrap">
        <table className="vaults">
          <thead>
            <tr>
              <th>Vault</th>
              <th>Leader</th>
              <th className="r">NAV</th>
              <th className="r">Share price</th>
              <th className="r">Return</th>
              <th>Mandate</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data &&
              [0, 1].map((i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j}>
                      <Skeleton />
                    </td>
                  ))}
                </tr>
              ))}
            {data?.map((v) => (
              <tr key={v.address} className="row-link" onClick={() => (location.hash = `#/vault/${v.address}`)}>
                <td>
                  <div className="vault-name">{v.name}</div>
                  <div className="muted mono small">{v.symbol}</div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <Addr a={v.leader} />
                </td>
                <td className="r num">${fmtUsd(v.nav)}</td>
                <td className="r num">{v.pps.toFixed(4)}</td>
                <td className="r">{v.supply > 0 ? <Pct v={v.pps - 1} /> : <span className="muted">—</span>}</td>
                <td>
                  <MandateBadges m={v.mandate} reduceOnly={v.reduceOnly} />
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={6} className="muted center">
                  No vaults yet. <a href="#/create">Create the first one.</a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small">Return is share price versus the 1.0000 the vault started at. Data is read live from Somnia Tokyo testnet (Hideki, chain 50383).</p>
    </div>
  );
}
