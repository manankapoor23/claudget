import chokidar, { type FSWatcher } from 'chokidar';
import type { Stats } from 'node:fs';
import type { Logger } from './logger';

export interface TranscriptWatcher {
  close(): Promise<void>;
}

export interface CoalescerOptions {
  /** Flush once no new event has arrived for this long (trailing edge). */
  quietMs: number;
  /**
   * Never hold a change longer than this, even while events keep coming. An
   * active Claude Code session appends a line every few hundred ms, so a pure
   * trailing debounce would never fire during exactly the session you watch.
   */
  maxWaitMs: number;
  /**
   * After each flush, re-deliver the same paths once this much later if no new
   * event arrived for them. Chokidar 3 drops a `change` that lands within 50ms
   * of the previous one for the same file and never emits it afterwards, so
   * the last line of a fast burst can arrive with no event of its own. One
   * cheap confirmation read after the burst picks it up. 0 disables.
   */
  confirmMs: number;
}

export interface PathCoalescer {
  add(path: string): void;
  close(): void;
}

/**
 * Collects changed paths and hands them over in batches: `quietMs` after the
 * last event, or `maxWaitMs` after the first one, whichever comes first.
 */
export function createPathCoalescer(
  opts: CoalescerOptions,
  onFlush: (paths: string[]) => void,
): PathCoalescer {
  const pending = new Set<string>();
  let firstAt: number | null = null;
  let timer: NodeJS.Timeout | null = null;
  let confirm: { paths: Set<string>; timer: NodeJS.Timeout } | null = null;

  const deliver = (paths: string[]): void => {
    if (paths.length > 0) onFlush(paths);
  };

  const flush = (): void => {
    timer = null;
    firstAt = null;
    const paths = [...pending];
    pending.clear();
    if (paths.length === 0) return;
    if (opts.confirmMs > 0) {
      const due = new Set([...(confirm?.paths ?? []), ...paths]);
      if (confirm) clearTimeout(confirm.timer);
      confirm = {
        paths: due,
        timer: setTimeout(() => {
          const recheck = [...due].filter((p) => !pending.has(p));
          confirm = null;
          deliver(recheck);
        }, opts.confirmMs),
      };
    }
    deliver(paths);
  };

  return {
    add(p) {
      const now = Date.now();
      pending.add(p);
      firstAt ??= now;
      if (timer) clearTimeout(timer);
      const untilMaxWait = firstAt + opts.maxWaitMs - now;
      timer = setTimeout(flush, Math.max(0, Math.min(opts.quietMs, untilMaxWait)));
    },
    close() {
      if (timer) clearTimeout(timer);
      if (confirm) clearTimeout(confirm.timer);
      timer = null;
      confirm = null;
      pending.clear();
    },
  };
}

export interface WatchOptions extends CoalescerOptions {
  logger: Logger;
}

/**
 * Watches the projects directory for transcript changes and reports the set of
 * changed `.jsonl` paths through a {@link createPathCoalescer} batcher.
 */
export function watchTranscripts(
  projectsDir: string,
  onChange: (changedPaths: string[]) => void,
  opts: WatchOptions,
): TranscriptWatcher {
  const coalescer = createPathCoalescer(opts, (paths) => {
    try {
      onChange(paths);
    } catch (err) {
      opts.logger.error('watch onChange handler threw', err);
    }
  });

  const schedule = (p: string): void => {
    if (p.endsWith('.jsonl')) coalescer.add(p);
  };

  const watcher: FSWatcher = chokidar.watch(projectsDir, {
    ignoreInitial: true,
    persistent: true,
    // Native events everywhere (FSEvents on macOS). Polling stat()ed every
    // transcript every 100ms — ~4% of a core at idle on a 180-file history —
    // and measured no faster: FSEvents delivers an append in ~30ms here. The
    // burst-tail event chokidar can swallow is covered by `confirmMs`.
    usePolling: false,
    // No awaitWriteFinish: it waits for a file to go quiet, and an active
    // transcript never does — it suppressed every event for the whole session.
    // Torn trailing lines are held back by TranscriptStore until they complete.
    // Ignore non-jsonl files but never ignore directories (they must be traversed).
    ignored: (p: string, stats?: Stats) => Boolean(stats?.isFile() && !p.endsWith('.jsonl')),
  });

  watcher
    .on('add', schedule)
    .on('change', schedule)
    .on('unlink', schedule)
    .on('error', (err) => opts.logger.error('watcher error', err));

  return {
    async close() {
      coalescer.close();
      await watcher.close();
    },
  };
}
