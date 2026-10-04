// Public API for @claude-widget/core.

export * from './types';
export { UsageEngine, type UsageEngineOptions } from './engine';

// Configuration
export {
  WIDGET_CONFIG_SCHEMA,
  DEFAULT_CONFIG,
  resolveConfig,
  mergeConfig,
  type WidgetConfig,
  type WidgetConfigPatch,
} from './config';

// Logging
export {
  createLogger,
  createNoopLogger,
  consoleSink,
  type Logger,
  type LogLevel,
  type LogRecord,
  type LogSink,
  type LoggerOptions,
} from './logger';

// Paths & credentials
export {
  resolveClaudeDir,
  claudePaths,
  claudeDirExists,
  prettifyProjectSlug,
  type ClaudePaths,
} from './paths';
export {
  lookupCredentials,
  readCredentials,
  redactCredentials,
  type ClaudeCredentials,
  type CredentialsLookup,
  type CredentialsProblem,
  type KeychainRead,
  type LookupOptions,
  type RedactedCredentials,
} from './credentials';

// Pricing
export {
  estimateCost,
  lookupPricing,
  modelLabel,
  normalizeModelId,
  DEFAULT_PRICING,
  PRICING_NOTE,
  type PricingTable,
  type ModelPricing,
  type CostResult,
} from './pricing';

// Lower-level building blocks (handy for tests and future surfaces)
export {
  parseTranscriptLine,
  parseTranscriptContent,
  createTranscriptParser,
  type ParseContext,
  type TranscriptParser,
} from './parse';
export { TranscriptStore, type TranscriptRef } from './transcript-store';
export { discoverTranscripts, type TranscriptFile } from './discover';
export { buildLocalUsage, emptyTokens, type AggregateOptions } from './aggregate';
export {
  watchTranscripts,
  createPathCoalescer,
  type CoalescerOptions,
  type PathCoalescer,
  type TranscriptWatcher,
  type WatchOptions,
} from './watch';
export {
  OfficialUsageClient,
  OfficialPollScheduler,
  OFFICIAL_ACTIVITY_SETTLE_MS,
  OFFICIAL_MIN_GAP_MS,
  normalizeOfficialPayload,
  type OfficialClientOptions,
  type PollReason,
  type PollSchedulerOptions,
} from './official';
