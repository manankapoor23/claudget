import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { claudePaths } from '@claude-widget/core';

/** Runtime path to the window/tray icon (dev vs packaged). */
export function resolveIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png');
}

/**
 * Detects the Claude Code CLI version (used in the official endpoint's
 * User-Agent) from on-disk artifacts, avoiding the need to spawn a process.
 */
export function detectCliVersion(claudeDirOverride?: string | null): string | null {
  const paths = claudePaths(claudeDirOverride);
  const re = /(\d+\.\d+\.\d+)/;

  try {
    const raw = fs.readFileSync(path.join(paths.root, '.last-update-result.json'), 'utf8');
    const data = JSON.parse(raw) as { version_to?: unknown };
    if (typeof data.version_to === 'string') {
      const m = data.version_to.match(re);
      if (m) return m[1] ?? null;
    }
  } catch {
    // Fall through to session files.
  }

  try {
    for (const file of fs.readdirSync(paths.sessionsDir)) {
      try {
        const raw = fs.readFileSync(path.join(paths.sessionsDir, file), 'utf8');
        const data = JSON.parse(raw) as { version?: unknown };
        if (typeof data.version === 'string') {
          const m = data.version.match(re);
          if (m) return m[1] ?? null;
        }
      } catch {
        // Try the next session file.
      }
    }
  } catch {
    // Sessions dir missing — give up gracefully.
  }

  return null;
}
