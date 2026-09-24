import fs from 'node:fs';
import type { Logger, UsageSnapshot } from '@claude-widget/core';
import { EMPTY_HISTORY, parseHistory, recordWindows, type LimitHistory } from '../shared/history';

/**
 * Persists how each plan-limit window went — its peak and whether it hit 100%
 * — so "how close did I come this week?" has an answer the endpoint alone
 * can't give (it only ever reports the current window).
 */
export class LimitHistoryStore {
  private history: LimitHistory;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {
    this.history = this.load();
  }

  get(): LimitHistory {
    return this.history;
  }

  /** Folds in a snapshot; returns the history if it changed, else null. */
  record(snapshot: UsageSnapshot): LimitHistory | null {
    const { official } = snapshot;
    // Cached (stale) data repeats old numbers; only record fresh readings.
    if (!official.available || official.stale) return null;
    const next = recordWindows(this.history, official.windows, snapshot.generatedAt);
    if (next === this.history) return null;
    this.history = next;
    this.scheduleSave();
    return next;
  }

  private load(): LimitHistory {
    try {
      return parseHistory(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch {
      return EMPTY_HISTORY;
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(this.filePath, JSON.stringify(this.history), 'utf8');
      } catch (err) {
        this.logger.warn('Could not persist limit history', { err: String(err) });
      }
    }, 1000);
  }
}
