import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/**
 * Linux only: is a compositing manager running? Without one, X11 draws a
 * transparent window's clear pixels as black, so the pill's window, and the
 * rounded corners of the popover and dashboard, came out as black boxes
 * (bare X11, i3, Openbox, LXDE/LXQt, Xfce with compositing off, many VMs).
 *
 * The standard test (EWMH) is whether anyone owns the `_NET_WM_CM_S<screen>`
 * selection. There's no stock CLI for that (xprop can't read selection
 * owners), so this asks the X server directly: three requests over its Unix
 * socket, no native module, done in a few milliseconds.
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

export interface XDisplay {
  /** Unix socket path, or null for a TCP display we don't probe. */
  socket: string | null;
  display: number;
  screen: number;
}

/** ":0", ":1.0", "unix:0" → the local socket; "host:0" → not local. */
export function parseDisplay(value: string | undefined): XDisplay | null {
  const m = /^([^:]*):(\d+)(?:\.(\d+))?$/.exec(value ?? '');
  if (!m) return null;
  const [, host = '', d, s] = m;
  const display = Number(d);
  const screen = s === undefined ? 0 : Number(s);
  const local = host === '' || host === 'unix';
  return { socket: local ? `/tmp/.X11-unix/X${display}` : null, display, screen };
}

export interface XauthEntry {
  family: number;
  address: Buffer;
  number: string;
  name: string;
  data: Buffer;
}

/** Reads an .Xauthority file: a list of (family, address, number, name, data). */
export function parseXauthority(buf: Buffer): XauthEntry[] {
  const out: XauthEntry[] = [];
  let p = 0;
  const field = (): Buffer | null => {
    if (p + 2 > buf.length) return null;
    const len = buf.readUInt16BE(p);
    if (p + 2 + len > buf.length) return null;
    const v = buf.subarray(p + 2, p + 2 + len);
    p += 2 + len;
    return v;
  };
  while (p + 2 <= buf.length) {
    const family = buf.readUInt16BE(p);
    p += 2;
    const address = field();
    const number = field();
    const name = field();
    const data = field();
    if (!address || !number || !name || !data) break;
    out.push({
      family,
      address,
      number: number.toString('latin1'),
      name: name.toString('latin1'),
      data,
    });
  }
  return out;
}

const FAMILY_LOCAL = 256;
const FAMILY_WILD = 65535;
const COOKIE = 'MIT-MAGIC-COOKIE-1';

/** The cookie for this machine's display `n`, as libXau would pick it. */
export function pickCookie(
  entries: XauthEntry[],
  display: number,
  hostname: string,
): Buffer | null {
  const match = entries.find(
    (e) =>
      e.name === COOKIE &&
      (e.number === String(display) || e.number === '') &&
      (e.family === FAMILY_WILD ||
        (e.family === FAMILY_LOCAL && e.address.toString('latin1') === hostname)),
  );
  // Some setups write the local entry under a different host name; any local
  // cookie for this display is still worth a try.
  const loose =
    match ??
    entries.find(
      (e) => e.name === COOKIE && e.number === String(display) && e.family === FAMILY_LOCAL,
    );
  return loose ? loose.data : null;
}

const pad4 = (n: number): number => (4 - (n % 4)) % 4;

/** The connection-setup request, little-endian. */
export function setupRequest(cookie: Buffer | null): Buffer {
  const name = cookie ? Buffer.from(COOKIE, 'latin1') : Buffer.alloc(0);
  const data = cookie ?? Buffer.alloc(0);
  const head = Buffer.alloc(12);
  head[0] = 0x6c; // 'l': little-endian
  head.writeUInt16LE(11, 2);
  head.writeUInt16LE(0, 4);
  head.writeUInt16LE(name.length, 6);
  head.writeUInt16LE(data.length, 8);
  return Buffer.concat([
    head,
    name,
    Buffer.alloc(pad4(name.length)),
    data,
    Buffer.alloc(pad4(data.length)),
  ]);
}

/** InternAtom(only-if-exists) for `name`. */
export function internAtomRequest(name: string): Buffer {
  const n = Buffer.from(name, 'latin1');
  const req = Buffer.alloc(8);
  req[0] = 16;
  req[1] = 1; // only if exists: never create the atom just by asking
  req.writeUInt16LE((8 + n.length + pad4(n.length)) / 4, 2);
  req.writeUInt16LE(n.length, 4);
  return Buffer.concat([req, n, Buffer.alloc(pad4(n.length))]);
}

/** GetSelectionOwner(atom). */
export function selectionOwnerRequest(atom: number): Buffer {
  const req = Buffer.alloc(8);
  req[0] = 23;
  req.writeUInt16LE(2, 2);
  req.writeUInt32LE(atom >>> 0, 4);
  return req;
}

/**
 * Asks the X server whether a compositing manager owns `_NET_WM_CM_S<screen>`.
 * Resolves true/false, or null when it can't tell (no DISPLAY, a remote
 * display, auth refused, timeout) — the caller then picks the safe default.
 */
export function probeCompositor(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 1000,
  /** Tests: talk to this socket instead of the display's. */
  socketPath?: string,
): Promise<boolean | null> {
  const disp = parseDisplay(env['DISPLAY']);
  if (!disp?.socket) return Promise.resolve(null);
  const socket = socketPath ?? disp.socket;
  let cookie: Buffer | null = null;
  try {
    const file = env['XAUTHORITY'] || path.join(os.homedir(), '.Xauthority');
    cookie = pickCookie(parseXauthority(fs.readFileSync(file)), disp.display, os.hostname());
  } catch {
    // No authority file: servers started without -auth accept a bare connect.
  }

  return new Promise((resolve) => {
    let settled = false;
    let buf = Buffer.alloc(0);
    let stage: 'setup' | 'atom' | 'owner' = 'setup';
    const sock = net.createConnection(socket);
    const done = (v: boolean | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    sock.on('error', () => done(null));
    sock.on('close', () => done(null));
    sock.on('connect', () => sock.write(setupRequest(cookie)));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'setup') {
        if (buf.length < 8) return;
        const total = 8 + buf.readUInt16LE(6) * 4;
        if (buf.length < total) return;
        if (buf[0] !== 1) return done(null); // refused or wants more auth
        buf = buf.subarray(total);
        stage = 'atom';
        sock.write(internAtomRequest(`_NET_WM_CM_S${disp.screen}`));
      }
      if (stage === 'atom') {
        if (buf.length < 32) return;
        if (buf[0] !== 1) return done(null);
        const atom = buf.readUInt32LE(8);
        buf = buf.subarray(32);
        // The atom has never been interned: no compositor has ever run here.
        if (atom === 0) return done(false);
        stage = 'owner';
        sock.write(selectionOwnerRequest(atom));
      }
      if (stage === 'owner') {
        if (buf.length < 32) return;
        if (buf[0] !== 1) return done(null);
        done(buf.readUInt32LE(8) !== 0);
      }
    });
  });
}
