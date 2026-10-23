import { toneOf } from "./demo";

/**
 * The floating pill (renderer/components/PillApp.tsx), collapsed: the limit
 * chosen in Settings (the 5-hour one by default) and the time until it resets,
 * inside the glow ring that shifts from orange to amber to red as it fills. A
 * live estimate wears its "~" and is dimmed, as in the app.
 */
export function Pill({
  label,
  pct,
  reset,
  estimated = false,
}: {
  label: string;
  pct: number;
  /** Time to the reset; left out, as in the app, when there isn't one. */
  reset?: string | null;
  estimated?: boolean;
}) {
  const tone = toneOf(pct);
  return (
    <div className="ui pshell" data-tone={tone}>
      <div className="pshell__pill">
        <span className="pill__dot" data-tone={tone} />
        <span className="pill__text">
          <span className="pill__label">{label}</span>
          <b data-tone={tone} className={estimated ? "pill__pct--est" : undefined}>
            {estimated ? <span className="est-mark">~</span> : null}
            {pct}%
          </b>
          {reset ? <span className="pill__reset">{reset}</span> : null}
        </span>
      </div>
    </div>
  );
}
