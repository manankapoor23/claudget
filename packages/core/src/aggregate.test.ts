import { describe, expect, it } from 'vitest';
import { buildLocalUsage, type AggregateOptions } from './aggregate';
import { DEFAULT_PRICING } from './pricing';
import type { UsageEntry } from './types';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-06-17T12:00:00.000Z');

function entry(over: Partial<UsageEntry> & { timestamp: number }): UsageEntry {
  return {
    key: over.key ?? `k${over.timestamp}`,
    timestamp: over.timestamp,
    model: over.model ?? 'claude-sonnet-4-6',
    tokens: over.tokens ?? { input: 10, output: 20, cacheCreation: 0, cacheRead: 0, total: 30 },
    sessionId: over.sessionId ?? 'sess',
    projectPath: over.projectPath ?? 'p',
    projectSlug: over.projectSlug ?? 'p',
    isSidechain: false,
    requestId: 'r',
    messageId: 'm',
  };
}

const opts: AggregateOptions = {
  pricing: DEFAULT_PRICING,
  now: NOW,
  historyWindowHours: 24,
  blockHours: 5,
  recentSessionLimit: 8,
  activeSessions: [],
  stats: { files: 1, scanDurationMs: 0 },
};

describe('buildLocalUsage', () => {
  it('aggregates all-time totals and counts', () => {
    const u = buildLocalUsage(
      [entry({ timestamp: NOW - HOUR }), entry({ timestamp: NOW - 2 * HOUR })],
      opts,
    );
    expect(u.allTime.count).toBe(2);
    expect(u.allTime.tokens.total).toBe(60);
    expect(u.stats.entries).toBe(2);
  });

  it('splits into separate blocks when the window elapses', () => {
    const u = buildLocalUsage(
      [entry({ timestamp: NOW - 10 * HOUR }), entry({ timestamp: NOW - HOUR })],
      opts,
    );
    expect(u.blocks.length).toBe(2);
  });

  it('computes an active block with positive remaining time', () => {
    const u = buildLocalUsage([entry({ timestamp: NOW - 30 * 60_000 })], opts);
    expect(u.activeBlock).not.toBeNull();
    expect(u.activeBlock?.remainingMs).toBeGreaterThan(0);
    expect(u.activeBlock?.tokensPerMinute).toBeGreaterThan(0);
  });

  it('fills hourly buckets across the whole window', () => {
    const u = buildLocalUsage([entry({ timestamp: NOW - HOUR })], opts);
    expect(u.hourly.length).toBe(25); // 24h + current hour, inclusive
  });

  it('groups per model and per session', () => {
    const u = buildLocalUsage(
      [
        entry({ timestamp: NOW - HOUR, model: 'claude-opus-4-8', sessionId: 'a' }),
        entry({ timestamp: NOW - 2 * HOUR, model: 'claude-sonnet-4-6', sessionId: 'b' }),
      ],
      opts,
    );
    expect(u.perModel.length).toBe(2);
    expect(u.sessions.length).toBe(2);
    expect(u.sessions[0]?.sessionId).toBe('a'); // newest first
  });

  it('groups per project sorted by cost desc', () => {
    // Opus is pricier than Sonnet, so the opus-heavy project should rank first
    // even though both projects log the same token counts.
    const big = { input: 100, output: 200, cacheCreation: 0, cacheRead: 0, total: 300 };
    const u = buildLocalUsage(
      [
        entry({ timestamp: NOW - HOUR, model: 'claude-sonnet-4-6', projectSlug: 'cheap', tokens: big }),
        entry({ timestamp: NOW - 2 * HOUR, model: 'claude-opus-4-8', projectSlug: 'pricey', tokens: big }),
      ],
      opts,
    );
    expect(u.perProject.length).toBe(2);
    expect(u.perProject[0]?.projectSlug).toBe('pricey');
    expect(u.perProject[0]!.costUSD).toBeGreaterThan(u.perProject[1]!.costUSD);
  });

  it('sums this-month totals (current calendar month only)', () => {
    const monthStart = new Date(NOW);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const lastMonth = monthStart.getTime() - HOUR; // just before the month boundary
    const u = buildLocalUsage(
      [entry({ timestamp: NOW - HOUR }), entry({ timestamp: lastMonth })],
      opts,
    );
    expect(u.thisMonth.count).toBe(1);
    expect(u.thisMonth.tokens.total).toBe(30);
    expect(u.allTime.count).toBe(2);
  });
});
