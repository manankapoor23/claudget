import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { probeCompositor } from './compositor';
import {
  internAtomRequest,
  parseDisplay,
  parseSetupRoots,
  parseXauthority,
  pickCookie,
  queryPointer,
  queryPointerRequest,
  selectionOwnerRequest,
  setupRequest,
} from './x11';

describe('parseDisplay', () => {
  it('reads local displays and screens', () => {
    expect(parseDisplay(':0')).toEqual({ socket: '/tmp/.X11-unix/X0', display: 0, screen: 0 });
    expect(parseDisplay(':99.1')).toEqual({ socket: '/tmp/.X11-unix/X99', display: 99, screen: 1 });
    expect(parseDisplay('unix:2')?.socket).toBe('/tmp/.X11-unix/X2');
  });
  it("doesn't probe remote or missing displays", () => {
    expect(parseDisplay('localhost:10.0')?.socket).toBeNull();
    expect(parseDisplay(undefined)).toBeNull();
    expect(parseDisplay('wayland-0')).toBeNull();
  });
});

function xauthEntry(family: number, addr: string, num: string, name: string, data: Buffer): Buffer {
  const f = (b: Buffer): Buffer => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(b.length);
    return Buffer.concat([len, b]);
  };
  const fam = Buffer.alloc(2);
  fam.writeUInt16BE(family);
  return Buffer.concat([
    fam,
    f(Buffer.from(addr)),
    f(Buffer.from(num)),
    f(Buffer.from(name)),
    f(data),
  ]);
}

describe('Xauthority', () => {
  const cookie = Buffer.from('0123456789abcdef');
  const other = Buffer.from('ffffffffffffffff');
  const file = Buffer.concat([
    xauthEntry(256, 'box', '1', 'MIT-MAGIC-COOKIE-1', other),
    xauthEntry(256, 'box', '0', 'MIT-MAGIC-COOKIE-1', cookie),
  ]);
  it('parses entries and picks the one for this host and display', () => {
    const entries = parseXauthority(file);
    expect(entries).toHaveLength(2);
    expect(pickCookie(entries, 0, 'box')).toEqual(cookie);
    expect(pickCookie(entries, 1, 'box')).toEqual(other);
    expect(pickCookie(entries, 7, 'box')).toBeNull();
  });
  it('accepts a wildcard entry and survives a truncated file', () => {
    const wild = parseXauthority(xauthEntry(65535, '', '', 'MIT-MAGIC-COOKIE-1', cookie));
    expect(pickCookie(wild, 3, 'anything')).toEqual(cookie);
    expect(parseXauthority(file.subarray(0, file.length - 3))).toHaveLength(1);
  });
});

describe('request encoding', () => {
  it('pads every request to 4 bytes with the length in words', () => {
    const setup = setupRequest(Buffer.alloc(16, 1));
    expect(setup[0]).toBe(0x6c);
    expect(setup.readUInt16LE(2)).toBe(11);
    expect(setup.length % 4).toBe(0);
    const atom = internAtomRequest('_NET_WM_CM_S0');
    expect(atom[0]).toBe(16);
    expect(atom.readUInt16LE(2) * 4).toBe(atom.length);
    const pointer = queryPointerRequest(0x200);
    expect(pointer[0]).toBe(38);
    expect(pointer.readUInt16LE(2) * 4).toBe(pointer.length);
    const owner = selectionOwnerRequest(300);
    expect(owner.readUInt16LE(2) * 4).toBe(owner.length);
    expect(owner.readUInt32LE(4)).toBe(300);
  });
});

/** A setup reply like Xvfb's: a vendor string, two formats, and `roots.length` screens. */
function setupReply(roots: number[]): Buffer {
  const vendor = Buffer.from('The X.Org Foundation'); // 20 bytes
  const formats = Buffer.alloc(16);
  const screens = roots.map((root, i) => {
    // One depth with one visual on screen 0, none on the others: both shapes walked.
    const depths = i === 0 ? 1 : 0;
    const s = Buffer.alloc(40 + (depths ? 8 + 24 : 0));
    s.writeUInt32LE(root, 0);
    s[39] = depths;
    if (depths) s.writeUInt16LE(1, 42);
    return s;
  });
  const fixed = Buffer.alloc(40);
  fixed[0] = 1;
  fixed.writeUInt16LE(11, 2);
  fixed.writeUInt16LE(vendor.length, 24);
  fixed[28] = roots.length;
  fixed[29] = 2;
  const body = Buffer.concat([fixed.subarray(8), vendor, formats, ...screens]);
  fixed.writeUInt16LE(body.length / 4, 6);
  return Buffer.concat([fixed.subarray(0, 8), body]);
}

describe('parseSetupRoots', () => {
  it('walks vendor, formats, screens and depths to each root', () => {
    expect(parseSetupRoots(setupReply([0x123]))).toEqual([0x123]);
    expect(parseSetupRoots(setupReply([0x123, 0x456]))).toEqual([0x123, 0x456]);
  });
});

/**
 * A minimal X server: accepts the setup, answers InternAtom,
 * GetSelectionOwner and QueryPointer from the given tables, like Xvfb would.
 */
function fakeX(
  atoms: Record<string, number>,
  owners: Record<number, number>,
  pointer: { x: number; y: number } = { x: 0, y: 0 },
  roots = [0x200, 0x300],
): Promise<{ socket: string; close: () => void }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-x11-'));
  const socket = path.join(dir, 'X0');
  const server = net.createServer((c) => {
    let buf = Buffer.alloc(0);
    let setup = false;
    c.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!setup) {
        if (buf.length < 12) return;
        const n = buf.readUInt16LE(6);
        const dl = buf.readUInt16LE(8);
        const total = 12 + n + ((4 - (n % 4)) % 4) + dl + ((4 - (dl % 4)) % 4);
        if (buf.length < total) return;
        buf = buf.subarray(total);
        setup = true;
        c.write(setupReply(roots));
      }
      while (buf.length >= 4) {
        const len = buf.readUInt16LE(2) * 4;
        if (buf.length < len) return;
        const req = buf.subarray(0, len);
        buf = buf.subarray(len);
        const reply = Buffer.alloc(32);
        reply[0] = 1;
        if (req[0] === 16) {
          const name = req.subarray(8, 8 + req.readUInt16LE(4)).toString('latin1');
          reply.writeUInt32LE(atoms[name] ?? 0, 8);
        } else if (req[0] === 23) {
          reply.writeUInt32LE(owners[req.readUInt32LE(4)] ?? 0, 8);
        } else if (req[0] === 38) {
          if (!roots.includes(req.readUInt32LE(4))) reply[0] = 0; // BadWindow
          reply.writeInt16LE(pointer.x, 16);
          reply.writeInt16LE(pointer.y, 18);
        }
        // An unsolicited event first, which a client must skip.
        const event = Buffer.alloc(32);
        event[0] = 28;
        c.write(Buffer.concat([event, reply]));
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(socket, () =>
      resolve({
        socket,
        close: () => {
          server.close();
          fs.rmSync(dir, { recursive: true, force: true });
        },
      }),
    ),
  );
}

describe.skipIf(process.platform === 'win32')('talking to a fake X server', () => {
  let close = (): void => {};
  afterEach(() => close());

  const probeAt = (socket: string, screen = 0): Promise<boolean | null> =>
    probeCompositor({ DISPLAY: `:0.${screen}`, XAUTHORITY: '/nonexistent' }, 2000, socket);

  it('sees a compositor that owns _NET_WM_CM_S0', async () => {
    const x = await fakeX({ _NET_WM_CM_S0: 300 }, { 300: 0x200001 });
    close = x.close;
    expect(await probeAt(x.socket)).toBe(true);
  });

  it('sees none when the selection has no owner, or the atom was never made', async () => {
    const x = await fakeX({ _NET_WM_CM_S0: 300 }, {});
    close = x.close;
    expect(await probeAt(x.socket)).toBe(false);
    const y = await fakeX({}, {});
    const r2 = await probeAt(y.socket);
    y.close();
    expect(r2).toBe(false);
  });

  it('asks about the right screen', async () => {
    const x = await fakeX({ _NET_WM_CM_S1: 301 }, { 301: 7 });
    close = x.close;
    expect(await probeAt(x.socket, 1)).toBe(true);
  });

  it('reads the pointer from the root of the right screen', async () => {
    const x = await fakeX({}, {}, { x: 1908, y: 15 });
    close = x.close;
    const env = { DISPLAY: ':0', XAUTHORITY: '/nonexistent' };
    expect(await queryPointer(env, 1000, x.socket)).toEqual({ x: 1908, y: 15 });
    expect(await queryPointer({ ...env, DISPLAY: ':0.1' }, 1000, x.socket)).toEqual({
      x: 1908,
      y: 15,
    });
    // A screen the server doesn't have.
    expect(await queryPointer({ ...env, DISPLAY: ':0.5' }, 1000, x.socket)).toBeNull();
  });

  it("can't tell when nothing is listening", async () => {
    const missing = path.join(os.tmpdir(), 'cw-no-such-x-socket');
    expect(
      await probeCompositor({ DISPLAY: ':0', XAUTHORITY: '/nonexistent' }, 500, missing),
    ).toBeNull();
    expect(await probeCompositor({}, 500)).toBeNull();
  });
});
