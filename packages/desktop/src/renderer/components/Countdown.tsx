import { useEffect, useState, type JSX } from 'react';
import { formatCountdown, formatDurationShort } from '../lib/format';

interface CountdownProps {
  /** Epoch ms target, or null when unknown. */
  resetsAt: number | null;
  prefix?: string;
  /** Rendered when `resetsAt` is null. */
  fallback?: string;
  /** "1h 59m" instead of a ticking "01:59:59" — calmer for glanceable UI. */
  short?: boolean;
}

/** Live "time until reset" that ticks once a second. */
export function Countdown({
  resetsAt,
  prefix,
  fallback = '—',
  short = false,
}: CountdownProps): JSX.Element {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (resetsAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resetsAt]);

  if (resetsAt === null) return <>{fallback}</>;

  return (
    <>
      {prefix ? `${prefix} ` : ''}
      {short ? formatDurationShort(resetsAt - now) : formatCountdown(resetsAt - now)}
    </>
  );
}
