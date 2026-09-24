import { IconClose, IconExpand } from "../../icons";
import { Chart } from "./Chart";
import { Limit } from "./Limit";
import { FIVE_HOUR, TODAY, WEEKLY } from "./demo";

/**
 * The floating bar (renderer/components/MiniBarApp.tsx) at its default
 * 580×96: both limits side by side, today's total and rate over the hourly
 * bars, and the expand / close controls on the right.
 */
export function FloatBar() {
  return (
    <div className="ui mb">
      <div className="mb__grid">
        <Limit limit={FIVE_HOUR} />
        <Limit limit={WEEKLY} />
        <div className="mb__day">
          <div className="mb__dayhead">
            <span className="mb__daynum">
              {TODAY.tokens} <small>today</small>
            </span>
            <span className="mb__rate">{TODAY.rate}/min</span>
          </div>
          <Chart bare />
        </div>
      </div>
      <div className="mb__ctl">
        <span className="iconbtn">
          <IconExpand width={13} height={13} />
        </span>
        <span className="iconbtn">
          <IconClose width={13} height={13} />
        </span>
      </div>
    </div>
  );
}
