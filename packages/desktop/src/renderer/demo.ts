import type {
  ActiveBlockStat,
  ActiveSession,
  LocalUsage,
  ModelBreakdown,
  ProjectBreakdown,
  SessionStat,
  TimeBucket,
  TokenAndCost,
  TokenCounts,
} from '@claude-widget/core';
import type { AppInfo, LimitHistory, UsageSnapshot, WidgetConfig } from '@shared/ipc';

function tokenCounts(total: number): TokenCounts {
  const input = Math.round(total * 0.54);
  const output = Math.round(total * 0.17);
  const cacheRead = Math.round(total * 0.25);
  return { input, output, cacheCreation: total - input - output - cacheRead, cacheRead, total };
}

function bucket(startAt: number, total: number, count: number): TimeBucket {
  return { startAt, tokens: tokenCounts(total), costUSD: total / 1_000_000, count };
}

function aggregate(total: number, costUSD: number, count: number): TokenAndCost {
  return { tokens: tokenCounts(total), costUSD, count };
}

function session(
  id: string,
  projectPath: string,
  title: string,
  branch: string,
  lastAt: number,
  total: number,
  costUSD: number,
  count: number,
): SessionStat {
  return {
    ...aggregate(total, costUSD, count),
    sessionId: id,
    projectPath,
    projectSlug: projectPath.split('/').pop() ?? projectPath,
    sessionTitle: title,
    gitBranch: branch,
    firstAt: lastAt - 90 * 60_000,
    lastAt,
  };
}

export function createDemoData(): {
  snapshot: UsageSnapshot;
  config: WidgetConfig;
  appInfo: AppInfo;
  history: LimitHistory;
} {
  const now = Date.now();
  const activeStart = now - 92 * 60_000;
  const activeEnd = now + 3 * 60 * 60_000;
  const activeBlock: ActiveBlockStat = {
    ...aggregate(18_400_000, 42.8, 48),
    startAt: activeStart,
    endAt: activeEnd,
    lastActivityAt: now - 4_000,
    isActive: true,
    elapsedMs: now - activeStart,
    remainingMs: activeEnd - now,
    tokensPerMinute: 198_000,
    projectedTokens: 54_000_000,
    projectedCostUSD: 116.4,
  };

  const sessions = [
    session(
      'demo-1',
      '/Users/demo/claudget',
      'Polish the usage dashboard',
      'ui/overview',
      now - 4_000,
      18_400_000,
      42.8,
      48,
    ),
    session(
      'demo-2',
      '/Users/demo/atlas',
      'Add streaming responses',
      'feat/streaming',
      now - 74 * 60_000,
      4_800_000,
      12.4,
      16,
    ),
    session(
      'demo-3',
      '/Users/demo/pin2fit',
      'Review the onboarding flow',
      'main',
      now - 4 * 60 * 60_000,
      2_100_000,
      5.8,
      9,
    ),
    session(
      'demo-4',
      '/Users/demo/claudget',
      'Document privacy boundaries',
      'docs/privacy',
      now - 26 * 60 * 60_000,
      1_200_000,
      3.1,
      6,
    ),
  ];

  const perModel: ModelBreakdown[] = [
    { ...aggregate(16_900_000, 39.7, 36), model: 'claude-opus-4-8', label: 'Opus 4.8' },
    { ...aggregate(7_100_000, 18.2, 28), model: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { ...aggregate(2_500_000, 3.9, 15), model: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  ];
  const perProject: ProjectBreakdown[] = [
    {
      ...aggregate(20_300_000, 46.2, 54),
      projectPath: '/Users/demo/claudget',
      projectSlug: 'claudget',
    },
    { ...aggregate(7_900_000, 18.8, 31), projectPath: '/Users/demo/atlas', projectSlug: 'atlas' },
    {
      ...aggregate(2_900_000, 6.8, 18),
      projectPath: '/Users/demo/pin2fit',
      projectSlug: 'pin2fit',
    },
  ];
  const hourly = Array.from({ length: 24 }, (_, index) => {
    const wave = Math.max(0.2, Math.sin((index / 24) * Math.PI * 2 - 1) + 0.4);
    return bucket(
      now - (23 - index) * 60 * 60_000,
      Math.round(wave * 1_600_000),
      Math.round(wave * 4),
    );
  });
  const activeSessions: ActiveSession[] = [
    {
      pid: 4218,
      sessionId: 'demo-1',
      cwd: '/Users/demo/claudget',
      startedAt: activeStart,
      updatedAt: now,
      status: 'working',
      version: '1.0.0',
    },
  ];
  const local: LocalUsage = {
    allTime: aggregate(88_600_000, 214.3, 312),
    today: aggregate(26_100_000, 61.7, 89),
    thisMonth: aggregate(112_400_000, 286.4, 404),
    last24h: aggregate(31_100_000, 68.9, 104),
    perModel,
    perProject,
    sessions,
    blocks: [activeBlock],
    activeBlock,
    hourly,
    activeSessions,
    stats: { files: 42, entries: 1_286, scanDurationMs: 84 },
  };

  return {
    snapshot: {
      generatedAt: now,
      localUpdatedAt: now - 12_000,
      schemaVersion: 2,
      local,
      opencode: {
        status: 'available',
        allTime: {
          input: 1_200_000,
          output: 430_000,
          cacheRead: 280_000,
          cacheWrite: 40_000,
          total: 1_950_000,
          costUSD: 3.72,
          count: 26,
        },
        today: {
          input: 120_000,
          output: 43_000,
          cacheRead: 28_000,
          cacheWrite: 4_000,
          total: 195_000,
          costUSD: 0.37,
          count: 4,
        },
        models: [],
        granularity: 'request',
        message: null,
        updatedAt: now,
      },
      official: {
        status: 'ok',
        available: true,
        stale: false,
        fetchedAt: now - 42_000,
        nextFetchAt: now + 4 * 60_000,
        windows: [
          {
            key: 'five_hour',
            label: '5-hour',
            utilization: 0.62,
            usedPct: 62,
            remainingPct: 38,
            resetsAt: now + 2 * 60 * 60_000,
            used: 62,
            limit: 100,
          },
          {
            key: 'seven_day',
            label: 'Weekly',
            utilization: 0.31,
            usedPct: 31,
            remainingPct: 69,
            resetsAt: now + 3 * 24 * 60 * 60_000,
            used: 31,
            limit: 100,
          },
        ],
        message: null,
        fix: null,
        detail: null,
      },
      meta: {
        subscriptionType: 'Team',
        rateLimitTier: null,
        organizationUuid: null,
        claudeDir: '/Users/demo/.claude',
        cliVersion: '1.0.0',
      },
      health: { localOk: true, officialOk: true, lastLocalError: null, lastOfficialError: null },
    },
    config: {
      enableOfficial: true,
      enableOpenCode: true,
      officialPollIntervalMs: 300_000,
      localDebounceMs: 1_000,
      fullRescanIntervalMs: 120_000,
      recentSessionLimit: 8,
      historyWindowHours: 24,
      blockHours: 5,
      currency: 'USD',
      claudeDir: null,
      pricingOverridePath: null,
      dailyBudgetUSD: 100,
      monthlyBudgetUSD: 500,
      limitAlerts: true,
      limitAlertThresholds: [80, 95],
      theme: 'dark',
      alwaysOnTop: false,
      clickThrough: false,
      compact: false,
      miniBar: false,
      opacity: 1,
      showInTaskbar: true,
      launchOnLogin: false,
      logLevel: 'info',
    },
    history: demoHistory(now),
    appInfo: {
      appVersion: 'demo',
      cliVersion: '1.0.0',
      platform: 'demo',
      logFilePath: '/tmp/claudget-demo.log',
      configFilePath: '/tmp/claudget-demo.json',
      claudeDir: '/Users/demo/.claude',
      pricingNote: 'Demo data only',
      firstRun: new URLSearchParams(window.location.search).has('welcome'),
    },
  };
}

/** Six past weeks and a few days of 5-hour windows, with a couple of limit hits. */
function demoHistory(now: number): LimitHistory {
  const H = 3_600_000;
  const weekPeaks = [0.62, 0.81, 1, 0.74, 0.93, 1];
  const weekResets = weekPeaks.map((_, i) => now - (weekPeaks.length - i) * 7 * 24 * H + 18 * H);
  const weeks = weekPeaks.map((peak, i) => ({
    key: 'seven_day',
    label: 'Weekly',
    resetsAt: weekResets[i]!,
    peak,
    hitAt: peak >= 1 ? weekResets[i]! - 20 * H : null,
    firstSeenAt: weekResets[i]! - 7 * 24 * H,
    lastSeenAt: weekResets[i]! - H,
  }));
  const fivePeaks = [0.4, 0.72, 1, 0.3, 0.55, 0.9, 0.2, 0.66, 1, 0.48, 0.35, 0.8, 0.12, 0.6];
  const fives = fivePeaks.map((peak, i) => {
    const resetsAt = now - (fivePeaks.length - i) * 9 * H;
    return {
      key: 'five_hour',
      label: '5-hour',
      resetsAt,
      peak,
      hitAt: peak >= 1 ? resetsAt - 1.5 * H : null,
      firstSeenAt: resetsAt - 5 * H,
      lastSeenAt: resetsAt - 0.2 * H,
    };
  });
  return { version: 1, cycles: [...weeks, ...fives] };
}
