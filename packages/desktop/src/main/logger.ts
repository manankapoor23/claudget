import fs from 'node:fs';
import path from 'node:path';
import {
  consoleSink,
  createLogger,
  type Logger,
  type LogLevel,
  type LogRecord,
} from '@claude-widget/core';

const MAX_LOG_BYTES = 2_000_000;

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Builds the application logger: writes to both the console and a rotating log
 * file. The access token is never passed to the logger, so it cannot leak here.
 */
export function createAppLogger(
  logDir: string,
  level: LogLevel,
): { logger: Logger; logFilePath: string } {
  fs.mkdirSync(logDir, { recursive: true });
  const logFilePath = path.join(logDir, 'claude-widget.log');

  try {
    const st = fs.statSync(logFilePath);
    if (st.size > MAX_LOG_BYTES) fs.renameSync(logFilePath, `${logFilePath}.1`);
  } catch {
    // No existing log file — nothing to rotate.
  }

  const stream = fs.createWriteStream(logFilePath, { flags: 'a' });
  const fileSink = (r: LogRecord): void => {
    const meta = r.meta === undefined ? '' : ` ${safeStringify(r.meta)}`;
    stream.write(
      `[${new Date(r.ts).toISOString()}] ${r.level.toUpperCase().padEnd(5)} (${r.scope}) ${r.message}${meta}\n`,
    );
  };

  const logger = createLogger({ level, sinks: [consoleSink, fileSink] });
  return { logger, logFilePath };
}
