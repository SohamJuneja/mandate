import { useMemo, useState } from "react";

type Pt = { t: number; pps: number };

/** Share-price area chart with the high-water mark and the drawdown floor as reference lines. */
export function PpsChart({ data, hwm, drawdownBps }: { data: Pt[]; hwm: number; drawdownBps: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 220;
  const P = { l: 8, r: 92, t: 12, b: 24 };
  const floor = hwm * (1 - drawdownBps / 10_000);

  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const ys = [...data.map((d) => d.pps), hwm, floor];
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    const pad = Math.max((hi - lo) * 0.12, 0.0005);
    lo -= pad;
    hi += pad;
    const t0 = data[0].t;
    const t1 = data[data.length - 1].t || t0 + 1;
    const x = (t: number) => P.l + ((t - t0) / Math.max(t1 - t0, 1)) * (W - P.l - P.r);
    const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const line = data.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.pps).toFixed(1)}`).join("");
    const area = `${line}L${x(t1).toFixed(1)},${H - P.b}L${x(t0).toFixed(1)},${H - P.b}Z`;
    return { x, y, line, area, lo, hi, t0, t1 };
  }, [data, hwm, floor]);

  if (!geo) return <div className="chart-empty">Not enough history yet.</div>;
  const h = hover !== null ? data[hover] : data[data.length - 1];
  const up = data[data.length - 1].pps >= data[0].pps;

  return (
    <div className="chart">
      <div className="chart-readout">
        <span className="num">{h.pps.toFixed(6)}</span>
        <span className="muted">{new Date(h.t).toLocaleString()}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Share price history"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          for (let i = 0; i < data.length; i++) if (Math.abs(geo.x(data[i].t) - px) < Math.abs(geo.x(data[best].t) - px)) best = i;
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id="ppsFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={up ? "var(--accent)" : "var(--bad)"} stopOpacity="0.28" />
            <stop offset="100%" stopColor={up ? "var(--accent)" : "var(--bad)"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={P.l} x2={W - P.r} y1={geo.y(hwm)} y2={geo.y(hwm)} className="ref ref-hwm" />
        <text x={W - P.r + 6} y={geo.y(hwm) + 4} className="ref-label">
          high {hwm.toFixed(4)}
        </text>
        <line x1={P.l} x2={W - P.r} y1={geo.y(floor)} y2={geo.y(floor)} className="ref ref-floor" />
        <text x={W - P.r + 6} y={geo.y(floor) + 4} className="ref-label ref-label-bad">
          −{drawdownBps / 100}%
        </text>
        <path d={geo.area} fill="url(#ppsFill)" />
        <path d={geo.line} className={`pps-line ${up ? "" : "pps-line-down"}`} />
        {hover !== null && (
          <>
            <line x1={geo.x(h.t)} x2={geo.x(h.t)} y1={P.t} y2={H - P.b} className="crosshair" />
            <circle cx={geo.x(h.t)} cy={geo.y(h.pps)} r={4} className="dot" />
          </>
        )}
        <text x={P.l} y={H - 6} className="axis-label">
          {new Date(geo.t0).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </text>
        <text x={W - P.r} y={H - 6} className="axis-label" textAnchor="end">
          {new Date(geo.t1).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </text>
      </svg>
    </div>
  );
}
