import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { Logger } from '@claude-widget/core';
import type { NotchPayload } from '../shared/notch';

/**
 * The macOS "Notch line": a small native helper (native/notch/NotchHelper.swift)
 * draws the line and the hover card; this side decides when it runs and feeds
 * it the 5-hour limit.
 *
 * It runs only while it's wanted — switched on, plan limits on, and a notched
 * screen connected — so a Mac without a notch never starts it. Notch presence
 * comes from `claudget-notch --probe` at launch and after display changes, and
 * from the running helper itself (lid closed, external display only).
 */

/** Where the helper lives: inside the .app when packaged, the build output in dev. */
export function resolveNotchHelper(isPackaged: boolean, appPath: string): string | null {
  const override = process.env['CLAUDGET_NOTCH_HELPER'];
  const candidates = override
    ? [override]
    : isPackaged
      ? [path.join(process.resourcesPath, 'claudget-notch')]
      : [path.join(appPath, 'native/notch/out/claudget-notch')];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** At most this often, latest value wins. */
export const SEND_INTERVAL_MS = 250;

/**
 * Sends a payload as one JSON line, only when it differs from the last one
 * sent, and at most every `intervalMs` (the latest pending value wins).
 */
export class PayloadSender {
  private lastSent: string | null = null;
  private lastAt = -Infinity;
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly write: (line: string) => void,
    private readonly intervalMs = SEND_INTERVAL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  push(payload: NotchPayload): void {
    const line = JSON.stringify(payload);
    if (line === this.lastSent) {
      // Back to what the helper already shows: drop anything queued.
      this.pending = null;
      return;
    }
    this.pending = line;
    const wait = this.lastAt + this.intervalMs - this.now();
    if (wait <= 0) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), wait);
  }

  /** Forget what was sent: a fresh helper must be told everything again. */
  reset(): void {
    this.lastSent = null;
    this.lastAt = -Infinity;
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const line = this.pending;
    this.pending = null;
    if (line === null || line === this.lastSent) return;
    this.lastSent = line;
    this.lastAt = this.now();
    this.write(line);
  }
}

/** A run this long proves the helper healthy: the crash count starts over. */
export const HEALTHY_RUN_MS = 30_000;
/** Crashes in a row (each within HEALTHY_RUN_MS) before giving up. */
export const MAX_QUICK_CRASHES = 6;

/**
 * How long to wait before restarting after the `n`th crash in a row: 1s, 2s,
 * 4s … capped at 60s; null once it has crashed too often to keep trying.
 */
export function restartDelay(crashes: number): number | null {
  if (crashes > MAX_QUICK_CRASHES) return null;
  return Math.min(60_000, 1000 * 2 ** Math.max(0, crashes - 1));
}

export interface HelperEvent {
  event: string;
  notch?: boolean;
  [key: string]: unknown;
}

export interface NotchLineDeps {
  helperPath: string | null;
  logger: Logger;
  /** Clicked the card or the notch: show the popover. */
  onOpen: () => void;
  spawnHelper?: (file: string) => ChildProcess;
  probe?: (file: string) => Promise<boolean | null>;
  now?: () => number;
}

function defaultProbe(file: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    execFile(file, ['--probe'], { timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        const info = JSON.parse(String(stdout).trim()) as { notch?: unknown };
        resolve(info.notch === true);
      } catch {
        resolve(null);
      }
    });
  });
}

export class NotchLine {
  private enabled = false;
  /** Null until the first probe answers. */
  private notch: boolean | null = null;
  private child: ChildProcess | null = null;
  private startedAt = 0;
  private crashes = 0;
  private gaveUp = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private latest: NotchPayload | null = null;
  private probing = false;
  private disposed = false;
  private readonly sender: PayloadSender;
  private readonly spawnHelper: (file: string) => ChildProcess;
  private readonly probe: (file: string) => Promise<boolean | null>;
  private readonly now: () => number;

  constructor(private readonly deps: NotchLineDeps) {
    this.spawnHelper =
      deps.spawnHelper ?? ((file) => spawn(file, [], { stdio: ['pipe', 'pipe', 'pipe'] }));
    this.probe = deps.probe ?? defaultProbe;
    this.now = deps.now ?? Date.now;
    this.sender = new PayloadSender((line) => this.write(line), SEND_INTERVAL_MS, this.now);
  }

  /** True / false once known; null where there's no helper (dev without a build). */
  get hasNotch(): boolean | null {
    return this.deps.helperPath ? this.notch : null;
  }

  get running(): boolean {
    return this.child !== null;
  }

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    // Switching it on again is a fresh start, even after giving up.
    if (on) {
      this.gaveUp = false;
      this.crashes = 0;
    }
    if (on && this.notch === null) void this.reprobe();
    else this.sync();
  }

  update(payload: NotchPayload): void {
    this.latest = payload;
    if (this.child) this.sender.push(payload);
  }

  /** Displays changed: look for a notch again, unless the helper is already watching. */
  displaysChanged(): void {
    if (this.child) return;
    void this.reprobe();
  }

  async reprobe(): Promise<void> {
    const file = this.deps.helperPath;
    if (!file || this.probing || this.disposed) return;
    this.probing = true;
    try {
      const found = await this.probe(file);
      if (found !== null) this.setNotch(found);
    } finally {
      this.probing = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearRestart();
    this.stop();
  }

  private setNotch(found: boolean): void {
    if (found !== this.notch) this.deps.logger.info('Notch', { notch: found });
    this.notch = found;
    if (found) this.gaveUp = false;
    this.sync();
  }

  private get wanted(): boolean {
    return (
      !this.disposed &&
      this.enabled &&
      this.notch === true &&
      this.deps.helperPath !== null &&
      !this.gaveUp
    );
  }

  private sync(): void {
    if (this.wanted) {
      if (!this.child && !this.restartTimer) this.start();
    } else {
      this.clearRestart();
      this.stop();
    }
  }

  private start(): void {
    const file = this.deps.helperPath;
    if (!file) return;
    let child: ChildProcess;
    try {
      child = this.spawnHelper(file);
    } catch (err) {
      this.deps.logger.warn('Notch helper failed to start', { err: String(err) });
      this.crashed();
      return;
    }
    this.child = child;
    this.startedAt = this.now();
    this.sender.reset();
    this.deps.logger.info('Notch helper started', { pid: child.pid });

    child.stdin?.on('error', () => {
      // EPIPE when it has just died; the exit handler takes it from here.
    });
    if (child.stdout) {
      readline
        .createInterface({ input: child.stdout })
        .on('line', (line) => this.onLine(child, line));
    }
    child.stderr?.on('data', (d: Buffer) =>
      this.deps.logger.debug('Notch helper stderr', { text: String(d).trim() }),
    );
    child.on('error', (err) => this.deps.logger.warn('Notch helper error', { err: String(err) }));
    child.on('exit', (code, signal) => {
      if (this.child !== child) return; // stopped on purpose
      this.child = null;
      this.deps.logger.warn('Notch helper exited', { code, signal });
      this.crashed();
    });
    if (this.latest) this.sender.push(this.latest);
  }

  private crashed(): void {
    if (this.now() - this.startedAt >= HEALTHY_RUN_MS) this.crashes = 0;
    this.crashes += 1;
    const delay = restartDelay(this.crashes);
    if (delay === null) {
      this.gaveUp = true;
      this.deps.logger.error('Notch helper keeps crashing; leaving it off until re-enabled', {
        crashes: this.crashes,
      });
      return;
    }
    this.clearRestart();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.sync();
    }, delay);
  }

  private stop(): void {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.sender.reset();
    // Closing stdin is the helper's cue to exit; the signal is the backstop.
    child.stdin?.end();
    child.kill('SIGTERM');
    this.deps.logger.info('Notch helper stopped', { pid: child.pid });
  }

  private clearRestart(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private write(line: string): void {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed) return;
    stdin.write(`${line}\n`);
    this.deps.logger.debug('Notch payload sent', { line });
  }

  private onLine(child: ChildProcess, line: string): void {
    if (this.child !== child) return;
    let msg: HelperEvent;
    try {
      msg = JSON.parse(line) as HelperEvent;
    } catch {
      return;
    }
    switch (msg.event) {
      case 'ready':
        this.deps.logger.info('Notch helper ready', { version: msg['version'] });
        break;
      case 'notch':
        this.deps.logger.info('Notch helper found the notch', msg);
        this.setNotch(true);
        break;
      case 'no-notch':
        // Lid closed or the notched screen unplugged: nothing to draw on, so
        // stop it; the next display change probes again.
        this.setNotch(false);
        break;
      case 'open':
        this.deps.onOpen();
        break;
      case 'applied':
        this.deps.logger.debug('Notch helper applied', msg);
        break;
      default:
        this.deps.logger.debug('Notch helper says', msg);
    }
  }
}
