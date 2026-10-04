import fs from 'node:fs';

/**
 * Linux only, for the log: is Chromium's sandbox on, and if not, why not.
 *
 * The decision itself is made before any of our code runs, by the AppImage's
 * launcher (electron-builder's AppRun): it passes --no-sandbox only when
 * `unshare -Ur true` fails, i.e. when unprivileged user namespaces are
 * unavailable — Ubuntu 23.10+ restricts them through AppArmor for programs
 * without a profile, and an AppImage can't install one. The .deb installs an
 * AppArmor profile (or a setuid chrome-sandbox on kernels without user
 * namespaces), so it keeps the sandbox. This records which case a user is
 * in, so a bug report says it without asking.
 */
export interface SandboxFacts {
  /** `--no-sandbox` is on the command line. */
  noSandboxSwitch: boolean;
  /** kernel.apparmor_restrict_unprivileged_userns (Ubuntu 23.10+), if present. */
  apparmorRestrictsUserns: boolean | null;
  /** kernel.unprivileged_userns_clone (Debian), if present. */
  usernsCloneAllowed: boolean | null;
  /** user.max_user_namespaces, if present. */
  maxUserNamespaces: number | null;
  /** Running from an AppImage ($APPIMAGE set). */
  appImage: boolean;
}

export interface SandboxStatus {
  sandboxed: boolean;
  reason: string;
}

export function sandboxStatus(f: SandboxFacts): SandboxStatus {
  const blockers: string[] = [];
  if (f.apparmorRestrictsUserns) blockers.push('AppArmor restricts unprivileged user namespaces');
  if (f.usernsCloneAllowed === false) blockers.push('unprivileged_userns_clone=0');
  if (f.maxUserNamespaces === 0) blockers.push('max_user_namespaces=0');
  if (!f.noSandboxSwitch) {
    return {
      sandboxed: true,
      reason: blockers.length
        ? `sandbox on despite ${blockers.join(', ')} (AppArmor profile or setuid helper)`
        : 'sandbox on (user namespaces available)',
    };
  }
  const by = f.appImage ? 'the AppImage launcher' : 'the command line';
  return {
    sandboxed: false,
    reason: blockers.length
      ? `--no-sandbox from ${by}: ${blockers.join(', ')}`
      : `--no-sandbox from ${by}`,
  };
}

function readSysctl(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

/** Reads the facts from /proc and argv. */
export function readSandboxFacts(argv = process.argv, env = process.env): SandboxFacts {
  const restrict = readSysctl('/proc/sys/kernel/apparmor_restrict_unprivileged_userns');
  const clone = readSysctl('/proc/sys/kernel/unprivileged_userns_clone');
  const max = readSysctl('/proc/sys/user/max_user_namespaces');
  return {
    noSandboxSwitch: argv.includes('--no-sandbox'),
    apparmorRestrictsUserns: restrict === null ? null : restrict === '1',
    usernsCloneAllowed: clone === null ? null : clone !== '0',
    maxUserNamespaces: max === null || Number.isNaN(Number(max)) ? null : Number(max),
    appImage: Boolean(env['APPIMAGE']),
  };
}
