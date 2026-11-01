import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * What's on this computer when there's no Claude Code login to read, so the
 * UI can say what to do. The Claude desktop app writes to ~/.claude too (its
 * Code tab runs Claude Code), so a ~/.claude folder doesn't mean the `claude`
 * command exists: someone who only uses the app was told to run `claude` and
 * got "command not found". The app keeps its own login to itself.
 */
export interface ClaudeSetup {
  /** The `claude` command is installed. */
  cli: boolean;
  /** The Claude desktop app is installed (or has run here). */
  app: boolean;
}

export interface SetupProbe {
  platform?: NodeJS.Platform;
  home?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (p: string) => boolean;
}

function existsSync(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Where the `claude` command can live. An app started from the Dock gets a
 * minimal PATH, so the installers' usual locations are checked as well as
 * PATH itself.
 */
function cliCandidates(platform: NodeJS.Platform, home: string, env: NodeJS.ProcessEnv): string[] {
  const win = platform === 'win32';
  const names = win ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const fromPath = (env['PATH'] ?? env['Path'] ?? '')
    .split(win ? ';' : ':')
    .filter(Boolean)
    .flatMap((dir) => names.map((n) => path.join(dir, n)));
  const known = win
    ? [
        path.join(home, '.local', 'bin', 'claude.exe'),
        ...(env['APPDATA'] ? [path.join(env['APPDATA'], 'npm', 'claude.cmd')] : []),
        ...(env['LOCALAPPDATA']
          ? [path.join(env['LOCALAPPDATA'], 'Microsoft', 'WinGet', 'Links', 'claude.exe')]
          : []),
      ]
    : [
        path.join(home, '.local', 'bin', 'claude'),
        path.join(home, '.claude', 'local', 'claude'),
        path.join(home, '.npm-global', 'bin', 'claude'),
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude',
        '/usr/bin/claude',
      ];
  return [...known, ...fromPath];
}

/** The Claude app's install location or its data folder (it has run here). */
function appCandidates(platform: NodeJS.Platform, home: string, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/Claude.app',
      path.join(home, 'Applications', 'Claude.app'),
      path.join(home, 'Library', 'Application Support', 'Claude'),
    ];
  }
  if (platform === 'win32') {
    return [
      ...(env['LOCALAPPDATA'] ? [path.join(env['LOCALAPPDATA'], 'AnthropicClaude')] : []),
      ...(env['APPDATA'] ? [path.join(env['APPDATA'], 'Claude')] : []),
    ];
  }
  return [path.join(env['XDG_CONFIG_HOME'] ?? path.join(home, '.config'), 'Claude')];
}

/** Looks for the `claude` command and the Claude app. Only checks that paths exist. */
export function detectClaudeSetup(probe: SetupProbe = {}): ClaudeSetup {
  const platform = probe.platform ?? process.platform;
  const home = probe.home ?? os.homedir();
  const env = probe.env ?? process.env;
  const exists = probe.exists ?? existsSync;
  return {
    cli: cliCandidates(platform, home, env).some(exists),
    app: appCandidates(platform, home, env).some(exists),
  };
}

/** Claude Code's official installer, for this platform (from its setup docs). */
export function installCommandFor(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? 'irm https://claude.ai/install.ps1 | iex'
    : 'curl -fsSL https://claude.ai/install.sh | bash';
}
