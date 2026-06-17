export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface LogRecord {
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: unknown;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
  /** Returns a logger whose scope is `parent:child`, sharing sinks and level. */
  child(scope: string): Logger;
  setLevel(level: LogLevel): void;
  readonly level: LogLevel;
}

/** Writes a human-readable line to the console. */
export const consoleSink: LogSink = (r) => {
  const time = new Date(r.ts).toISOString();
  const line = `[${time}] ${r.level.toUpperCase().padEnd(5)} ${r.scope ? `(${r.scope}) ` : ''}${r.message}`;
  if (r.level === 'error') console.error(r.meta === undefined ? line : `${line}`, r.meta ?? '');
  else if (r.level === 'warn') console.warn(line, r.meta ?? '');
  else console.log(line, r.meta ?? '');
};

interface SharedState {
  level: LogLevel;
}

function makeLogger(state: SharedState, sinks: LogSink[], scope: string): Logger {
  function emit(level: LogLevel, message: string, meta?: unknown): void {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[state.level]) return;
    const record: LogRecord = { ts: Date.now(), level, scope, message };
    if (meta !== undefined) record.meta = meta;
    for (const sink of sinks) {
      try {
        sink(record);
      } catch {
        // A logging sink must never crash the app.
      }
    }
  }

  return {
    get level() {
      return state.level;
    },
    setLevel(level) {
      state.level = level;
    },
    error: (m, meta) => emit('error', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    info: (m, meta) => emit('info', m, meta),
    debug: (m, meta) => emit('debug', m, meta),
    child(childScope) {
      const merged = scope ? `${scope}:${childScope}` : childScope;
      return makeLogger(state, sinks, merged);
    },
  };
}

export interface LoggerOptions {
  level?: LogLevel;
  scope?: string;
  /** Defaults to `[consoleSink]`. */
  sinks?: LogSink[];
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const state: SharedState = { level: options.level ?? 'info' };
  const sinks = options.sinks && options.sinks.length > 0 ? options.sinks : [consoleSink];
  return makeLogger(state, sinks, options.scope ?? '');
}

/** A logger that discards everything (useful in tests). */
export function createNoopLogger(): Logger {
  return makeLogger({ level: 'error' }, [() => {}], '');
}
