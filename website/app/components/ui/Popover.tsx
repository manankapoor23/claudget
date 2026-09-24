import { Chart } from "./Chart";
import { Limit } from "./Limit";
import { FIVE_HOUR, SESSIONS, TODAY, WEEKLY } from "./demo";

/** Today's three figures, as the overview shows them. */
export function Figures() {
  return (
    <div className="figs">
      <div className="fig">
        <span className="fig__v">{TODAY.tokens}</span>
        <span className="fig__k">today</span>
      </div>
      <div className="fig">
        <span className="fig__v">{TODAY.rate}/min</span>
        <span className="fig__k">now</span>
      </div>
      <div className="fig">
        <span className="fig__v">{TODAY.requests}</span>
        <span className="fig__k">requests</span>
      </div>
    </div>
  );
}

/** The heaviest sessions of the last day. */
export function TopSessions({ className = "" }: { className?: string }) {
  return (
    <div className={`sect ${className}`.trim()}>
      <span className="sect__title">Sessions</span>
      <ul className="tops">
        {SESSIONS.map((s) => (
          <li key={s.name} className="top">
            <span className={s.live ? "top__dot top__dot--live" : "top__dot"} />
            <span className="top__name">{s.name}</span>
            <span className="top__bar">
              <span style={{ width: `${s.share * 100}%` }} />
            </span>
            <span className="top__val">{s.tokens}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Live() {
  return (
    <span className="live">
      <i />
      Live
    </span>
  );
}

/**
 * The menu-bar popover (renderer/components/PopoverApp.tsx): brand and plan,
 * then the overview — limits, today, sessions — and the footer actions.
 */
export function Popover({ live = false }: { live?: boolean }) {
  return (
    <div className="ui pop">
      <div className="pop__bar">
        <span className="pop__brand">claudget</span>
        <span className="pop__plan">Pro</span>
        <span className="pop__spacer" />
        <Live />
      </div>
      <div className="pop__body">
        <div className="sect lims">
          <Limit limit={FIVE_HOUR} live={live} />
          <Limit limit={WEEKLY} />
        </div>
        <div className="sect">
          <Figures />
          <Chart />
        </div>
        <TopSessions />
      </div>
      <div className="pop__foot">
        <span className="pop__action pop__action--primary">Dashboard</span>
        <span className="pop__action">Pill</span>
        <span className="pop__action">Bar</span>
        <span className="pop__spacer" />
        <span className="pop__action">Settings</span>
        <span className="pop__action">Quit</span>
      </div>
    </div>
  );
}
