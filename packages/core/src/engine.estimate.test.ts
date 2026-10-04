import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { UsageEngine } from './engine';
import { FileCalibrationStore, rateFor } from './estimate';
import { createLogger, createNoopLogger } from './logger';

// Never consult the host's real macOS Keychain (see official/client.test.ts).
vi.mock('node:child_process', () => ({
  execFile: (
    _file: string,
    _args: string[],
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(new Error('keychain disabled in tests'), '', ''),
}));

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.UTC(2026, 9, 4, 10, 0, 0);
const RESET = T0 + 5 * H;

/** One Opus request worth $0.75 at list prices (10k output tokens). */
const line = (id: string, at: number): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: new Date(at).toISOString(),
    uuid: id,
    requestId: id,
    sessionId: 'session-1',
    message: { id, model: 'claude-opus-4-1', usage: { input_tokens: 0, output_tokens: 10_000 } },
  }) + '\n';

/** The endpoint's reset time jitters by a few ms between polls. */
const reading = (pct: number, jitterMs = 0): Response =>
  new Response(
    JSON.stringify({
      five_hour: { utilization: pct, resets_at: new Date(RESET + jitterMs).toISOString() },
    }),
    { status: 200 },
  );

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function setup(): { claudeDir: string; transcript: string; calibrationPath: string } {
  const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-estimate-'));
  dirs.push(claudeDir);
  const projects = path.join(claudeDir, 'projects', '-Users-test-project');
  fs.mkdirSync(projects, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: 9_999_999_999_999 } }),
  );
  // 40 requests ($30) over the first hour of the window.
  const transcript = path.join(projects, 'session.jsonl');
  fs.writeFileSync(
    transcript,
    Array.from({ length: 40 }, (_, i) => line(`a${i}`, T0 + (i + 1) * 90_000)).join(''),
  );
  return { claudeDir, transcript, calibrationPath: path.join(claudeDir, 'calibration.json') };
}

describe('UsageEngine live limit estimate', () => {
  it('estimates between readings, marks it, snaps to the next reading, and persists k', async () => {
    const { claudeDir, transcript, calibrationPath } = setup();
    let now = T0 + 60 * MIN;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reading(30))
      .mockResolvedValueOnce(reading(32, 337));
    const store = new FileCalibrationStore(calibrationPath);
    const debug: string[] = [];
    const engine = new UsageEngine({
      config: { ...DEFAULT_CONFIG, claudeDir },
      logger: createLogger({ level: 'debug', sinks: [(r) => debug.push(r.message)] }),
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      calibrationStore: store,
    });
    await engine.fullRescan();
    await engine.refreshOfficial(true, 0);

    // 30% after $30 since the window opened: k = 1 point per $.
    expect(rateFor(engine.getCalibration(), 'five_hour')!.k).toBeCloseTo(0.01, 6);
    let w = engine.getSnapshot().official.windows[0]!;
    expect(w.usedPct).toBeCloseTo(30);
    expect(w.estimate ?? null).toBeNull(); // nothing used since the reading

    // Three more requests ($2.25) after the reading → ~+2 points (×0.9).
    now += 2 * MIN;
    fs.appendFileSync(transcript, [1, 2, 3].map((i) => line(`b${i}`, now - i * 1000)).join(''));
    await engine.fullRescan();
    w = engine.getSnapshot().official.windows[0]!;
    expect(w.usedPct).toBeCloseTo(30); // the official value is untouched
    expect(w.estimate?.usedPct).toBeCloseTo(30 + 0.9 * 2.25, 6);
    expect(w.estimate?.afterReset).toBe(false);

    // Anthropic's next reading wins outright.
    now += MIN;
    await engine.refreshOfficial(true, 0);
    w = engine.getSnapshot().official.windows[0]!;
    expect(w.usedPct).toBeCloseTo(32);
    expect(w.estimate ?? null).toBeNull();
    // ...and how far the shown estimate was from it is logged, to tune the damping.
    expect(debug).toContain('Limit estimate overshot by 0.0 pts');

    // Persisted: a fresh engine starts out calibrated, before any reading.
    store.flush();
    const again = new UsageEngine({
      config: { ...DEFAULT_CONFIG, claudeDir },
      logger: createNoopLogger(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      now: () => now,
      calibrationStore: new FileCalibrationStore(calibrationPath),
    });
    const k = rateFor(again.getCalibration(), 'five_hour')!.k;
    expect(k).toBeCloseTo(0.32 / 32.25, 6);
  });

  it('shows no estimate while plan limits are off', async () => {
    const { claudeDir } = setup();
    const engine = new UsageEngine({
      config: { ...DEFAULT_CONFIG, claudeDir, enableOfficial: false },
      logger: createNoopLogger(),
      now: () => T0 + 60 * MIN,
    });
    await engine.fullRescan();
    expect(engine.getSnapshot().official.windows).toEqual([]);
  });
});
