import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCredentials } from './credentials';

// Mirror the real `execFile`: it carries a util.promisify.custom hook so that
// promisify(execFile) resolves to { stdout, stderr } rather than a bare value.
const { execFileMock, setKeychain } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { promisify } = require('node:util');
  let response: string | Error = new Error('unset');
  const fn = Object.assign(vi.fn(), {
    [promisify.custom]: async () => {
      if (response instanceof Error) throw response;
      return { stdout: response, stderr: '' };
    },
  });
  return { execFileMock: fn, setKeychain: (r: string | Error) => (response = r) };
});

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

const MISSING_FILE = path.join(os.tmpdir(), 'cw-missing-credentials.json');

describe('readCredentials macOS Keychain fallback', () => {
  afterEach(() => {
    execFileMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('reads OAuth credentials from the Keychain when the file is absent', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    setKeychain(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'tok-abc',
          refreshToken: 'ref-xyz',
          expiresAt: 123,
          subscriptionType: 'team',
          scopes: ['a', 'b'],
        },
        organizationUuid: 'org-1',
      }),
    );

    const creds = await readCredentials(MISSING_FILE);
    expect(creds).not.toBeNull();
    expect(creds?.accessToken).toBe('tok-abc');
    expect(creds?.subscriptionType).toBe('team');
    expect(creds?.organizationUuid).toBe('org-1');
    expect(creds?.scopes).toEqual(['a', 'b']);
  });

  it('returns null when the Keychain entry is missing', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    setKeychain(new Error('not found'));
    expect(await readCredentials(MISSING_FILE)).toBeNull();
  });

  it('does not consult the Keychain off macOS', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    setKeychain(JSON.stringify({ claudeAiOauth: { accessToken: 'tok' } }));
    expect(await readCredentials(MISSING_FILE)).toBeNull();
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
