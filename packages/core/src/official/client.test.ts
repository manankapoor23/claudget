import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNoopLogger } from '../logger';
import { OfficialUsageClient } from './client';

// Keep tests hermetic: never consult the host machine's real macOS Keychain.
// readCredentials falls back to `security find-generic-password` when the file
// is absent; stubbing execFile to error makes that fallback yield no creds.
vi.mock('node:child_process', () => ({
  execFile: (
    _file: string,
    _args: string[],
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(new Error('keychain disabled in tests'), '', ''),
}));

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
      // Injected so this never reads the developer's own Keychain.
      lookupImpl: () =>
        Promise.resolve({
          credentials: null,
          problem: 'signed-out' as const,
          source: null,
          detail: 'No stored login.',
        }),
    });
    const res = await client.getUsage({ force: true });
    expect(res.status).toBe('signed-out');
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

/**
 * Each credential problem must reach the UI as its own status with the right fix
 * — that mapping is the whole feature, so it gets asserted rather than assumed.
 */
describe('OfficialUsageClient credential problems', () => {
  const base = {
    cliVersion: null,
    pollIntervalMs: 300_000,
    logger: createNoopLogger(),
    now: () => 1,
  };

  const cases = [
    { problem: 'signed-out', status: 'signed-out', fix: 'claude' },
    { problem: 'no-token', status: 'signed-out', fix: 'claude' },
    { problem: 'not-installed', status: 'not-installed', fix: null },
    { problem: 'keychain-denied', status: 'keychain-denied', fix: null },
    { problem: 'malformed', status: 'credentials-malformed', fix: 'claude' },
  ] as const;

  for (const c of cases) {
    it(`maps ${c.problem} to ${c.status} without fetching`, async () => {
      const fetchMock = vi.fn();
      const client = new OfficialUsageClient({
        ...base,
        credentialsPath: '/nowhere/.credentials.json',
        fetchImpl: fetchMock as unknown as typeof fetch,
        lookupImpl: () =>
          Promise.resolve({
            credentials: null,
            problem: c.problem,
            source: null,
            detail: 'why it happened',
          }),
      });
      const res = await client.getUsage({ force: true });
      expect(res.status).toBe(c.status);
      expect(res.fix).toBe(c.fix);
      expect(res.detail).toBe('why it happened');
      expect(res.available).toBe(false);
      // A missing login is not a reason to bother the network.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('distinguishes an expired token that can refresh itself', async () => {
    const withRefresh = (refreshToken: string | null) =>
      new OfficialUsageClient({
        ...base,
        now: () => 5_000,
        credentialsPath: '/nowhere/.credentials.json',
        fetchImpl: vi.fn() as unknown as typeof fetch,
        lookupImpl: () =>
          Promise.resolve({
            credentials: {
              accessToken: 'tok',
              refreshToken,
              expiresAt: 1_000,
              subscriptionType: null,
              rateLimitTier: null,
              scopes: [],
              organizationUuid: null,
            },
            problem: null,
            source: 'file' as const,
            detail: null,
          }),
      });

    const renewable = await withRefresh('ref').getUsage({ force: true });
    expect(renewable.status).toBe('expired');
    expect(renewable.message).toContain('refreshes');
    expect(renewable.fix).toBe('claude');

    const terminal = await withRefresh(null).getUsage({ force: true });
    expect(terminal.status).toBe('expired');
    expect(terminal.message).toContain('no refresh token');
  });
});
