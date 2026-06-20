// Generates app icons (no external deps) using raw PNG encoding via zlib.
// Motif (DESIGN.md "Ledger" theme): a printed-report bar chart — a paper sheet
// in a hard ink frame with a yellow header band and ascending ink bars, the
// peak in action-orange. Square corners, no gradients, no glow.
//
// Output:
//   build/icon.png       512  (electron-builder source / Linux)
//   build/icon.ico       256  (Windows)
//   resources/icon.png   256  (runtime window + tray + macOS dock in dev)
//   build/icon.icns           (macOS, only when run on macOS via iconutil)
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

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

// ── Palette (DESIGN.md "Ledger" theme — calm warm variant) ──────────────────────
const PAPER = [240, 233, 218]; // #F0E9DA cream
const INK = [43, 39, 34]; // #2B2722 warm charcoal
const YELLOW = [230, 210, 160]; // #E6D2A0 muted-mustard header band
const ORANGE = [194, 94, 58]; // #C25E3A muted terracotta accent

// Ascending bar heights (fraction of chart span). The tallest is the "peak".
const HEIGHTS = [0.36, 0.56, 0.78, 1.0];

/**
 * A printed-report bar chart: a paper sheet inside a hard ink frame, a yellow
 * header band, and ascending ink bars with the peak in action-orange. Crisp,
 * square corners — no anti-aliasing needed for axis-aligned rectangles.
 */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const R = (n) => Math.round(n * size);

  const frame = Math.max(2, R(0.05)); // outer ink border
  const inner0 = frame;
  const inner1 = size - frame;
  const bandTop = inner0;
  const bandH = R(0.2);
  const bandBot = bandTop + bandH;
  const rule = Math.max(2, R(0.022)); // ink rule under the header band

  // Chart geometry (below the band).
  const chartTop = bandBot + R(0.08);
  const baseline = inner1 - R(0.09);
  const span = baseline - chartTop;
  const baseRule = Math.max(2, R(0.02));
  const left = R(0.2);
  const right = size - R(0.2);
  const chartW = right - left;
  const n = HEIGHTS.length;
  const gapFrac = 0.46;
  const barW = chartW / (n + (n - 1) * gapFrac);
  const gap = barW * gapFrac;
  const bars = HEIGHTS.map((frac, i) => ({
    x0: left + i * (barW + gap),
    x1: left + i * (barW + gap) + barW,
    top: baseline - frac * span,
    peak: frac >= 1,
  }));

  const put = (x, y, c) => {
    const i = (y * size + x) * 4;
    rgba[i] = c[0];
    rgba[i + 1] = c[1];
    rgba[i + 2] = c[2];
    rgba[i + 3] = 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c;
      const inFrame = x < inner0 || x >= inner1 || y < inner0 || y >= inner1;
      if (inFrame) {
        c = INK;
      } else if (y < bandBot && y >= bandBot - rule) {
        c = INK; // rule under the header band
      } else if (y < bandBot) {
        c = YELLOW; // header band
      } else {
        c = PAPER; // sheet
        // Baseline rule.
        if (y >= baseline && y < baseline + baseRule && x >= left && x < right) c = INK;
        // Bars.
        for (const b of bars) {
          if (x >= b.x0 && x < b.x1 && y >= b.top && y < baseline) {
            c = b.peak ? ORANGE : INK;
            break;
          }
        }
      }
      put(x, y, c);
    }
  }
  return rgba;
}

// ── Write ───────────────────────────────────────────────────────────────────
mkdirSync(join(root, 'build'), { recursive: true });
mkdirSync(join(root, 'resources'), { recursive: true });

writeFileSync(join(root, 'build', 'icon.png'), encodePng(512, drawIcon(512)));
writeFileSync(join(root, 'build', 'icon.ico'), encodeIco(encodePng(256, drawIcon(256))));
writeFileSync(join(root, 'resources', 'icon.png'), encodePng(256, drawIcon(256)));
console.log('✓ build/icon.png (512), build/icon.ico (256), resources/icon.png (256)');

// macOS .icns — only when iconutil is available (i.e. building on a Mac).
if (process.platform === 'darwin') {
  const iconset = join(root, 'build', 'icon.iconset');
  // name → pixel size, per Apple's .iconset convention.
  const variants = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];
  try {
    rmSync(iconset, { recursive: true, force: true });
    mkdirSync(iconset, { recursive: true });
    const cache = new Map();
    for (const [name, px] of variants) {
      if (!cache.has(px)) cache.set(px, encodePng(px, drawIcon(px)));
      writeFileSync(join(iconset, name), cache.get(px));
    }
    const res = spawnSync(
      'iconutil',
      ['-c', 'icns', iconset, '-o', join(root, 'build', 'icon.icns')],
      { stdio: 'inherit' },
    );
    rmSync(iconset, { recursive: true, force: true });
    if (res.status === 0) console.log('✓ build/icon.icns (macOS)');
    else console.warn('! iconutil failed — skipping icon.icns');
  } catch (err) {
    console.warn('! Could not generate icon.icns:', err.message);
  }
}
