import { internAtomRequest, selectionOwnerRequest, withX11 } from './x11';

/**
 * Linux only: is a compositing manager running? Without one, X11 draws a
 * transparent window's clear pixels as black, so the pill's window, and the
 * rounded corners of the popover and dashboard, came out as black boxes
 * (bare X11, i3, Openbox, LXDE/LXQt, Xfce with compositing off, many VMs).
 *
 * The standard test (EWMH) is whether anyone owns the `_NET_WM_CM_S<screen>`
 * selection. There's no stock CLI for that (xprop can't read selection
 * owners), so this asks the X server directly (see x11.ts): two requests,
 * done in a few milliseconds.
 */

export type Transparency = 'transparent' | 'opaque';

/**
 * What surfaces should be. Wayland always composites; on X11 it's the probe's
 * answer, and when the probe can't tell, opaque: square corners look plain
 * with a compositor, black boxes look broken without one.
 */
export function transparencyFor(
  platform: NodeJS.Platform,
  sessionType: string | undefined,
  composited: boolean | null,
): Transparency {
  if (platform !== 'linux') return 'transparent';
  if ((sessionType ?? '').toLowerCase() === 'wayland') return 'transparent';
  return composited === true ? 'transparent' : 'opaque';
}

/**
 * Asks the X server whether a compositing manager owns `_NET_WM_CM_S<screen>`.
 * Resolves true/false, or null when it can't tell.
 */
export function probeCompositor(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 1000,
  /** Tests: talk to this socket instead of the display's. */
  socketPath?: string,
): Promise<boolean | null> {
  return withX11(
    async (x) => {
      const atomReply = await x.request(internAtomRequest(`_NET_WM_CM_S${x.screen}`));
      if (!atomReply) return null;
      const atom = atomReply.readUInt32LE(8);
      // The atom has never been interned: no compositor has ever run here.
      if (atom === 0) return false;
      const owner = await x.request(selectionOwnerRequest(atom));
      return owner ? owner.readUInt32LE(8) !== 0 : null;
    },
    env,
    timeoutMs,
    socketPath,
  );
}
