import { useEffect, useRef, useState, type ReactNode } from "react";
import { addrUrl, short, txUrl } from "../chain";

/** Run an async loader, re-run on deps change and every `refreshMs` (0 = never). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], refreshMs = 0) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const tick = useRef(0);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const id = ++tick.current;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => alive && id === tick.current && setState({ data, loading: false }))
      .catch((e) => alive && id === tick.current && setState((s) => ({ ...s, error: String(e?.shortMessage ?? e?.message ?? e), loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => setNonce((n) => n + 1), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent"; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value num ${tone ? `tone-${tone}` : ""}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export const Addr = ({ a, label }: { a: string; label?: string }) => (
  <a className="mono link" href={addrUrl(a)} target="_blank" rel="noreferrer" title={a}>
    {label ?? short(a)}
  </a>
);

export const TxLink = ({ h }: { h: string }) => (
  <a className="mono link" href={txUrl(h)} target="_blank" rel="noreferrer" title={h}>
    {h.slice(0, 10)}…
  </a>
);

export function Pct({ v, dp = 2 }: { v: number; dp?: number }) {
  const tone = v > 0.00005 ? "good" : v < -0.00005 ? "bad" : "";
  return (
    <span className={`num tone-${tone}`}>
      {v > 0 ? "+" : ""}
      {(v * 100).toFixed(dp)}%
    </span>
  );
}

export const Skeleton = ({ w = "100%", h = 14 }: { w?: string | number; h?: number }) => <span className="skeleton" style={{ width: w, height: h }} />;

export function Card({ title, children, right, className = "" }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <header className="card-head">
          <h3>{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export const ErrorNote = ({ e }: { e?: string }) => (e ? <div className="note note-bad">{e}</div> : null);
