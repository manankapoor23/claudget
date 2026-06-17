import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNoopLogger } from '../logger';
import { OfficialUsageClient } from './client';

function writeTempCreds(expiresAt: number): string {
  const p = path.join(
    os.tmpdir(),
    `cw-creds-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(
    p,
    JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt, subscriptionType: 'team' } }),
  );
  return p;
}

describe('OfficialUsageClient', () => {
  it('fetches, serves cache within the poll window, then backs off on 429', async () => {
    const credsPath = writeTempCreds(9_999_999_999_999);
    let now = 1_000_000;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ five_hour: { utilization: 0.4 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 429 }));

    const client = new OfficialUsageClient({
      credentialsPath: credsPath,
      cliVersion: '2.1.178',
      pollIntervalMs: 300_000,
      logger: createNoopLogger(),
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
    });

    const first = await client.getUsage();
    expect(first.status).toBe('ok');
    expect(first.windows.length).toBe(1);
    expect(first.windows[0]?.usedPct).toBeCloseTo(40);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Within the poll window → served from cache, no new request.
    const cached = await client.getUsage();
    expect(cached.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Forced refresh after the window → 429 → rate-limited but keeps prior data.
    now += 400_000;
    const limited = await client.getUsage({ force: true });
    expect(limited.status).toBe('rate-limited');
    expect(limited.stale).toBe(true);
    expect(limited.windows.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fs.rmSync(credsPath, { force: true });
  });

  it('reports missing credentials without fetching', async () => {
    const fetchMock = vi.fn();
    const client = new OfficialUsageClient({
      credentialsPath: path.join(os.tmpdir(), 'definitely-missing-creds.json'),
      cliVersion: null,
      pollIntervalMs: 300_000,
      logger: createNoopLogger(),
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => 1,
    });
    const res = await client.getUsage({ force: true });
    expect(res.status).toBe('no-credentials');
    expect(res.available).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips fetching when the token is expired', async () => {
    const credsPath = writeTempCreds(500);
    const fetchMock = vi.fn();
    const client = new OfficialUsageClient({
      credentialsPath: credsPath,
      cliVersion: null,
      pollIntervalMs: 300_000,
      logger: createNoopLogger(),
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => 1_000,
    });
    const res = await client.getUsage({ force: true });
    expect(res.status).toBe('expired');
    expect(fetchMock).not.toHaveBeenCalled();
    fs.rmSync(credsPath, { force: true });
  });
});
