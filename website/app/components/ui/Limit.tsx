import type { CSSProperties } from "react";
import { toneOf, type DemoLimit } from "./demo";

/**
 * A percentage that ticks up by one a moment after load, the way a live
 * reading does, driven by `.live-tick` in ui.css. The digits are a CSS counter,
 * so the tick is a single discrete step whether or not the browser supports
 * @property, and under reduced motion it simply shows the final value.
 */
export function LiveNumber({ to, suffix = "" }: { to: number; suffix?: string }) {
  return <span className="num-tick" data-suffix={suffix} style={{ "--to": to } as CSSProperties} />;
}

/**
 * Static port of the app's LimitRow (renderer/components/WidgetOverview.tsx):
 * name and %, a bar with a tick where the clock is (fill past the tick = ahead
 * of pace), then time left and — only when it's coming — when it fills.
 */
export function Limit({
  limit,
  live = false,
  className,
}: {
  limit: DemoLimit;
  /** Tick the number up by one and throb, as the app does when a limit rises. */
  live?: boolean;
  className?: string;
}) {
  const { label, pct, tick, left, fullBy } = limit;
  return (
    <div
      className={["lim", live ? "live-tick" : "", className ?? ""].join(" ").trim()}
      data-tone={toneOf(pct)}
    >
      <div className="lim__head">
        <span className="lim__name">{label}</span>
        <span className="lim__pct">{live ? <LiveNumber to={pct} suffix="%" /> : `${pct}%`}</span>
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
