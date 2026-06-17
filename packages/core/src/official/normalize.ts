import type { OfficialWindow } from '../types';

/**
 * The exact shape of `api.anthropic.com/api/oauth/usage` is undocumented and may
 * change. Rather than hard-code one shape, this normaliser scans the payload for
 * any objects that look like a rate-limit window (a utilisation-ish number plus
 * an optional reset time) and maps the ones it recognises. Unknown shapes simply
 * yield fewer windows instead of crashing.
 */

const KEY_LABELS: Record<string, string> = {
  five_hour: '5-Hour',
  five_hourly: '5-Hour',
  fivehour: '5-Hour',
  session: 'Session (5h)',
  seven_day: 'Weekly',
  sevenday: 'Weekly',
  weekly: 'Weekly',
  week: 'Weekly',
  seven_day_opus: 'Weekly · Opus',
  opus_weekly: 'Weekly · Opus',
  seven_day_oauth_apps: 'Weekly · Apps',
  monthly: 'Monthly',
  daily: 'Daily',
  day: 'Daily',
};

const KEY_ORDER = [
  'five_hour',
  'five_hourly',
  'fivehour',
  'session',
  'seven_day',
  'weekly',
  'week',
  'seven_day_opus',
  'opus_weekly',
  'seven_day_oauth_apps',
  'monthly',
  'daily',
  'day',
];

function labelFor(key: string): string {
  const k = key.toLowerCase();
  const known = KEY_LABELS[k];
  if (known) return known;
  const words = k
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(' ') : key;
}

function orderIndex(key: string): number {
  const i = KEY_ORDER.indexOf(key.toLowerCase());
  return i === -1 ? KEY_ORDER.length : i;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

const RESET_KEYS = [
  'resets_at',
  'reset_at',
  'resetsAt',
  'resetAt',
  'resets',
  'reset',
  'next_reset',
  'nextReset',
];
const RESET_IN_KEYS = ['resets_in_seconds', 'reset_in_seconds', 'seconds_until_reset', 'resets_in'];

function pickReset(obj: Record<string, unknown>, now: number): number | null {
  for (const k of RESET_KEYS) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string' && v.trim() !== '') {
      const parsed = Date.parse(v);
      if (Number.isFinite(parsed)) return parsed;
      const n = Number(v);
      if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
    }
  }
  const secs = pickNumber(obj, RESET_IN_KEYS);
  if (secs != null) return now + secs * 1000;
  return null;
}

function toWindow(key: string, obj: Record<string, unknown>, now: number): OfficialWindow | null {
  let utilization = pickNumber(obj, [
    'utilization',
    'utilization_pct',
    'percent_used',
    'used_pct',
    'usage',
    'usage_pct',
    'percentage',
  ]);
  const used = pickNumber(obj, ['used', 'used_tokens', 'consumed', 'count']);
  const limit = pickNumber(obj, ['limit', 'max', 'quota', 'cap', 'total']);

  if (utilization == null && used != null && limit && limit > 0) utilization = used / limit;
  if (utilization == null) return null;
  if (utilization > 1.0001) utilization = utilization / 100; // percent → fraction
  utilization = Math.max(0, Math.min(1, utilization));

  const usedPct = utilization * 100;
  return {
    key,
    label: labelFor(key),
    utilization,
    usedPct,
    remainingPct: 100 - usedPct,
    resetsAt: pickReset(obj, now),
    used,
    limit,
  };
}

export function normalizeOfficialPayload(payload: unknown, now: number): OfficialWindow[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const windows: OfficialWindow[] = [];

  // Shape A: arrays of limit objects.
  const arrayCandidates: unknown[] = [
    root['limits'],
    root['windows'],
    root['rate_limits'],
    Array.isArray(payload) ? payload : null,
  ];
  for (const arr of arrayCandidates) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const key = String(o['type'] ?? o['name'] ?? o['key'] ?? o['window'] ?? 'window');
        const w = toWindow(key, o, now);
        if (w) windows.push(w);
      }
    }
  }

  // Shape B: keyed objects on the root or inside a container.
  const containers: Record<string, unknown>[] = [root];
  for (const ck of ['usage', 'rate_limit', 'rate_limits', 'limits']) {
    const c = root[ck];
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      containers.push(c as Record<string, unknown>);
    }
  }
  for (const container of containers) {
    for (const [key, value] of Object.entries(container)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const w = toWindow(key, value as Record<string, unknown>, now);
        if (w) windows.push(w);
      }
    }
  }

  // De-duplicate by key, keeping the highest utilisation (most conservative).
  const byKey = new Map<string, OfficialWindow>();
  for (const w of windows) {
    const prev = byKey.get(w.key);
    if (!prev || w.utilization > prev.utilization) byKey.set(w.key, w);
  }
  return [...byKey.values()].sort((a, b) => orderIndex(a.key) - orderIndex(b.key));
}
