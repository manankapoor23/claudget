import type { UsageEntry } from '../types';

/**
 * A read-only source of usage besides Claude Code's own transcripts, such as
 * another coding agent's local history. Each provider is opt-in and off by
 * default; the engine never constructs one the user hasn't enabled, so a
 * disabled provider reads nothing at all.
 *
 * The engine owns scheduling: it calls `sync(false)` on its own timer (never
 * per snapshot) and `sync(true)` occasionally so rows deleted at the source
 * drop out. A provider does its reading off the main thread.
 */
export interface UsageProvider {
  /** Stable id, also stamped on each entry as {@link UsageEntry.source}. */
  readonly id: string;
  /**
   * Reads what changed since the last sync, or everything when `full`.
   * Resolves true when {@link entries} changed. Never rejects: failures are
   * logged once and leave the previous entries in place.
   */
  sync(full: boolean): Promise<boolean>;
  /** The current entries, keyed uniquely across providers. */
  entries(): readonly UsageEntry[];
  /** Stops any background work. The provider is unusable afterwards. */
  close(): Promise<void>;
}
