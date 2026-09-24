import { formatDurationShort } from '../../shared/duration';

export { formatDurationShort };

/** Compact token count: 12.3M, 4.5k, 999. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat().format(Math.round(n));
}

export function formatUSD(n: number, currency = 'USD'): string {
  // Cents or nothing: "$61.7" reads as a typo, not a price.
  const maximumFractionDigits = Math.abs(n) < 1000 ? 2 : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: maximumFractionDigits,
      maximumFractionDigits,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function formatPct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

/** Countdown: "hh:mm:ss" under a day, "2d 3h" beyond, "now" at/under zero. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s >= 86400) return formatDurationShort(ms);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatRelative(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 1000) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * A reset moment as people say it: "4:26 PM" today, "Thu 4:26 PM" this week,
 * "Oct 3, 4:26 PM" beyond that.
 */
export function formatResetAt(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const time = formatClock(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return time;
  if (ts - now < 6 * 24 * 60 * 60 * 1000) {
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
