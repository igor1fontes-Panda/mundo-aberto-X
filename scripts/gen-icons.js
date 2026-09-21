/* Gera os ícones PNG do PWA (public/icon-192.png e public/icon-512.png).
   Puro Node (zlib + CRC32 manual) — sem dependências, determinístico.
   Uso: node scripts/gen-icons.js  (corrido automaticamente pelo `gen`) */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Desenha o ícone: fundo escuro + "X" âmbar (marca MUN-X), zona segura para máscara
function renderIcon(size) {
  const bg = [2, 6, 23, 255];      // #020617
  const fg = [251, 191, 36, 255];  // #fbbf24
  const pad = size * 0.18;         // zona segura (maskable)
  const half = (size * 0.14) / 2;  // meia-espessura do traço
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filtro: none
    for (let x = 0; x < size; x++) {
      const d1 = Math.abs(x - y) / Math.SQRT2;
      const d2 = Math.abs(x + y - size) / Math.SQRT2;
      const dentro = x >= pad && x <= size - pad && y >= pad && y <= size - pad;
      const amber = dentro && (d1 < half || d2 < half);
      const px = amber ? fg : bg;
      raw[o++] = px[0]; raw[o++] = px[1]; raw[o++] = px[2]; raw[o++] = px[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, renderIcon(size));
  console.log(`${path.relative(process.cwd(), file)} gerado (${size}x${size})`);
}
