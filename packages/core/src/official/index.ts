export { OfficialUsageClient, type OfficialClientOptions } from './client';
export {
  OfficialPollScheduler,
  OFFICIAL_ACTIVITY_SETTLE_MS,
  OFFICIAL_MIN_GAP_MS,
  type PollReason,
  type PollSchedulerOptions,
} from './schedule';
export { normalizeOfficialPayload } from './normalize';
export { detectClaudeSetup, installCommandFor, type ClaudeSetup, type SetupProbe } from './setup';
