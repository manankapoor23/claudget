import type { JSX, ReactNode } from 'react';

type Tone = 'default' | 'good' | 'warn' | 'bad';

interface ProgressBarProps {
  /** 0..1 fraction filled. Values outside the range are clamped. */
  value: number;
  left?: ReactNode;
  right?: ReactNode;
  metaLeft?: ReactNode;
  metaRight?: ReactNode;
  /** Fill colour. Defaults to the brand gradient. */
  tone?: Tone;
}

const TONE_FILL: Record<Tone, string> = {
  default: 'var(--orange)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

export function ProgressBar({
  value,
  left,
  right,
  metaLeft,
  metaRight,
  tone = 'default',
}: ProgressBarProps): JSX.Element {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const hasRow = left != null || right != null;
  const hasMeta = metaLeft != null || metaRight != null;

  return (
    <div className="bar">
      {hasRow ? (
        <div className="bar__row">
          <span>{left}</span>
          <b>{right}</b>
        </div>
      ) : null}
      <div className="bar__track">
        <div className="bar__fill" style={{ width: `${v * 100}%`, background: TONE_FILL[tone] }} />
      </div>
      {hasMeta ? (
        <div className="bar__meta">
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </div>
      ) : null}
    </div>
  );
}
