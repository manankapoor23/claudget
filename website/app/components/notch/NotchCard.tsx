import type { CSSProperties } from "react";
import { toneOf } from "./geometry";
import "./notch.css";

export interface NotchCardData {
  pct: number;
  estimated?: boolean;
  /** Null for a window that hasn't started: "No reset scheduled". */
  resetsIn: string | null;
  /** Only when the pace so far would fill it before the reset. */
  fullBy?: string | null;
  weekly: number;
  weeklyEstimated?: boolean;
}

/** The demo snapshot the whole page tells (components/ui/demo.ts). */
export const CARD_DEMO: NotchCardData = {
  pct: 62,
  estimated: true,
  resetsIn: "2h 30m",
  fullBy: "4:01 PM",
  weekly: 31,
};

/**
 * The card that drops from the notch on hover (NotchCardView): the 5-hour
 * limit with its bar, when it resets and when it fills, then the weekly
 * limit. "~" marks a live estimate between Anthropic's checks.
 */
export function NotchCard({
  data = CARD_DEMO,
  className = "",
  style,
}: {
  data?: NotchCardData;
  className?: string;
  style?: CSSProperties;
}) {
  const { pct, estimated, resetsIn, fullBy, weekly, weeklyEstimated } = data;
  const p = Math.round(pct);
  return (
    <div
      className={`ncard ${className}`.trim()}
      data-tone={toneOf(p)}
      data-estimated={estimated ? "" : undefined}
      style={style}
    >
      <div className="ncard__row">
        <span className="ncard__k">5-hour</span>
        <span className="ncard__pct">
          {estimated ? <i>~</i> : null}
          <span data-nc="pct">{p}</span>%
        </span>
      </div>
      <div className="ncard__bar">
        <span data-nc="bar" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="ncard__meta">
        {resetsIn ? (
          <span>
            Resets in <span data-nc="reset">{resetsIn}</span>
          </span>
        ) : (
          <span>No reset scheduled</span>
        )}
        {fullBy ? (
          <span className="ncard__full" data-nc="full">
            Full by {fullBy}
          </span>
        ) : null}
      </div>
      <div className="ncard__rule" />
      <div className="ncard__row">
        <span className="ncard__wk-k">Weekly</span>
        <span className="ncard__wk">
          {weeklyEstimated ? <i>~</i> : null}
          {weekly}%
        </span>
      </div>
    </div>
  );
}
