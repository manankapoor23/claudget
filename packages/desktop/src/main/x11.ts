import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/**
 * A minimal X11 client: enough of the protocol to ask the X server two things
 * Electron can't answer reliably on Linux, over its Unix socket, with no
 * native module:
 *
 * - Is a compositing manager running? (see compositor.ts)
 * - Where is the pointer? `screen.getCursorScreenPoint()` comes from
 *   Chromium's last-seen pointer position, which on X11 goes stale while the
 *   pointer is over other programs' windows — such as the panel whose tray
 *   icon was just clicked — so it put the popover in the middle of the screen.
 *
 * Every function resolves null when it can't tell (no DISPLAY, a remote
 * display, auth refused, timeout); callers fall back to something sensible.
 */

export interface XDisplay {
  /** Unix socket path, or null for a TCP display we don't talk to. */
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

/** The root window of each screen, from a successful setup reply. */
export function parseSetupRoots(reply: Buffer): number[] {
  const vendorLen = reply.readUInt16LE(24);
  const screens = reply[28]!;
  const formats = reply[29]!;
  let p = 40 + vendorLen + pad4(vendorLen) + formats * 8;
  const roots: number[] = [];
  for (let s = 0; s < screens && p + 40 <= reply.length; s++) {
    roots.push(reply.readUInt32LE(p));
    const depths = reply[p + 39]!;
    p += 40;
    for (let d = 0; d < depths && p + 8 <= reply.length; d++) {
      const visuals = reply.readUInt16LE(p + 2);
      p += 8 + visuals * 24;
    }
  }
  return roots;
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

/** QueryPointer(window). */
export function queryPointerRequest(window: number): Buffer {
  const req = Buffer.alloc(8);
  req[0] = 38;
  req.writeUInt16LE(2, 2);
  req.writeUInt32LE(window >>> 0, 4);
  return req;
}

export interface XSession {
  /** The root window of the display's screen (DISPLAY=:n.<screen>). */
  root: number;
  screen: number;
  /** Sends one request and resolves its reply, or null on an X error. */
  request: (req: Buffer) => Promise<Buffer | null>;
  close: () => void;
}

/**
 * Connects and runs `fn` with a session, closing it after. Resolves null when
 * there's no local X server to talk to, it refuses us, or it's too slow.
 */
export function withX11<T>(
  fn: (x: XSession) => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 1000,
  /** Tests: talk to this socket instead of the display's. */
  socketPath?: string,
): Promise<T | null> {
  const disp = parseDisplay(env['DISPLAY']);
  if (!disp?.socket) return Promise.resolve(null);
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
    let setupDone = false;
    const pending: Array<(reply: Buffer | null) => void> = [];
    const sock = net.createConnection(socketPath ?? disp.socket!);
    const done = (v: T | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      for (const p of pending.splice(0)) p(null);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    sock.on('error', () => done(null));
    sock.on('close', () => done(null));
    sock.on('connect', () => sock.write(setupRequest(cookie)));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!setupDone) {
        if (buf.length < 8) return;
        const total = 8 + buf.readUInt16LE(6) * 4;
        if (buf.length < total) return;
        if (buf[0] !== 1) return done(null); // refused, or wants more auth
        const roots = parseSetupRoots(buf.subarray(0, total));
        buf = buf.subarray(total);
        setupDone = true;
        const root = roots[disp.screen];
        if (root === undefined) return done(null);
        const session: XSession = {
          root,
          screen: disp.screen,
          request: (req) =>
            new Promise((res) => {
              pending.push(res);
              sock.write(req);
            }),
          close: () => done(null),
        };
        fn(session).then(done, () => done(null));
        return;
      }
      // Replies carry extra data in 4-byte units; errors and events are 32.
      while (buf.length >= 32) {
        const kind = buf[0]!;
        const total = kind === 1 ? 32 + buf.readUInt32LE(4) * 4 : 32;
        if (buf.length < total) return;
        const msg = buf.subarray(0, total);
        buf = buf.subarray(total);
        if (kind > 1) continue; // an event; we never ask for any
        pending.shift()?.(kind === 1 ? msg : null);
      }
    });
  });
}

/** The pointer's position on the root window, in X (device) pixels. */
export function queryPointer(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 300,
  socketPath?: string,
): Promise<{ x: number; y: number } | null> {
  return withX11(
    async (x) => {
      const reply = await x.request(queryPointerRequest(x.root));
      if (!reply) return null;
      return { x: reply.readInt16LE(16), y: reply.readInt16LE(18) };
    },
    env,
    timeoutMs,
    socketPath,
  );
}
