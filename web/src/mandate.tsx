import { marketOf, num, short, type Mandate } from "./chain";
import { Badge } from "./components/ui";

export const marketNames = (m: Mandate) => m.allowedPools.map((p) => marketOf(p)?.name ?? short(p));

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The mandate in one plain paragraph, exactly as the contract enforces it. */
export function mandateSentence(m: Mandate): string {
  const lev = Number(m.maxLeverageX1e2) / 100;
  const cap = num(m.maxNotionalPerPool);
  return (
    `This leader can trade ${list(marketNames(m))}, up to ${lev}x, max $${cap.toLocaleString("en-US", { maximumFractionDigits: 2 })} per market. ` +
    `If the vault falls ${m.drawdownBps / 100}% from its high, it can only reduce. The leader cannot withdraw your funds.`
  );
}

export function MandateBadges({ m, reduceOnly }: { m: Mandate; reduceOnly: boolean }) {
  return (
    <div className="badges">
      {reduceOnly && (
        <Badge tone="bad" title="Drawdown limit breached: only position-reducing orders are accepted">
          Reduce-only
        </Badge>
      )}
      {marketNames(m).map((n) => (
        <Badge key={n} tone="accent">
          {n}
        </Badge>
      ))}
      <Badge title="Max total notional / NAV">{Number(m.maxLeverageX1e2) / 100}x</Badge>
      <Badge title="Max notional per market">${num(m.maxNotionalPerPool).toFixed(0)}/mkt</Badge>
      <Badge tone="warn" title="Reduce-only below this drawdown from the high-water mark">
        DD {m.drawdownBps / 100}%
      </Badge>
      <Badge title="Performance fee above the high-water mark">fee {m.perfFeeBps / 100}%</Badge>
      <Badge title="Shares locked after each deposit">lock {m.lockSeconds}s</Badge>
    </div>
  );
}

/** The rule list, for the detail page. */
export function mandateRules(m: Mandate) {
  const lev = Number(m.maxLeverageX1e2) / 100;
  return [
    { k: "Markets", v: list(marketNames(m)), note: "Any other market reverts MarketNotAllowed" },
    { k: "Leverage", v: `${lev}x`, note: "Worst-case notional (positions + resting orders) / NAV, checked at mark on every order" },
    { k: "Per-market cap", v: `$${num(m.maxNotionalPerPool).toFixed(2)}`, note: "NotionalCapExceeded above this" },
    { k: "Drawdown breaker", v: `${m.drawdownBps / 100}% from high`, note: "Latches reduce-only; anyone may then cancel and close" },
    { k: "Performance fee", v: `${m.perfFeeBps / 100}%`, note: "Paid in new shares, only on gains above the high-water mark" },
    { k: "Leader skin", v: `≥ ${m.leaderMinShareBps / 100}%`, note: "The leader must keep this share while others hold shares" },
    { k: "Lock", v: `${m.lockSeconds}s`, note: "After each deposit, before redeeming or transferring" },
    { k: "Withdrawals", v: "Depositors only", note: "redeem() pays the shareholder; the leader has no withdraw path" },
  ];
}
