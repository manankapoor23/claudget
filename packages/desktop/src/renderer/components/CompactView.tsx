import type { JSX, ReactNode } from 'react';
import type { UsageSnapshot } from '@claude-widget/core';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { formatCompact, formatResetAt, formatUSD } from '../lib/format';
import { costCopy } from '../lib/billing';
import { limitLabel, rankLimits, verdictFor } from '../../shared/limits';
import { useBump } from '../lib/motion';
import { Countdown } from './Countdown';
import { CloseIcon, ExpandIcon } from './icons';

/** Meter tone by how close a limit is — the one thing a glance must catch. */
function tone(fraction: number): 'ok' | 'warn' | 'bad' {
  if (fraction >= 0.9) return 'bad';
  if (fraction >= 0.7) return 'warn';
  return 'ok';
}

interface MeterProps {
  label: string;
  value: ReactNode;
  unit?: string;
  meta: ReactNode;
  /** 0..1; omit for a plain figure with no bar. */
  fraction?: number;
  sub?: ReactNode;
}

function Meter({ label, value, unit, meta, fraction, sub }: MeterProps): JSX.Element {
  const f = fraction === undefined ? null : Math.max(0, Math.min(1, fraction));
  const bump = useBump(f === null ? 0 : Math.round(f * 100));
  const cls = f === null ? 'cmeter' : `cmeter cmeter--${tone(f)}`;
  return (
    <div className={bump ? `${cls} is-bump` : cls}>
      <div className="cmeter__head">
        <span className="cmeter__label">{label}</span>
        <span className="cmeter__meta">{meta}</span>
      </div>
      <div className="cmeter__value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {f !== null ? (
        <div className="cmeter__track">
          <div className="cmeter__fill" style={{ width: `${f * 100}%` }} />
        </div>
      ) : (
        <div className="cmeter__sub">{sub}</div>
      )}
    </div>
  );
}

/** Slim, draggable bar for the expanded pill: open the dashboard, or put the pill away. */
export function CompactBar(): JSX.Element {
  const updateConfig = useStore((s) => s.updateConfig);

  return (
    <div className="cbar">
      <span className="cbar__name">claudget</span>
      <div className="cbar__spacer" />
      <div className="cbar__actions">
        <button
          className="cbtn"
          type="button"
          title="Open dashboard"
          onClick={() => void getBridge()?.windowAction({ type: 'open-dashboard' })}
        >
          <ExpandIcon size={12} />
        </button>
        <button
          className="cbtn cbtn--danger"
          type="button"
          title="Hide the floating pill (turn it back on from the menu bar)"
          onClick={() => void updateConfig({ compact: false })}
        >
          <CloseIcon size={12} />
        </button>
      </div>
    </div>
  );
}

interface CompactViewProps {
  snapshot: UsageSnapshot;
  currency: string;
}

/**
 * The always-on glance: plan limits (or local totals when the official endpoint
 * is off) as two meters, plus one status line for the live block. Sized for the
 * fixed compact window in main/window.ts — every text slot ellipsizes rather
 * than wraps, so nothing can push the layout past the window edge.
 */
export function CompactView({ snapshot, currency }: CompactViewProps): JSX.Element {
  const { official, local } = snapshot;
  const block = local.activeBlock;
  const windows = official.available ? official.windows.slice(0, 2) : [];
  const ranked = official.available ? rankLimits(official.windows) : null;
  const verdict = ranked ? verdictFor(ranked, snapshot.generatedAt) : null;
  const cost = costCopy(snapshot.meta.subscriptionType);
  // On a plan the dollar figure isn't a bill, so the glance shows volume instead.
  const todayFigure = cost.included
    ? formatCompact(local.today.tokens.total)
    : formatUSD(local.today.costUSD, currency);

  return (
    <div className="cbody">
      <div className={windows.length === 1 ? 'cmeters cmeters--one' : 'cmeters'}>
        {windows.length > 0 ? (
          windows.map((w) => (
            <Meter
              key={w.key}
              label={limitLabel(w.label)}
              value={Math.round(w.utilization * 100)}
              unit="%"
              fraction={w.utilization}
              meta={
                <span
                  title={w.resetsAt === null ? undefined : `Resets ${formatResetAt(w.resetsAt)}`}
                >
                  <Countdown resetsAt={w.resetsAt} fallback="—" short />
                </span>
              }
            />
          ))
        ) : (
          <>
            <Meter
              label="Today"
              value={formatCompact(local.today.tokens.total)}
              meta={
                cost.included
                  ? `${local.today.count} requests`
                  : formatUSD(local.today.costUSD, currency)
              }
              sub="tokens"
            />
            <Meter
              label="Last 24h"
              value={formatCompact(local.last24h.tokens.total)}
              meta={
                cost.included
                  ? `${local.last24h.count} requests`
                  : formatUSD(local.last24h.costUSD, currency)
              }
              sub="tokens"
            />
          </>
        )}
      </div>

      <div className="cstatus" data-tone={verdict?.tone ?? 'ok'}>
        <span className={block ? 'cstatus__live' : 'cstatus__idle'} />
        {verdict && verdict.tone === 'bad' ? (
          // Critical: say it in words; the meters above already carry the numbers.
          <span className="cstatus__item cstatus__alert">{verdict.headline}</span>
        ) : (
          <>
            <span className="cstatus__item">
              <b>{block ? formatCompact(block.tokensPerMinute) : 'Idle'}</b>
              {block ? '/min' : ''}
            </span>
            {/* Today's total lives in the full view; here it only fits without a reset. */}
            {ranked?.primary.resetsAt == null ? (
              <span className="cstatus__item">
                <b>{todayFigure}</b> today
              </span>
            ) : null}
          </>
        )}
        {/* When critical the meter above already shows the reset; give the words the room. */}
        {ranked && ranked.primary.resetsAt !== null && verdict?.tone !== 'bad' ? (
          <span className="cstatus__item cstatus__item--end">
            {limitLabel(ranked.primary.label).toLowerCase()} resets{' '}
            <b>
              <Countdown resetsAt={ranked.primary.resetsAt} fallback="—" short />
            </b>
          </span>
        ) : null}
      </div>
    </div>
  );
}
