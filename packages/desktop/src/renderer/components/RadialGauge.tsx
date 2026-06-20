import { type JSX, type ReactNode } from 'react';

interface RadialGaugeProps {
  /** 0..1 consumed fraction. */
  value: number;
  size?: number;
  label: ReactNode;
  sub?: ReactNode;
}

const SWEEP_DEG = 270;

export function RadialGauge({ value, size = 96, label, sub }: RadialGaugeProps): JSX.Element {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * (SWEEP_DEG / 360);
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const rotate = `rotate(135 ${center} ${center})`;

  return (
    <div className="gauge" style={{ width: size }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          {/* Flat engineering dial: ink track, orange fill, butt caps, no glow. */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--paper-3)"
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={`${arc} ${circumference}`}
            transform={rotate}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--orange)"
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={`${arc * v} ${circumference}`}
            transform={rotate}
            style={{ transition: 'stroke-dasharray 0.3s linear' }}
          />
        </svg>
        <div className="gauge__center" style={{ height: size }}>
          <div className="gauge__pct">
            {Math.round(v * 100)}
            <small>%</small>
          </div>
        </div>
      </div>
      <div className="gauge__label">{label}</div>
      {sub != null ? <div className="gauge__sub">{sub}</div> : null}
    </div>
  );
}
