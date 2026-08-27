import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lookupCredentials, type KeychainRead } from './credentials';

/**
 * Every branch here is a different thing the user has to do, so each gets its
 * own case. The Keychain reader is always injected: left real, these tests would
 * read whoever's login Keychain they run on and pass or fail by machine.
 */

const NO_KEYCHAIN: KeychainRead = { raw: null, problem: null, detail: null };
const noKeychain = () => Promise.resolve(NO_KEYCHAIN);

let dir: string;
let credsPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-creds-'));
  credsPath = path.join(dir, '.credentials.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeCreds(oauth: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  fs.writeFileSync(credsPath, JSON.stringify({ claudeAiOauth: oauth, ...extra }));
}

describe('lookupCredentials', () => {
  it('reads a valid file and reports no problem', async () => {
    writeCreds({
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: 4_000_000_000_000,
      subscriptionType: 'max',
    });
    const r = await lookupCredentials(credsPath, { readKeychain: noKeychain });
    expect(r.problem).toBeNull();
    expect(r.source).toBe('file');
    expect(r.credentials?.accessToken).toBe('tok');
    expect(r.credentials?.subscriptionType).toBe('max');
  });

  /** The reported case: Claude Code logged out, so nothing is stored anywhere. */
  it('reports signed-out when the directory exists but holds no login', async () => {
    const r = await lookupCredentials(credsPath, { readKeychain: noKeychain });
    expect(r.problem).toBe('signed-out');
    expect(r.credentials).toBeNull();
    expect(r.detail).toContain(dir);
  });

  /** A different fix entirely: install Claude Code, or correct `claudeDir`. */
  it('reports not-installed when the claude directory is absent', async () => {
    const missing = path.join(dir, 'nope', '.credentials.json');
    const r = await lookupCredentials(missing, { readKeychain: noKeychain });
    expect(r.problem).toBe('not-installed');
    expect(r.detail).toContain('does not exist');
  });

  it('reports malformed when the file is not JSON', async () => {
    fs.writeFileSync(credsPath, '{ this is not json');
    const r = await lookupCredentials(credsPath, { readKeychain: noKeychain });
    expect(r.problem).toBe('malformed');
    expect(r.source).toBe('file');
    expect(r.detail).toContain(credsPath);
  });

  /** Partially torn-down credentials: the shape is there, the token isn't. */
  it('reports no-token when credentials carry an empty access token', async () => {
    writeCreds({ accessToken: '', refreshToken: 'ref' });
    const r = await lookupCredentials(credsPath, { readKeychain: noKeychain });
    expect(r.problem).toBe('no-token');
    expect(r.credentials).toBeNull();
  });

  it('reports no-token when the oauth block is missing entirely', async () => {
    fs.writeFileSync(credsPath, JSON.stringify({ organizationUuid: 'org' }));
    const r = await lookupCredentials(credsPath, { readKeychain: noKeychain });
    expect(r.problem).toBe('no-token');
  });

  /**
   * A denied Keychain prompt must not look like "signed out": the token is
   * probably there and the fix is granting access, not signing in again.
   */
  it('surfaces a denied keychain rather than reporting signed-out', async () => {
    const r = await lookupCredentials(credsPath, {
      readKeychain: () =>
        Promise.resolve({
          raw: null,
          problem: 'keychain-denied' as const,
          detail: 'macOS denied access to the "Claude Code-credentials" Keychain entry.',
        }),
    });
    expect(r.problem).toBe('keychain-denied');
    expect(r.source).toBe('keychain');
    expect(r.detail).toContain('denied');
  });

  it('falls back to the keychain when there is no file', async () => {
    const r = await lookupCredentials(credsPath, {
      readKeychain: () =>
        Promise.resolve({
          raw: { claudeAiOauth: { accessToken: 'kc-token', expiresAt: 4_000_000_000_000 } },
          problem: null,
          detail: null,
        }),
    });
    expect(r.problem).toBeNull();
    expect(r.source).toBe('keychain');
    expect(r.credentials?.accessToken).toBe('kc-token');
  });

  it('prefers the file over the keychain when both exist', async () => {
    writeCreds({ accessToken: 'from-file', expiresAt: 4_000_000_000_000 });
    const r = await lookupCredentials(credsPath, {
      readKeychain: () =>
        Promise.resolve({
          raw: { claudeAiOauth: { accessToken: 'from-keychain' } },
          problem: null,
          detail: null,
        }),
    });
    expect(r.source).toBe('file');
    expect(r.credentials?.accessToken).toBe('from-file');
  });

  it('never puts a token in detail', async () => {
    fs.writeFileSync(credsPath, '{ bad json with secret-token-value');
    const r = await lookupCredentials(credsPath, { readKeychain: noKeychain });
    expect(r.detail).not.toContain('secret-token-value');
  });
});
