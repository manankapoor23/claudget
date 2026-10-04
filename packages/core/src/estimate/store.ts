import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../logger';
import { EMPTY_CALIBRATION, parseCalibration, type CalibrationState } from './calibration';

/** Where the engine keeps what it has learned about the limits, across restarts. */
export interface CalibrationStore {
  load(): CalibrationState;
  save(state: CalibrationState): void;
}

/** In memory only (tests, or when there's nowhere to write). */
export function memoryCalibrationStore(initial: CalibrationState = EMPTY_CALIBRATION): {
  load(): CalibrationState;
  save(state: CalibrationState): void;
  saved: () => CalibrationState;
} {
  let state = initial;
  return {
    load: () => state,
    save: (next) => {
      state = next;
    },
    saved: () => state,
  };
}

/**
 * A JSON file, written at most once a second (readings arrive every few
 * minutes; this only guards against bursts). A missing or unreadable file is
 * an empty calibration, never an error.
 */
export class FileCalibrationStore implements CalibrationStore {
  private timer: NodeJS.Timeout | null = null;
  private pending: CalibrationState | null = null;

  constructor(
    readonly filePath: string,
    private readonly logger?: Logger,
  ) {}

  load(): CalibrationState {
    try {
      return parseCalibration(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch {
      return EMPTY_CALIBRATION;
    }
  }

  save(state: CalibrationState): void {
    this.pending = state;
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 1000);
    this.timer.unref?.();
  }

  /** Writes any pending state now. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const state = this.pending;
    this.pending = null;
    if (!state) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      this.logger?.warn('Could not save the limit calibration', { err: String(err) });
    }
  }
}
