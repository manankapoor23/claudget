import { type JSX } from 'react';

interface SparklineProps {
  /** Series values, oldest first. */
  values: number[];
  height?: number;
  interactive?: boolean;
}

const WIDTH = 300;
const PAD = 2;

/**
 * A column chart: one bar per slot on a baseline, with empty slots left as
 * faint 1px ticks. Stretches to its container width via a non-uniform viewBox.
 */
export function Sparkline({
  values,
  height = 40,
  interactive = false,
}: SparklineProps): JSX.Element {
  const n = values.length;
  const max = values.reduce((m, x) => (x > m ? x : m), 0);

  if (n === 0 || max <= 0) {
    return (
      <svg
        className={interactive ? 'spark spark--interactive' : 'spark'}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
      />
    );
  }

  const slot = WIDTH / n;
  const gap = Math.min(slot * 0.25, 3);
  const barW = Math.max(slot - gap, 0.5);
  const usable = height - PAD;

  return (
    <svg
      className={interactive ? 'spark spark--interactive' : 'spark'}
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      role={interactive ? 'img' : undefined}
      aria-label={interactive ? 'Usage activity chart. Hover a bar for its value.' : undefined}
    >
      {values.map((value, i) => {
        const h = usable * (Math.max(0, value) / max);
        const x = i * slot + gap / 2;
        return (
          <rect
            key={i}
            x={x.toFixed(1)}
            y={(height - h).toFixed(1)}
            width={barW.toFixed(1)}
            height={Math.max(h, 1).toFixed(1)}
            fill="var(--spark, var(--accent))"
            opacity={value > 0 ? 0.9 : 0.25}
          >
            {interactive ? <title>{value.toLocaleString()}</title> : null}
          </rect>
        );
      })}
    </svg>
  );
}
