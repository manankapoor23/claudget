// Generates app icons (no external deps) using raw PNG encoding via zlib.
// Output: build/icon.png (512), build/icon.ico (256), resources/icon.png (256).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── PNG encoding ────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 0 => 256
  entry[1] = 0; // height 0 => 256
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // data offset
  return Buffer.concat([header, entry, png]);
}

// ── Drawing ─────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];
const clamp01 = (n) => Math.max(0, Math.min(1, n));

function roundedRectAlpha(x, y, size) {
  const pad = size * 0.06;
  const r = size * 0.22;
  const halfW = (size - 2 * pad) / 2;
  const halfH = (size - 2 * pad) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const qx = Math.abs(x - cx) - (halfW - r);
  const qy = Math.abs(y - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return clamp01(0.5 - outside);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const bgTop = [13, 18, 28];
  const bgBot = [18, 26, 46];
  const track = [38, 46, 66];
  const v1 = [56, 189, 248]; // sky
  const v2 = [129, 140, 248]; // indigo
  const value = 0.68;
  const outerR = size * 0.345;
  const innerR = size * 0.235;
  const start = 135;
  const sweep = 270;
  const dotR = size * 0.05;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rectA = roundedRectAlpha(x, y, size);
      if (rectA <= 0) continue;
      let col = mix(bgTop, bgBot, y / size);
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      if (dist >= innerR - 1 && dist <= outerR + 1) {
        let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (ang < 0) ang += 360;
        const t = ((ang - start + 360) % 360) / sweep;
        if (t >= 0 && t <= 1) {
          const edge = Math.min(dist - innerR, outerR - dist);
          const ea = clamp01(edge + 0.75);
          if (t <= value) col = mix(col, mix(v1, v2, t / value), ea);
          else col = mix(col, track, ea * 0.9);
        }
      }
      if (dist <= dotR) col = mix(v1, v2, 0.5);

      const i = (y * size + x) * 4;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = Math.round(255 * rectA);
    }
  }
  return rgba;
}

// ── Write ───────────────────────────────────────────────────────────────────
mkdirSync(join(root, 'build'), { recursive: true });
mkdirSync(join(root, 'resources'), { recursive: true });

const png512 = encodePng(512, drawIcon(512));
const png256 = encodePng(256, drawIcon(256));

writeFileSync(join(root, 'build', 'icon.png'), png512);
writeFileSync(join(root, 'build', 'icon.ico'), encodeIco(png256));
writeFileSync(join(root, 'resources', 'icon.png'), png256);

console.log('✓ Generated build/icon.png (512), build/icon.ico (256), resources/icon.png (256)');
