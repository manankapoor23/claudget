/**
 * A representation of the actual claudget widget, at the widget's real size
 * (360pt wide — what `NORMAL` is in packages/desktop/src/main/window.ts).
 *
 * Rendering it life-size is the point: the product is a small always-on-top
 * monitor, and a poster-sized mock would misrepresent what you're downloading.
 * Figures match the app's own vocabulary — block tokens against the 5h window,
 * estimated cost, burn rate, reset countdown, session count, data source.
 */

/** Deterministic bars — a real 12-hour activity shape, not a random chart. */
const ACTIVITY = [38, 52, 30, 64, 80, 46, 58, 72, 90, 60, 44, 76];
const SEGMENTS = 24;
const PERCENT = 27;

export function AppWindow() {
  const filled = Math.round((PERCENT / 100) * SEGMENTS);

  return (
    <div>
      <div className="appwin" aria-hidden>
        <div className="appwin__bar">
          <span className="appwin__dots">
            <i />
            <i />
            <i />
          </span>
          <span className="appwin__title">claudget</span>
          <span className="appwin__live">
            <i />
            live
          </span>
        </div>

        <div className="appwin__body">
          <div>
            <div className="appwin__row" style={{ marginBottom: "var(--s2)" }}>
              <span className="lbl">Block tokens · 5h window</span>
            </div>
            <div className="big">
              <span className="big__val">6.9M</span>
              <span className="big__of">/ 26M</span>
              <span className="big__pct">{PERCENT}%</span>
            </div>
            <div className="meter" style={{ marginTop: "var(--s3)" }}>
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <i key={i} className={i < filled ? "on" : undefined} />
              ))}
            </div>
          </div>

          <div>
            <span className="lbl">Activity · last 12h</span>
            <div className="spark" style={{ marginTop: "var(--s2)" }}>
              {ACTIVITY.map((h, i) => (
                <i
                  key={i}
                  className={h >= 70 ? "hi" : undefined}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="statgrid">
          <div>
            <span className="lbl">Est. cost</span>
            <span className="num">$17.10</span>
          </div>
          <div>
            <span className="lbl">Burn rate</span>
            <span className="num">42K/m</span>
          </div>
          <div>
            <span className="lbl">Resets in</span>
            <span className="num">02:14</span>
          </div>
          <div>
            <span className="lbl">Sessions</span>
            <span className="num">8</span>
          </div>
        </div>

        <div className="appwin__foot">
          <span className="appwin__badge">local</span>
          <span>updated 2s ago</span>
        </div>
      </div>

      <p className="appwin__cap">360 × 520 pt · frameless · always on top</p>
    </div>
  );
}
