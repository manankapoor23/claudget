import { useEffect, type JSX } from 'react';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { formatCompact } from '../lib/format';
import { useTheme } from '../lib/theme';
import { isDormant, rankLimits, verdictFor } from '../../shared/limits';
import { BarChart } from './BarChart';
import { CloseIcon, ExpandIcon } from './icons';
import { LimitRow } from './WidgetOverview';

/**
 * The floating bar: both limits and today in one strip that stays on top.
 * Limits keep the API's order (5-hour, then weekly) so each always sits in the
 * same place; the whole bar drags, its buttons don't.
 */
export function MiniBarApp(): JSX.Element {
  const init = useStore((s) => s.init);
  const snapshot = useStore((s) => s.snapshot);
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  useTheme(config?.theme);
  useEffect(() => {
    void init();
  }, [init]);

  const bridge = getBridge();
  const now = snapshot?.generatedAt ?? Date.now();
  const official = snapshot?.official;
  const limits = official?.available
    ? official.windows.filter((w) => !isDormant(w)).slice(0, 2)
    : [];
  const ranked = official?.available ? rankLimits(official.windows) : null;
  const tone = ranked ? verdictFor(ranked, now).tone : 'ok';
  const local = snapshot?.local;
  const block = local?.activeBlock ?? null;

  return (
    <div className="app mb" data-tone={tone}>
      <div className="mb__grid">
        {limits.length > 0 ? (
          limits.map((w) => <LimitRow key={w.key} w={w} now={now} />)
        ) : (
          <div className="mb__off">
            <span>
              {config?.enableOfficial ? 'Plan limits unavailable' : 'Plan limits are off'}
            </span>
            {config && !config.enableOfficial ? (
              <button
                type="button"
                className="btn2 btn2--primary"
                onClick={() => void updateConfig({ enableOfficial: true })}
              >
                Turn on
              </button>
            ) : null}
          </div>
        )}
        {local ? (
          <div className="mb__day">
            <div className="mb__dayhead">
              <span className="mb__daynum">
                {formatCompact(local.today.tokens.total)}
                <small> today</small>
              </span>
              <span className="mb__rate">
                {block ? `${formatCompact(block.tokensPerMinute)}/min` : 'Idle'}
              </span>
            </div>
            {/* Height comes from CSS so the chart grows as the bar is resized. */}
            <BarChart
              bare
              bars={local.hourly.slice(-24).map((b) => ({ at: b.startAt, value: b.tokens.total }))}
              format={(v) => `${formatCompact(v)} tokens`}
              label="Tokens per hour, last 24 hours"
            />
          </div>
        ) : null}
      </div>
      <div className="mb__ctl">
        <button
          type="button"
          className="iconbtn"
          title="Open dashboard"
          onClick={() => void bridge?.windowAction({ type: 'open-dashboard' })}
        >
          <ExpandIcon size={13} />
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--danger"
          title="Hide the floating bar (turn it back on from the menu bar)"
          onClick={() => void updateConfig({ miniBar: false })}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}
