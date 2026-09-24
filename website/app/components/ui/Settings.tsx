import { IconBell, IconClose, IconData, IconInfo, IconSliders } from "../../icons";

const TABS = [
  { label: "General", Icon: IconSliders },
  { label: "Alerts", Icon: IconBell },
  { label: "Data", Icon: IconData, on: true },
  { label: "About", Icon: IconInfo },
];

/**
 * The Settings window on its Data tab (renderer/components/Settings.tsx),
 * cropped to the two groups that answer "what does it read, and can I stop
 * it": the plan-limits switch with its schedule, and the read-only folder.
 */
export function SettingsWindow() {
  return (
    <div className="ui swin">
      <div className="set__bar">
        <span className="lights">
          <i />
          <i />
          <i />
        </span>
        <span className="set__tabs">
          {TABS.map(({ label, Icon, on }) => (
            <span key={label} className={on ? "set__tab set__tab--on" : "set__tab"}>
              <Icon width={16} height={16} />
              {label}
            </span>
          ))}
        </span>
        <span className="winctl">
          <IconClose width={13} height={13} />
        </span>
      </div>
      <div className="set__body">
        <div className="sgroup">
          <span className="sgroup__title">Plan limits</span>
          <div className="sgroup__rows">
            <div className="srow">
              <span className="srow__text">
                <span className="srow__label">Track plan limits</span>
                <span className="srow__hint">
                  Reads your Claude Code login and asks Anthropic for your 5-hour and weekly
                  limits.
                </span>
              </span>
              <span className="switch switch--on" />
            </div>
            <div className="srow">
              <span className="srow__text">
                <span className="srow__label">Check for updates</span>
                <span className="srow__hint">Connected</span>
              </span>
              <span className="select">Every 5 minutes</span>
            </div>
          </div>
        </div>
        <div className="sgroup">
          <span className="sgroup__title">Local usage</span>
          <div className="sgroup__rows">
            <div className="srow">
              <span className="srow__text">
                <span className="srow__label">Claude folder</span>
                <span className="srow__hint">~/.claude</span>
              </span>
              <span className="srow__static">Read only</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
