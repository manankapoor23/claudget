import { readJsonSafe } from './util/fs';

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
 * Reads `~/.claude/.credentials.json`. Returns null if missing/unreadable or if
 * no access token is present. The raw token is never logged by this module.
 */
export async function readCredentials(credentialsPath: string): Promise<ClaudeCredentials | null> {
  const raw = await readJsonSafe<RawCredentials>(credentialsPath);
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
