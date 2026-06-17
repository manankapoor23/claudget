import chokidar, { type FSWatcher } from 'chokidar';
import type { Stats } from 'node:fs';
import type { Logger } from './logger';

export interface TranscriptWatcher {
  close(): Promise<void>;
}

export interface WatchOptions {
  debounceMs: number;
  logger: Logger;
}

/**
 * Watches the projects directory for transcript changes, coalescing rapid bursts
 * into a single debounced callback carrying the set of changed paths.
 */
export function watchTranscripts(
  projectsDir: string,
  onChange: (changedPaths: string[]) => void,
  opts: WatchOptions,
): TranscriptWatcher {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const paths = [...pending];
    pending.clear();
    try {
      onChange(paths);
    } catch (err) {
      opts.logger.error('watch onChange handler threw', err);
    }
  };

  const schedule = (p: string): void => {
    if (!p.endsWith('.jsonl')) return;
    pending.add(p);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, opts.debounceMs);
  };

  const watcher: FSWatcher = chokidar.watch(projectsDir, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
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
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await watcher.close();
    },
  };
}
