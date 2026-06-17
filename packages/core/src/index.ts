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
  readCredentials,
  redactCredentials,
  type ClaudeCredentials,
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
export { parseTranscriptLine, parseTranscriptContent, type ParseContext } from './parse';
export { discoverTranscripts, type TranscriptFile } from './discover';
export { buildLocalUsage, emptyTokens, type AggregateOptions } from './aggregate';
export { watchTranscripts, type TranscriptWatcher, type WatchOptions } from './watch';
export {
  OfficialUsageClient,
  normalizeOfficialPayload,
  type OfficialClientOptions,
} from './official';
