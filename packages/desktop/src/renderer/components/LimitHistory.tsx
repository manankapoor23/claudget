import type { JSX } from 'react';
import { useStore } from '../store';
import { formatResetAt } from '../lib/format';
import { cyclesFor, type LimitCycle } from '../../shared/history';
import { toneOf } from '../../shared/limits';

const WEEK_BARS = 8;
const FIVE_HOUR_DAYS = 7;
const DAY_MS = 24 * 3_600_000;

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Cycles({
  cycles,
  now,
  label,
  compact = false,
}: {
  cycles: LimitCycle[];
  now: number;
  label: (c: LimitCycle) => string;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className={compact ? 'lh__plot lh__plot--compact' : 'lh__plot'} role="list">
      <span className="lh__cap" aria-hidden>
        <span>100%</span>
      </span>
      {cycles.map((c) => {
        const live = c.resetsAt > now;
        const hit = c.hitAt !== null;
        return (
          <div
            key={`${c.key}@${c.resetsAt}`}
            className="lh__col"
            role="listitem"
            data-tone={hit ? 'hit' : toneOf(c.peak)}
            data-live={live || undefined}
            title={`${Math.round(c.peak * 100)}% peak${hit ? ` · hit the limit ${formatResetAt(c.hitAt!, now)}` : ''} · ${live ? 'resets' : 'reset'} ${formatResetAt(c.resetsAt, now)}`}
          >
            <span className="lh__bar" style={{ height: `${Math.max(3, c.peak * 100)}%` }} />
            {compact ? null : <span className="lh__lbl">{live ? 'now' : label(c)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * How close each limit window came, and when it actually cut you off —
 * recorded locally as you go, since the endpoint only reports the current one.
 */
export function LimitHistory({
  now,
  embedded = false,
}: {
  now: number;
  /** Overview use: a plain section (no panel chrome) and weekly bars only. */
  embedded?: boolean;
}): JSX.Element {
  const history = useStore((s) => s.history);
  const weeks = cyclesFor(history, 'seven_day').slice(-WEEK_BARS);
  const fives = cyclesFor(history, 'five_hour').filter(
    (c) => now - c.resetsAt < FIVE_HOUR_DAYS * DAY_MS,
  );
  const pastWeeks = weeks.filter((c) => c.resetsAt <= now);
  const weekHits = weeks.filter((c) => c.hitAt !== null).length;
  const fiveHits = fives.filter((c) => c.hitAt !== null).length;
  const typicalPeak =
    pastWeeks.length > 0
      ? [...pastWeeks].map((c) => c.peak).sort((a, b) => a - b)[Math.floor(pastWeeks.length / 2)]!
      : null;

  const shell = embedded ? 'sect lh ov__hist' : 'panel lh';
  const heading = embedded ? (
    <h3 className="sect__title">Limit history</h3>
  ) : (
    <div className="panel__head">
      <span className="panel__title">Limit history</span>
    </div>
  );

  if (weeks.length === 0 && fives.length === 0) {
    return (
      <section className={shell}>
        {heading}
        <p className="sect__empty">
          History starts now. claudget records how close each 5-hour and weekly window gets, so you
          can see your patterns here after a few days.
        </p>
      </section>
    );
  }

  return (
    <section className={shell} aria-label="Limit history">
      {heading}
      <div className="figs lh__figs">
        <div className="fig">
          <span className={weekHits > 0 ? 'fig__v fig__v--bad' : 'fig__v'}>{weekHits}×</span>
          <span className="fig__k">weekly limit hit · last {weeks.length} wk</span>
        </div>
        <div className="fig">
          <span className="fig__v">
            {typicalPeak === null ? '—' : `${Math.round(typicalPeak * 100)}%`}
          </span>
          <span className="fig__k">typical weekly peak</span>
        </div>
        <div className="fig">
          <span className={fiveHits > 0 ? 'fig__v fig__v--warn' : 'fig__v'}>
            {fiveHits} / {fives.length}
          </span>
          <span className="fig__k">5-hour windows maxed · 7 d</span>
        </div>
      </div>
      {weeks.length > 0 ? (
        <div className="lh__group">
          <span className="lh__title">Weekly</span>
          <Cycles cycles={weeks} now={now} label={(c) => dayLabel(c.resetsAt)} />
        </div>
      ) : null}
      {fives.length > 0 && !embedded ? (
        <div className="lh__group">
          <span className="lh__title">5-hour windows · last 7 days</span>
          <Cycles cycles={fives} now={now} label={() => ''} compact />
        </div>
      ) : null}
    </section>
  );
}
