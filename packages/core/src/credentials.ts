import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readJsonSafe } from './util/fs';

const execFileAsync = promisify(execFile);

/** Keychain service name Claude Code uses to store its OAuth credentials on macOS. */
const MACOS_KEYCHAIN_SERVICE = 'Claude Code-credentials';

export interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  scopes: string[];
  organizationUuid: string | null;
}

interface RawCredentials {
  claudeAiOauth?: {
    accessToken?: unknown;
    refreshToken?: unknown;
    expiresAt?: unknown;
    subscriptionType?: unknown;
    rateLimitTier?: unknown;
    scopes?: unknown;
  };
  organizationUuid?: unknown;
}

/**
 * Reads the raw credentials JSON from the macOS login Keychain, where Claude
 * Code stores its OAuth token instead of a file. Returns null off macOS or if
 * the entry is missing/unreadable. The secret is never logged by this module.
 */
async function readMacKeychainCredentials(): Promise<RawCredentials | null> {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s',
      MACOS_KEYCHAIN_SERVICE,
      '-w',
    ]);
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as RawCredentials;
  } catch {
    return null;
  }
}

/**
 * Reads Claude Code's OAuth credentials. Prefers `~/.claude/.credentials.json`,
 * falling back to the macOS login Keychain (where Claude Code stores them on
 * macOS). Returns null if missing/unreadable or if no access token is present.
 * The raw token is never logged by this module.
 */
export async function readCredentials(credentialsPath: string): Promise<ClaudeCredentials | null> {
  const raw =
    (await readJsonSafe<RawCredentials>(credentialsPath)) ?? (await readMacKeychainCredentials());
  const oauth = raw?.claudeAiOauth;
  if (!oauth || typeof oauth.accessToken !== 'string' || oauth.accessToken.length === 0) {
    return null;
  }
  return {
    accessToken: oauth.accessToken,
    refreshToken: typeof oauth.refreshToken === 'string' ? oauth.refreshToken : null,
    expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : 0,
    subscriptionType: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
    rateLimitTier: typeof oauth.rateLimitTier === 'string' ? oauth.rateLimitTier : null,
    scopes: Array.isArray(oauth.scopes)
      ? oauth.scopes.filter((s): s is string => typeof s === 'string')
      : [],
    organizationUuid: typeof raw?.organizationUuid === 'string' ? raw.organizationUuid : null,
  };
}

export type RedactedCredentials = Omit<ClaudeCredentials, 'accessToken' | 'refreshToken'> & {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
};

/** Produces a secret-free view safe to include in snapshots and logs. */
export function redactCredentials(c: ClaudeCredentials): RedactedCredentials {
  return {
    expiresAt: c.expiresAt,
    subscriptionType: c.subscriptionType,
    rateLimitTier: c.rateLimitTier,
    scopes: c.scopes,
    organizationUuid: c.organizationUuid,
    hasAccessToken: c.accessToken.length > 0,
    hasRefreshToken: Boolean(c.refreshToken),
  };
}
