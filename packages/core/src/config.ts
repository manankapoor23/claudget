import { z } from 'zod';

/**
 * The single configuration schema for the whole app. The core consumes the data
 * fields; the desktop shell additionally consumes the UI/window fields. Keeping
 * one schema gives us one source of truth and one validation path.
 *
 * The official poll interval floor is 180s because the upstream endpoint is
 * aggressively rate-limited; the default leaves comfortable headroom.
 */
export const WIDGET_CONFIG_SCHEMA = z.object({
  // ── Data ─────────────────────────────────────────────────────────────────
  /**
   * Poll the official OAuth usage endpoint for plan limits — this drives the
   * 5-hour / weekly usage-% gauges. On by default: it works with zero setup
   * using the token Claude Code already stored (macOS Keychain or
   * `~/.claude/.credentials.json`). Turn it off in Settings to go 100% local.
   */
  enableOfficial: z.boolean().default(true),
  /** Milliseconds between official polls. Hard floor of 180s. */
  officialPollIntervalMs: z.number().int().min(180_000).max(3_600_000).default(300_000),
  /** Debounce for coalescing transcript file-change events. */
  localDebounceMs: z.number().int().min(200).max(10_000).default(1_000),
  /** Periodic full rescan to catch new projects / missed FS events. */
  fullRescanIntervalMs: z.number().int().min(10_000).max(3_600_000).default(120_000),
  /** Max number of recent sessions to surface. */
  recentSessionLimit: z.number().int().min(1).max(100).default(8),
  /** Sparkline / rolling-window span in hours. */
  historyWindowHours: z.number().int().min(1).max(168).default(24),
  /** Length of a usage "block" in hours (Claude's session window is ~5h). */
  blockHours: z.number().min(1).max(24).default(5),
  /** ISO 4217 currency code used for display. */
  currency: z.string().min(3).max(3).default('USD'),
  /** Override the `~/.claude` directory. null = auto-detect. */
  claudeDir: z.string().nullable().default(null),
  /** Path to a JSON pricing override file. null = bundled defaults. */
  pricingOverridePath: z.string().nullable().default(null),
  /** Daily spend budget in USD. null/0 = off. Drives the budget panel & alerts. */
  dailyBudgetUSD: z.number().min(0).nullable().default(null),
  /** Monthly spend budget in USD. null/0 = off. */
  monthlyBudgetUSD: z.number().min(0).nullable().default(null),

  // ── UI / Window (consumed by the desktop shell) ───────────────────────────
  theme: z.enum(['system', 'dark', 'light']).default('system'),
  alwaysOnTop: z.boolean().default(true),
  clickThrough: z.boolean().default(false),
  compact: z.boolean().default(false),
  opacity: z.number().min(0.3).max(1).default(1),
  showInTaskbar: z.boolean().default(true),
  launchOnLogin: z.boolean().default(false),

  // ── Logging ───────────────────────────────────────────────────────────────
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type WidgetConfig = z.infer<typeof WIDGET_CONFIG_SCHEMA>;

export const DEFAULT_CONFIG: WidgetConfig = WIDGET_CONFIG_SCHEMA.parse({});

const PARTIAL_SCHEMA = WIDGET_CONFIG_SCHEMA.partial();
export type WidgetConfigPatch = Partial<WidgetConfig>;

/**
 * Validates arbitrary input into a complete config. Invalid individual fields
 * fall back to their default instead of throwing the whole config away, so a
 * single bad value in a hand-edited file can never brick the widget.
 */
export function resolveConfig(input?: unknown): WidgetConfig {
  if (input == null) return { ...DEFAULT_CONFIG };

  const whole = PARTIAL_SCHEMA.safeParse(input);
  if (whole.success) {
    return { ...DEFAULT_CONFIG, ...whole.data };
  }

  // Field-by-field salvage of whatever is valid.
  const obj = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const salvaged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const single = PARTIAL_SCHEMA.safeParse({ [key]: value });
    if (single.success) Object.assign(salvaged, single.data);
  }
  return { ...DEFAULT_CONFIG, ...salvaged };
}

/** Merges a validated patch over an existing config. */
export function mergeConfig(base: WidgetConfig, patch: unknown): WidgetConfig {
  const parsed = PARTIAL_SCHEMA.safeParse(patch);
  const safe = parsed.success ? parsed.data : {};
  return { ...base, ...safe };
}
