import { GlyphBattery, GlyphTray, GlyphWifi, IconApple } from "../../icons";
import { Notch } from "./Notch";

/**
 * A notched MacBook's menu bar: the app's menus on the left, the notch with
 * its line in the middle, claudget's item just right of it, then the system's
 * own items. Sized in points; scale it with zoom. As on the machine, whatever
 * doesn't fit beside the notch simply isn't shown.
 */
export function NotchMenuBar({
  id,
  pct = 62,
  weekly = 31,
  pressed = false,
  still = false,
}: {
  id: string;
  pct?: number;
  weekly?: number;
  pressed?: boolean;
  still?: boolean;
}) {
  return (
    <div className="nmb">
      <span className="nmb__side nmb__left">
        <IconApple width={14} height={14} />
        <b>Terminal</b>
        <span>Shell</span>
        <span>Edit</span>
        <span>View</span>
        <span>Window</span>
        <span>Help</span>
      </span>
      <span className="nmb__notch">
        <Notch id={id} pct={pct} estimated still={still} />
      </span>
      <span className="nmb__rightcol">
        <span className="nmb__item" data-pressed={pressed ? "" : undefined}>
          <GlyphTray width={16} height={16} />
          <span>
            ~{pct}% · {weekly}%
          </span>
        </span>
        <span className="nmb__side nmb__right">
          <GlyphWifi width={16} height={16} />
          <GlyphBattery width={25} height={13} />
          <span>Thu 2:30 PM</span>
        </span>
      </span>
    </div>
  );
}
