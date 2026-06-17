import os from 'node:os';
import path from 'node:path';
import { pathExists } from './util/fs';

export interface ClaudePaths {
  root: string;
  projectsDir: string;
  credentialsPath: string;
  sessionsDir: string;
  settingsPath: string;
}

/**
 * Resolves the active `~/.claude` directory.
 *
 * Precedence: explicit `override` → `$CLAUDE_CONFIG_DIR` → `~/.claude`.
 */
export function resolveClaudeDir(override?: string | null): string {
  if (override && override.trim()) return path.resolve(override.trim());
  const env = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (env) {
    const parts = env.split(path.delimiter);
    const first = (parts[0] ?? env).trim();
    return path.resolve(first || env);
  }
  return path.join(os.homedir(), '.claude');
}

export function claudePaths(override?: string | null): ClaudePaths {
  const root = resolveClaudeDir(override);
  return {
    root,
    projectsDir: path.join(root, 'projects'),
    credentialsPath: path.join(root, '.credentials.json'),
    sessionsDir: path.join(root, 'sessions'),
    settingsPath: path.join(root, 'settings.json'),
  };
}

export async function claudeDirExists(override?: string | null): Promise<boolean> {
  return pathExists(resolveClaudeDir(override));
}

/**
 * Best-effort prettifier for an on-disk project slug. The slug encodes a cwd
 * with path separators replaced by '-', which is lossy, so this is display-only.
 */
export function prettifyProjectSlug(slug: string): string {
  if (!slug) return 'unknown';
  const trimmed = slug.replace(/^-+/, '');
  const segments = trimmed.split('-').filter(Boolean);
  return segments.length > 0 ? (segments[segments.length - 1] ?? slug) : slug;
}
