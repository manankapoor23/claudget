import {
  IconActivity,
  IconClose,
  IconInsights,
  IconMore,
  IconOverview,
  IconPin,
  IconSessions,
} from "../../icons";
import { Chart } from "./Chart";
import { Limit } from "./Limit";
import { Figures, Live, TopSessions } from "./Popover";
import { FIVE_HOUR, WEEKLY, WEEKS, WINDOWS, toneOf } from "./demo";

const NAV = [
  { label: "Overview", Icon: IconOverview, on: true },
  { label: "Activity", Icon: IconActivity },
  { label: "Sessions", Icon: IconSessions },
  { label: "Insights", Icon: IconInsights },
];

/**
 * The overview's limit history (renderer/components/LimitHistory.tsx,
 * embedded): three figures, then each weekly window's peak against the 100%
 * line. The figures are derived from the same data the bars draw.
 */
function History() {
  const past = WEEKS.filter((w) => !w.live);
  const typical = [...past].map((w) => w.peak).sort((a, b) => a - b)[Math.floor(past.length / 2)];
  const weekHits = WEEKS.filter((w) => w.hit).length;
  const fiveHits = WINDOWS.filter((w) => w.hit).length;
  return (
    <div className="sect lh ov__hist">
      <span className="sect__title">Limit history</span>
      <div className="figs lh__figs">
        <div className="fig">
          <span className="fig__v fig__v--bad">{weekHits}×</span>
          <span className="fig__k">weekly limit hit · last {WEEKS.length} wk</span>
        </div>
        <div className="fig">
          <span className="fig__v">{typical}%</span>
          <span className="fig__k">typical weekly peak</span>
        </div>
        <div className="fig">
          <span className="fig__v fig__v--warn">
            {fiveHits} / {WINDOWS.length}
          </span>
          <span className="fig__k">5-hour windows maxed · 7 d</span>
        </div>
      </div>
      <div className="lh__group">
        <span className="lh__title">Weekly</span>
        <div className="lh__plot">
          <span className="lh__cap">
            <span>100%</span>
          </span>
          {WEEKS.map((w) => (
            <span
              key={w.label}
              className="lh__col"
              data-tone={w.hit ? "hit" : toneOf(w.peak)}
              data-live={w.live || undefined}
            >
              <span className="lh__bar" style={{ height: `${Math.max(3, w.peak)}%` }} />
              <span className="lh__lbl">{w.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The dashboard window (renderer/App.tsx + Sidebar.tsx) on its Overview view.
 * Traffic lights on macOS; keep-on-top, more and close elsewhere (TitleBar.tsx)
 * — switched in CSS from the same `data-os` hint that picks the download.
 */
export function Dashboard() {
  return (
    <div className="ui dwin">
      <aside className="side">
        <div className="side__head">
          <span className="lights">
            <i />
            <i />
            <i />
          </span>
          <span className="side__brand">claudget</span>
        </div>
        <div className="side__nav">
          {NAV.map(({ label, Icon, on }) => (
            <span key={label} className={on ? "side__item side__item--on" : "side__item"}>
              <Icon width={16} height={16} />
              {label}
            </span>
          ))}
        </div>
        <div className="side__foot">
          <span className="side__plan">Pro plan</span>
          <span className="side__upd">
            <i />
            Updated 12s ago
          </span>
        </div>
      </aside>

      <div className="dash__main">
        <div className="dash__bar">
          <span className="dash__title">Overview</span>
          <span className="pop__spacer" />
          <Live />
          <span className="winctl">
            <IconPin width={14} height={14} />
            <IconMore width={16} height={16} />
            <IconClose width={14} height={14} />
          </span>
        </div>
        <div className="ov">
          <div className="sect lims ov__lims">
            <Limit limit={FIVE_HOUR} />
            <Limit limit={WEEKLY} />
          </div>
          <div className="sect ov__day">
            <Figures />
            <Chart />
          </div>
          <TopSessions className="ov__sess" />
          <History />
        </div>
      </div>
    </div>
  );
}
