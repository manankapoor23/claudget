import { useState, type JSX, type KeyboardEvent } from 'react';

export interface Bar {
  /** Start of the slot (epoch ms). */
  at: number;
  value: number;
}

interface BarChartProps {
  bars: Bar[];
  /** Formats a value for the tooltip, e.g. "12.4M tokens". */
  format: (value: number) => string;
  /** Bare figure for the scale line, e.g. "40M". Defaults to `format`. */
  formatScale?: (value: number) => string;
  /** Plot height in px; omit to let the stylesheet size it (it grows on wide windows). */
  height?: number;
  label: string;
  /** Micro variant: bars only — no axis, scale line or tooltip. */
  bare?: boolean;
}

function hourLabel(ts: number, long = false): string {
  const h = new Date(ts).getHours();
  const suffix = long ? (h < 12 ? ' AM' : ' PM') : h < 12 ? 'a' : 'p';
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${suffix}`;
}

/**
 * Hourly columns with an instant tooltip and a hover crosshair (the native
 * `title` tooltip is slow and unstyled), a gridline at the peak for scale, and
 * the current slot in the accent. Arrow keys walk the bars when focused.
 */
export function BarChart({
  bars,
  format,
  formatScale,
  height,
  label,
  bare = false,
}: BarChartProps): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
  const n = bars.length;
  const active = hover === null ? null : bars[hover];

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const start = hover ?? n - 1;
    setHover(Math.max(0, Math.min(n - 1, start + (e.key === 'ArrowLeft' ? -1 : 1))));
  };

  return (
    <div className={bare ? 'chart chart--bare' : 'chart'}>
      <div
        className="chart__plot"
        style={height === undefined ? undefined : { height }}
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
      >
        {max > 0 && !bare ? (
          <span className="chart__grid" aria-hidden>
            <span>{(formatScale ?? format)(max)}</span>
          </span>
        ) : null}
        {bars.map((b, i) => (
          <span
            key={b.at}
            className={[
              'chart__col',
              i === n - 1 ? 'chart__col--now' : '',
              hover === i ? 'chart__col--hover' : '',
              hover !== null && hover !== i ? 'chart__col--dim' : '',
            ].join(' ')}
            onMouseEnter={() => setHover(i)}
          >
            <span
              className="chart__bar"
              style={{ height: max > 0 ? `${Math.max(3, (b.value / max) * 100)}%` : '3%' }}
            />
          </span>
        ))}
        {active && hover !== null && !bare ? (
          <span
            className="chart__tip"
            data-edge={hover < n * 0.2 ? 'start' : hover > n * 0.8 ? 'end' : 'mid'}
            // Sits just above the hovered bar, so it only leaves the plot for the tallest ones.
            style={{
              left: `${((hover + 0.5) / n) * 100}%`,
              top: `${max > 0 ? (1 - Math.max(0.03, active.value / max)) * 100 : 97}%`,
            }}
          >
            <b>{format(active.value)}</b>
            <span>
              {hover === n - 1
                ? 'This hour'
                : `${hourLabel(active.at, true)}–${hourLabel(active.at + 3_600_000, true)}`}
            </span>
          </span>
        ) : null}
      </div>
      {bare ? null : (
        <div className="chart__axis" aria-hidden>
          {bars.map((b, i) =>
            new Date(b.at).getHours() % 6 === 0 && i < n - 2 ? (
              <span key={b.at} style={{ left: `${((i + 0.5) / n) * 100}%` }}>
                {hourLabel(b.at)}
              </span>
            ) : null,
          )}
          <span className="chart__now">now</span>
        </div>
      )}
    </div>
  );
}
