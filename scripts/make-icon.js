'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function bmpFromRGBA(width, height, rgba) {
  const rowXor = Math.ceil((width * 4) / 4) * 4;
  const rowAnd = Math.ceil(width / 32) * 4;
  const xorSize = rowXor * height;
  const andSize = rowAnd * height;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(xorSize + andSize, 20);
  const pixels = Buffer.alloc(xorSize + andSize, 0);
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * width * 4;
    const dst = y * rowXor;
    for (let x = 0; x < width; x += 1) {
      const s = srcRow + x * 4;
      const d = dst + x * 4;
      pixels[d] = rgba[s + 2];
      pixels[d + 1] = rgba[s + 1];
      pixels[d + 2] = rgba[s];
      pixels[d + 3] = rgba[s + 3];
    }
  }
  return Buffer.concat([header, pixels]);
}

function buildICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dirEntries = [];
  const images = [];
  for (const item of entries) {
    const size = item.width >= 256 ? 0 : item.width;
    const entry = Buffer.alloc(16);
    entry[0] = size;
    entry[1] = size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.image.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    images.push(item.image);
    offset += item.image.length;
  }
  return Buffer.concat([header, ...dirEntries, ...images]);
}

const BOLT = [
  [0.56, 0.04], [0.22, 0.56], [0.44, 0.56],
  [0.36, 0.96], [0.78, 0.40], [0.53, 0.40], [0.70, 0.04]
];

function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const bg = [[45, 212, 191], [16, 122, 110]];
  const fg = [4, 33, 29];
  const ss = 3;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const px = (x + (sx + 0.5) / ss) / size;
          const py = (y + (sy + 0.5) / ss) / size;
          const dx = Math.max(radius - px * size, 0, px * size - (size - radius));
          const dy = Math.max(radius - py * size, 0, py * size - (size - radius));
          const insideBg = dx * dx + dy * dy <= radius * radius && px >= 0 && px <= 1 && py >= 0 && py <= 1;
          if (!insideBg) continue;
          const t = (px + py) / 2;
          const bgc = [bg[0][0] + (bg[1][0] - bg[0][0]) * t, bg[0][1] + (bg[1][1] - bg[0][1]) * t, bg[0][2] + (bg[1][2] - bg[0][2]) * t];
          const bolt = inPolygon(px, py, BOLT);
          const col = bolt ? fg : bgc;
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return { width: size, height: size, rgba, png: encodePNG(size, size, rgba) };
}

function main() {
  const outDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  const sizes = [16, 32, 48, 64, 256];
  const entries = sizes.map((s) => {
    const r = render(s);
    return { width: s, image: bmpFromRGBA(r.width, r.height, r.rgba) };
  });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), buildICO(entries));
  fs.writeFileSync(path.join(outDir, 'icon.png'), render(256).png);
  console.log('icon.ico (BMP ' + sizes.join('/') + ') + icon.png (256) written to assets/');
}

main();
