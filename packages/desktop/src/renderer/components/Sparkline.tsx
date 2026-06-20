import { type JSX } from 'react';

interface SparklineProps {
  /** Series values, oldest first. */
  values: number[];
  height?: number;
}

const WIDTH = 300;
const PAD = 2;

/**
 * A flat column chart (engineering-report style): ink bars on a baseline, no
 * gradients or glow. Stretches to its container width via a non-uniform viewBox.
 */
export function Sparkline({ values, height = 40 }: SparklineProps): JSX.Element {
  const n = values.length;
  const max = values.reduce((m, x) => (x > m ? x : m), 0);

  if (n === 0 || max <= 0) {
    return <svg className="spark" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" />;
  }

  const slot = WIDTH / n;
  const gap = Math.min(slot * 0.28, 3);
  const barW = Math.max(slot - gap, 0.5);
  const usable = height - PAD;

  return (
    <svg className="spark" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
      {values.map((value, i) => {
        const h = usable * (Math.max(0, value) / max);
        const x = i * slot + gap / 2;
        return (
          <rect
            key={i}
            x={x.toFixed(1)}
            y={(height - h).toFixed(1)}
            width={barW.toFixed(1)}
            height={Math.max(h, value > 0 ? 1 : 0).toFixed(1)}
            fill="var(--accent)"
            opacity="0.55"
          />
        );
      })}
    </svg>
  );
}
