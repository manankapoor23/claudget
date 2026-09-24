import { toneOf } from "./demo";

/**
 * The floating pill (renderer/components/PillApp.tsx), collapsed: the limit
 * closest to running out and the time until it resets, inside the glow ring
 * that shifts from coral to amber to red as it fills.
 */
export function Pill({ label, pct, reset }: { label: string; pct: number; reset: string }) {
  const tone = toneOf(pct);
  return (
    <div className="ui pshell" data-tone={tone}>
      <div className="pshell__pill">
        <span className="pill__dot" data-tone={tone} />
        <span className="pill__text">
          <span className="pill__label">{label}</span>
          <b data-tone={tone}>{pct}%</b>
          <span className="pill__reset">{reset}</span>
        </span>
      </div>
    </div>
  );
}
