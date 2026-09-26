import type { JSX } from 'react';
import type { OfficialWindow, SessionStat } from '@claude-widget/core';
import type { OpenCodeUsage, UsageSnapshot } from '@shared/ipc';
import { formatClock, formatCompact, formatResetAt, formatUSD } from '../lib/format';
import { BarChart } from './BarChart';
import { LimitHistory } from './LimitHistory';
import { LimitsNotice } from './LimitsNotice';
import { projectName } from '../lib/sessions';
import { useBump, useCountUp } from '../lib/motion';
import { limitLabel, rankLimits, toneOf } from '../../shared/limits';
import { paceFor, projectedFullAt } from '../../shared/pace';
import { formatDurationShort } from '../../shared/duration';

interface WidgetOverviewProps {
  snapshot: UsageSnapshot;
  /** Dashboard only: add the limit-history section (the popover stays lean). */
  withHistory?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One limit as data, not prose: name and %, a bar with a tick where the clock
 * is (fill past the tick = ahead of pace), then time left — and, only when the
 * current pace would fill it before reset, when that happens.
 */
export function LimitRow({ w, now }: { w: OfficialWindow; now: number }): JSX.Element {
  const used = Math.max(0, Math.min(1, w.utilization));
  const shown = useCountUp(used * 100);
  // Throb each time the (whole-number) percentage ticks up.
  const bump = useBump(Math.round(used * 100));
  const tone = toneOf(used);
  const pace = paceFor(w, now);
  const fullAt = projectedFullAt(w, now);
  const left = w.resetsAt === null ? null : w.resetsAt - now;

  return (
    <div className={bump ? 'lim is-bump' : 'lim'} data-tone={tone}>
      <div className="lim__head">
        <span className="lim__name">{limitLabel(w.label)}</span>
        <span className="lim__pct">{Math.round(shown)}%</span>
      </div>
      <div className="lim__bar" role="img" aria-label={`${Math.round(used * 100)}% used`}>
        <span className="lim__fill" style={{ width: `${used * 100}%` }} />
        {pace ? (
          <span
            className="lim__tick"
            style={{ left: `${pace.elapsedPct}%` }}
            title={`${Math.round(pace.elapsedPct)}% of the window has passed`}
          />
        ) : null}
      </div>
      <div className="lim__meta">
        <span title={w.resetsAt === null ? undefined : `Resets ${formatResetAt(w.resetsAt, now)}`}>
          {left === null ? 'No reset' : `${formatDurationShort(left)} left`}
        </span>
        {used >= 1 ? (
          <span className="lim__warn">At limit</span>
        ) : fullAt !== null ? (
          <span className="lim__warn" title="At your average pace so far">
            Full by {formatClock(fullAt)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Where the tokens went: the heaviest sessions active in the last day. */
function OpenCodeHistory({ usage }: { usage: OpenCodeUsage }): JSX.Element {
  return (
    <section className="sect ov__day" aria-label="OpenCode local usage">
      <h3 className="sect__title">OpenCode · local history</h3>
      {usage.status !== 'available' || usage.message ? (
        <p className="sect__empty">{usage.message ?? 'OpenCode local history is unavailable.'}</p>
      ) : (
        <>
          <div className="figs">
            <div className="fig">
              <span className="fig__v">{formatCompact(usage.today.total)}</span>
              <span className="fig__k">today · tokens</span>
            </div>
            <div className="fig">
              <span className="fig__v">{formatCompact(usage.allTime.total)}</span>
              <span className="fig__k">all time · tokens</span>
            </div>
            <div className="fig">
              <span className="fig__v">
                {usage.allTime.costUSD === null ? '—' : formatUSD(usage.allTime.costUSD, 'USD')}
              </span>
              <span className="fig__k">
                {usage.allTime.costUSD === null ? 'cost not stored' : 'usage costs'}
              </span>
            </div>
            <div className="fig">
              <span className="fig__v">{usage.allTime.count}</span>
              <span className="fig__k">usage records</span>
            </div>
          </div>
          {usage.granularity === 'session' ? (
            <p className="sect__empty">
              Includes session-level totals where request-level usage was unavailable.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function TopSessions({
  sessions,
  live,
  now,
}: {
  sessions: SessionStat[];
  live: Set<string>;
  now: number;
}): JSX.Element | null {
  const recent = sessions
    .filter((s) => now - s.lastAt < DAY_MS)
    .sort((a, b) => b.tokens.total - a.tokens.total)
    .slice(0, 4);
  const max = recent[0]?.tokens.total || 1;
  return (
    <section className="sect ov__sess" aria-label="Top sessions today">
      <h3 className="sect__title">Sessions</h3>
      {recent.length === 0 ? (
        <p className="sect__empty">No Claude Code sessions in the last day.</p>
      ) : null}
      <ul className="tops">
        {recent.map((s) => (
          <li key={s.sessionId} className="top" title={s.sessionTitle || undefined}>
            <span className={live.has(s.sessionId) ? 'top__dot top__dot--live' : 'top__dot'} />
            <span className="top__name">{projectName(s)}</span>
            <span className="top__bar">
              <span style={{ width: `${(s.tokens.total / max) * 100}%` }} />
            </span>
            <span className="top__val">{formatCompact(s.tokens.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Overview: limits, today, sessions. Numbers and shapes carry it — the only
 * sentence is a projection, and it appears only when there's something to act on.
 */
export function WidgetOverview({
  snapshot,
  withHistory = false,
}: WidgetOverviewProps): JSX.Element {
  const { local, official } = snapshot;
  const now = snapshot.generatedAt;
  const ranked = official.available ? rankLimits(official.windows) : null;
  const limits = ranked ? [ranked.primary, ...ranked.others] : [];
  const block = local.activeBlock;
  const live = new Set(local.activeSessions.map((s) => s.sessionId));

  return (
    <div className="ov">
      {limits.length > 0 ? (
        <section className="sect lims ov__lims" aria-label="Plan limits">
          {limits.map((w) => (
            <LimitRow key={w.key} w={w} now={now} />
          ))}
        </section>
      ) : (
        <section className="sect lims ov__lims" aria-label="Plan limits">
          <LimitsNotice official={official} />
        </section>
      )}

      <section className="sect ov__day" aria-label="Today">
        <div className="figs">
          <div className="fig">
            <span className="fig__v">{formatCompact(local.today.tokens.total)}</span>
            <span className="fig__k">today</span>
          </div>
          <div className="fig">
            <span className="fig__v">
              {block ? `${formatCompact(block.tokensPerMinute)}/min` : '—'}
            </span>
            <span className="fig__k">now</span>
          </div>
          <div className="fig">
            <span className="fig__v">{local.today.count}</span>
            <span className="fig__k">requests</span>
          </div>
        </div>
        <BarChart
          bars={local.hourly.slice(-24).map((b) => ({ at: b.startAt, value: b.tokens.total }))}
          format={(v) => `${formatCompact(v)} tokens`}
          formatScale={formatCompact}
          label="Tokens per hour, last 24 hours"
        />
      </section>

      {snapshot.opencode ? <OpenCodeHistory usage={snapshot.opencode} /> : null}
      <TopSessions sessions={local.sessions} live={live} now={now} />
      {withHistory ? <LimitHistory now={now} embedded /> : null}
    </div>
  );
}
