import { useId, type JSX } from 'react';

interface SparklineProps {
  /** Series values, oldest first. */
  values: number[];
  height?: number;
}

const WIDTH = 300;
const PAD = 2;

/** A lightweight area + line sparkline that stretches to its container width. */
export function Sparkline({ values, height = 40 }: SparklineProps): JSX.Element {
  const gradientId = useId();
  const n = values.length;
  const max = values.reduce((m, x) => (x > m ? x : m), 0);

  if (n === 0 || max <= 0) {
    return (
      <svg className="spark" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
        <line
          x1="0"
          y1={height - 1}
          x2={WIDTH}
          y2={height - 1}
          stroke="var(--track)"
          strokeWidth="2"
        />
      </svg>
    );
  }

  const usable = height - PAD * 2;
  const points = values.map((value, i) => {
    const x = n > 1 ? (i / (n - 1)) * WIDTH : WIDTH / 2;
    const y = PAD + usable * (1 - Math.max(0, value) / max);
    return { x, y };
  });

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return <svg className="spark" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" />;
  }

  const fmt = (p: { x: number; y: number }): string => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p)}`).join(' ');
  const areaPath = `M${first.x.toFixed(1)},${height} ${points
    .map((p) => `L${fmt(p)}`)
    .join(' ')} L${last.x.toFixed(1)},${height} Z`;

  return (
    <svg className="spark" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent-2)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
