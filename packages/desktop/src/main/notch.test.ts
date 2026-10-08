import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoopLogger } from '@claude-widget/core';
import type { NotchPayload } from '../shared/notch';
import {
  HEALTHY_RUN_MS,
  MAX_QUICK_CRASHES,
  NotchLine,
  PayloadSender,
  SEND_INTERVAL_MS,
  restartDelay,
} from './notch';

const pay = (pct: number): NotchPayload => ({
  fiveHour: { pct, estimated: false, tone: 'ok', resetsAt: null },
  weekly: null,
  fullAt: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('PayloadSender', () => {
  it('sends the first payload at once and drops repeats', () => {
    const sent: string[] = [];
    const s = new PayloadSender((l) => sent.push(l));
    s.push(pay(10));
    s.push(pay(10));
    expect(sent).toEqual([JSON.stringify(pay(10))]);
  });

  it('throttles to one send per interval, latest value wins', () => {
    const sent: string[] = [];
    const s = new PayloadSender((l) => sent.push(l));
    s.push(pay(1));
    s.push(pay(2));
    s.push(pay(3));
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(SEND_INTERVAL_MS);
    expect(sent.map((l) => (JSON.parse(l) as NotchPayload).fiveHour?.pct)).toEqual([1, 3]);
    // Never more than ~4 a second, however often it's pushed.
    for (let i = 0; i < 100; i++) {
      s.push(pay(10 + (i % 50)));
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(SEND_INTERVAL_MS);
    expect(sent.length).toBeLessThanOrEqual(2 + Math.ceil(1000 / SEND_INTERVAL_MS) + 1);
  });

  it('cancels a queued change that went back to what was sent', () => {
    const sent: string[] = [];
    const s = new PayloadSender((l) => sent.push(l));
    s.push(pay(1));
    s.push(pay(2));
    s.push(pay(1));
    vi.advanceTimersByTime(SEND_INTERVAL_MS * 2);
    expect(sent).toHaveLength(1);
  });

  it('sends everything again after a reset (a new helper)', () => {
    const sent: string[] = [];
    const s = new PayloadSender((l) => sent.push(l));
    s.push(pay(5));
    s.reset();
    s.push(pay(5));
    expect(sent).toHaveLength(2);
  });
});

describe('restartDelay', () => {
  it('backs off 1s, 2s, 4s … capped at a minute, then gives up', () => {
    expect(restartDelay(1)).toBe(1000);
    expect(restartDelay(2)).toBe(2000);
    expect(restartDelay(3)).toBe(4000);
    expect(restartDelay(MAX_QUICK_CRASHES)).toBeLessThanOrEqual(60_000);
    expect(restartDelay(MAX_QUICK_CRASHES + 1)).toBeNull();
  });
});

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed: string[] = [];
  written: string[] = [];
  constructor(readonly pid: number) {
    super();
    this.stdin.on('data', (d: Buffer) => this.written.push(...String(d).trim().split('\n')));
  }
  kill(sig: string): boolean {
    this.killed.push(sig);
    return true;
  }
  say(obj: object): void {
    this.stdout.write(`${JSON.stringify(obj)}\n`);
  }
  die(code = 1): void {
    this.emit('exit', code, null);
  }
}

function setup(notch: boolean | null = true) {
  const children: FakeChild[] = [];
  const onOpen = vi.fn();
  const line = new NotchLine({
    helperPath: '/fake/claudget-notch',
    logger: createNoopLogger(),
    onOpen,
    spawnHelper: () => {
      const c = new FakeChild(100 + children.length);
      children.push(c);
      return c as unknown as ChildProcess;
    },
    probe: () => Promise.resolve(notch),
  });
  return { line, children, onOpen };
}

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('NotchLine', () => {
  it('starts only when enabled and a notch was found', async () => {
    const { line, children } = setup(false);
    await line.reprobe();
    line.setEnabled(true);
    expect(children).toHaveLength(0);
    expect(line.hasNotch).toBe(false);

    const on = setup(true);
    await on.line.reprobe();
    expect(on.children).toHaveLength(0);
    on.line.setEnabled(true);
    expect(on.children).toHaveLength(1);
  });

  it('sends the current payload to a new helper, then only changes', async () => {
    const { line, children } = setup();
    line.update(pay(40));
    await line.reprobe();
    line.setEnabled(true);
    await flush();
    expect(children[0]!.written).toEqual([JSON.stringify(pay(40))]);
    line.update(pay(40));
    vi.advanceTimersByTime(1000);
    line.update(pay(41));
    await flush();
    expect(children[0]!.written).toHaveLength(2);
  });

  it('stops the helper when switched off: closes stdin and signals it', async () => {
    const { line, children } = setup();
    await line.reprobe();
    line.setEnabled(true);
    const c = children[0]!;
    line.setEnabled(false);
    expect(c.stdin.writableEnded).toBe(true);
    expect(c.killed).toEqual(['SIGTERM']);
    expect(line.running).toBe(false);
    // Its exit afterwards is not a crash: nothing restarts.
    c.die(0);
    vi.advanceTimersByTime(120_000);
    expect(children).toHaveLength(1);
  });

  it('restarts a crashed helper with backoff, and gives up on a crash loop', async () => {
    const { line, children } = setup();
    await line.reprobe();
    line.setEnabled(true);
    children[0]!.die();
    expect(line.running).toBe(false);
    vi.advanceTimersByTime(999);
    expect(children).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(children).toHaveLength(2);
    children[1]!.die();
    vi.advanceTimersByTime(2000);
    expect(children).toHaveLength(3);
    // Each one dies as soon as it starts.
    for (let n = 3; n <= MAX_QUICK_CRASHES + 1; n++) {
      children[children.length - 1]!.die();
      vi.advanceTimersByTime(restartDelay(n) ?? 0);
    }
    const count = children.length;
    vi.advanceTimersByTime(10 * 60_000);
    expect(children).toHaveLength(count);
    expect(line.running).toBe(false);
    // Switching it on again starts over.
    line.setEnabled(false);
    line.setEnabled(true);
    expect(children).toHaveLength(count + 1);
  });

  it('forgives a crash after a healthy run', async () => {
    const { line, children } = setup();
    await line.reprobe();
    line.setEnabled(true);
    children[0]!.die();
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(HEALTHY_RUN_MS);
    children[1]!.die();
    // Back to the first step of the backoff.
    vi.advanceTimersByTime(1000);
    expect(children).toHaveLength(3);
  });

  it('opens the popover when the helper says so', async () => {
    const { line, children, onOpen } = setup();
    await line.reprobe();
    line.setEnabled(true);
    children[0]!.say({ event: 'ready' });
    children[0]!.say({ event: 'open' });
    await flush();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('stops when the notch goes away and comes back after a display change', async () => {
    let notch = true;
    const children: FakeChild[] = [];
    const line = new NotchLine({
      helperPath: '/fake/claudget-notch',
      logger: createNoopLogger(),
      onOpen: () => {},
      spawnHelper: () => {
        const c = new FakeChild(1);
        children.push(c);
        return c as unknown as ChildProcess;
      },
      probe: () => Promise.resolve(notch),
    });
    await line.reprobe();
    line.setEnabled(true);
    notch = false;
    children[0]!.say({ event: 'no-notch', notch: false });
    await flush();
    expect(line.running).toBe(false);
    expect(children[0]!.killed).toEqual(['SIGTERM']);
    notch = true;
    line.displaysChanged();
    await flush();
    expect(line.running).toBe(true);
    expect(children).toHaveLength(2);
  });

  it('kills the helper on dispose and never restarts it', async () => {
    const { line, children } = setup();
    await line.reprobe();
    line.setEnabled(true);
    line.dispose();
    expect(children[0]!.killed).toEqual(['SIGTERM']);
    vi.advanceTimersByTime(120_000);
    expect(children).toHaveLength(1);
  });

  it('reports no notch info without a helper binary', () => {
    const line = new NotchLine({ helperPath: null, logger: createNoopLogger(), onOpen: () => {} });
    expect(line.hasNotch).toBeNull();
    line.setEnabled(true);
    expect(line.running).toBe(false);
  });
});
