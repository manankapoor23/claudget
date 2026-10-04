// Builds the Windows/Linux tray icons from the app icon (build/icon.png).
//
// The app icon has generous padding around the mark, which is right for a
// Dock or Start menu tile and wrong for a 16 px notification-area slot: shrunk
// whole, the mark came out about 9 px across, soft and hard to find. This
// crops to the mark itself and resamples it (area-averaged, in premultiplied
// alpha) to each size Windows asks for at 100/125/150/200% scaling. Electron
// picks the right one from the @Nx suffixes.
//
//   node packages/desktop/scripts/make-tray-icons.mjs
//
// No dependencies: PNG decoding and encoding are done here with node:zlib.
// macOS doesn't use these; it draws a template glyph (see main/tray.ts).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, '../build/icon.png');
const OUT = path.join(HERE, '../resources/tray');

/** Output name → pixel size. `tray.png` is the 100% image. */
const SIZES = {
  'tray.png': 16,
  'tray@1.25x.png': 20,
  'tray@1.5x.png': 24,
  'tray@2x.png': 32,
  'tray@3x.png': 48,
};

function decodePng(file) {
  const b = fs.readFileSync(file);
  let p = 8;
  let w = 0;
  let h = 0;
  let colourType = 0;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('ascii', p + 4, p + 8);
    const d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      if (d[8] !== 8) throw new Error('only 8-bit PNGs are supported');
      colourType = d[9];
    }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported PNG colour type ${colourType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rgba = new Float64Array(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (a + up) >> 1;
      else if (filter === 4) {
        const pp = a + up - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - up);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const alpha = bpp === 4 ? line[x * bpp + 3] / 255 : 1;
      // Premultiplied, so averaging never bleeds colour out of clear pixels.
      for (let k = 0; k < 3; k++) rgba[o + k] = (line[x * bpp + k] / 255) * alpha;
      rgba[o + 3] = alpha;
    }
    prev = line;
  }
  return { w, h, rgba };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba8) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    rgba8.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The square around the mark: its alpha bounding box, centred. */
function markSquare({ w, h, rgba }) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 0.02) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  return { x: (x0 + x1 + 1) / 2 - side / 2, y: (y0 + y1 + 1) / 2 - side / 2, side };
}

/** Exact area-average of the source square into size×size pixels. */
function resample(src, sq, size) {
  const out = Buffer.alloc(size * size * 4);
  const scale = sq.side / size;
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      const sx0 = sq.x + ox * scale;
      const sy0 = sq.y + oy * scale;
      const acc = [0, 0, 0, 0];
      let area = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy0 + scale); y++) {
        const wy = Math.min(y + 1, sy0 + scale) - Math.max(y, sy0);
        if (wy <= 0) continue;
        for (let x = Math.floor(sx0); x < Math.ceil(sx0 + scale); x++) {
          const wx = Math.min(x + 1, sx0 + scale) - Math.max(x, sx0);
          if (wx <= 0) continue;
          const wgt = wx * wy;
          area += wgt;
          if (x < 0 || y < 0 || x >= src.w || y >= src.h) continue;
          const o = (y * src.w + x) * 4;
          for (let k = 0; k < 4; k++) acc[k] += src.rgba[o + k] * wgt;
        }
      }
      // Small sizes: steepen the alpha ramp so the bar cut-outs read as
      // edges rather than a blur. Larger sizes are left exactly averaged.
      const raw = acc[3] / area;
      const a = size <= 20 ? Math.min(1, Math.max(0, (raw - 0.5) * 1.5 + 0.5)) : raw;
      const o = (oy * size + ox) * 4;
      for (let k = 0; k < 3; k++) {
        out[o + k] = raw > 0 ? Math.round(Math.min(1, acc[k] / area / raw) * 255) : 0;
      }
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

const src = decodePng(SOURCE);
const sq = markSquare(src);
fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of Object.entries(SIZES)) {
  fs.writeFileSync(path.join(OUT, name), encodePng(size, resample(src, sq, size)));
  console.log(`${name}  ${size}x${size}`);
}
