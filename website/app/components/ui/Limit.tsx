import type { CSSProperties } from "react";
import { toneOf, type DemoLimit } from "./demo";

/**
 * A percentage that can roll up from zero, the way the app's popover does on
 * open (useCountUp in renderer/lib/motion.ts). The digits are a CSS counter
 * driven by motion.css; a hidden copy of the final value reserves the width,
 * so the count never moves its neighbours. Without motion, it simply shows
 * the final value.
 */
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  return (
    <span
      className="count"
      data-final={`${to}${suffix}`}
      data-suffix={suffix}
      style={{ "--to": to } as CSSProperties}
    />
  );
}

/**
 * Static port of the app's LimitRow (renderer/components/WidgetOverview.tsx):
 * name and %, a bar with a tick where the clock is (fill past the tick = ahead
 * of pace), then time left and — only when it's coming — when it fills.
 */
export function Limit({
  limit,
  count = false,
  className,
}: {
  limit: DemoLimit;
  /** Let the percentage roll up with the fill, as the app does on open. */
  count?: boolean;
  className?: string;
}) {
  const { label, pct, tick, left, fullBy } = limit;
  return (
    <div className={["lim", className ?? ""].join(" ").trim()} data-tone={toneOf(pct)}>
      <div className="lim__head">
        <span className="lim__name">{label}</span>
        <span className="lim__pct">{count ? <CountUp to={pct} suffix="%" /> : `${pct}%`}</span>
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
