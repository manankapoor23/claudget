import { toneOf, type DemoLimit } from "./demo";

/**
 * Static port of the app's LimitRow (renderer/components/WidgetOverview.tsx):
 * name and %, a bar with a tick where the clock is (fill past the tick = ahead
 * of pace), then time left and — only when it's coming — when it fills. A
 * live estimate wears its "~" and is dimmed, as in the app.
 */
export function Limit({ limit, className }: { limit: DemoLimit; className?: string }) {
  const { label, pct, tick, left, fullBy, estimated } = limit;
  return (
    <div className={["lim", className ?? ""].join(" ").trim()} data-tone={toneOf(pct)}>
      <div className="lim__head">
        <span className="lim__name">{label}</span>
        <span className={estimated ? "lim__pct lim__pct--est" : "lim__pct"}>
          {estimated ? <span className="est-mark">~</span> : null}
          {pct}%
        </span>
      </div>
      <div className="lim__bar">
        <span className="lim__fill" style={{ width: `${pct}%` }} />
        <span className="lim__tick" style={{ left: `${tick}%` }} />
      </div>
      <div className="lim__meta">
        <span>{left}</span>
        {pct >= 100 ? (
          <span className="lim__warn">At limit</span>
        ) : fullBy ? (
          <span className="lim__warn">Full by {fullBy}</span>
        ) : null}
      </div>
    </div>
  );
}
