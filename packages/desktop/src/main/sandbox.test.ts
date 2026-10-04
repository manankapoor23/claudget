import { describe, expect, it } from 'vitest';
import { sandboxStatus, type SandboxFacts } from './sandbox';

const base: SandboxFacts = {
  noSandboxSwitch: false,
  apparmorRestrictsUserns: null,
  usernsCloneAllowed: null,
  maxUserNamespaces: null,
  appImage: false,
};

describe('sandboxStatus', () => {
  it('reports the sandbox on where user namespaces work', () => {
    expect(sandboxStatus({ ...base, apparmorRestrictsUserns: false })).toEqual({
      sandboxed: true,
      reason: 'sandbox on (user namespaces available)',
    });
  });

  it("explains the AppImage launcher's --no-sandbox on Ubuntu 24.04", () => {
    const s = sandboxStatus({
      ...base,
      noSandboxSwitch: true,
      apparmorRestrictsUserns: true,
      appImage: true,
    });
    expect(s.sandboxed).toBe(false);
    expect(s.reason).toBe(
      '--no-sandbox from the AppImage launcher: AppArmor restricts unprivileged user namespaces',
    );
  });

  it('notes a sandbox kept by a profile or setuid helper despite the restriction (.deb)', () => {
    const s = sandboxStatus({ ...base, apparmorRestrictsUserns: true });
    expect(s.sandboxed).toBe(true);
    expect(s.reason).toMatch(/despite AppArmor/);
  });

  it('names Debian and max_user_namespaces blockers', () => {
    const s = sandboxStatus({
      ...base,
      noSandboxSwitch: true,
      usernsCloneAllowed: false,
      maxUserNamespaces: 0,
    });
    expect(s.reason).toBe(
      '--no-sandbox from the command line: unprivileged_userns_clone=0, max_user_namespaces=0',
    );
  });
});
