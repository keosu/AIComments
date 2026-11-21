import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG_TOP = hex('#141c30');
const BG_BOTTOM = hex('#090c14');
const RING = hex('#e9a23b');
const DOT = hex('#f4efe6');

// Geometry in unit coordinates (0..1). The mark stays within the maskable safe zone (radius 0.4).
const CX = 0.5;
const CY = 0.5;
const RING_R = 0.235;
const RING_W = 0.058;
const DOT_ANGLE = -Math.PI / 4;
const DOT_R = 0.072;
const DOT_X = CX + RING_R * Math.cos(DOT_ANGLE);
const DOT_Y = CY + RING_R * Math.sin(DOT_ANGLE);

function sample(x, y, maskable) {
  if (!maskable) {
    const rad = 0.22;
    const qx = Math.max(Math.abs(x - 0.5) - (0.5 - rad), 0);
    const qy = Math.max(Math.abs(y - 0.5) - (0.5 - rad), 0);
    if (qx * qx + qy * qy > rad * rad) return null;
  }
  const t = y;
  let c = BG_TOP.map((v, i) => v + (BG_BOTTOM[i] - v) * t);
  const dr = Math.hypot(x - CX, y - CY);
  if (Math.abs(dr - RING_R) <= RING_W / 2) c = RING;
  const dd = Math.hypot(x - DOT_X, y - DOT_Y);
  if (dd <= DOT_R + 0.03) c = BG_TOP.map((v, i) => v + (BG_BOTTOM[i] - v) * t);
  if (dd <= DOT_R) c = DOT;
  return c;
}

export function iconPNG(size, { maskable = false } = {}) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, maskable);
          if (!c) continue;
          rr += c[0]; gg += c[1]; bb += c[2]; aa++;
        }
      }
      const o = (py * size + px) * 4;
      if (aa) {
        buf[o] = Math.round(rr / aa);
        buf[o + 1] = Math.round(gg / aa);
        buf[o + 2] = Math.round(bb / aa);
      }
      buf[o + 3] = Math.round((aa / (ss * ss)) * 255);
    }
  }
  return encodePNG(size, size, buf);
}

export function iconSVG() {
  const f = (n) => +(n * 512).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141c30"/><stop offset="1" stop-color="#090c14"/></linearGradient></defs>
<rect width="512" height="512" rx="${f(0.22)}" fill="url(#g)"/>
<circle cx="${f(CX)}" cy="${f(CY)}" r="${f(RING_R)}" fill="none" stroke="#e9a23b" stroke-width="${f(RING_W)}"/>
<circle cx="${f(DOT_X)}" cy="${f(DOT_Y)}" r="${f(DOT_R + 0.03)}" fill="#10172a"/>
<circle cx="${f(DOT_X)}" cy="${f(DOT_Y)}" r="${f(DOT_R)}" fill="#f4efe6"/>
</svg>`;
}

export function logoSVG(cls = 'logo') {
  return `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="21.3" cy="10.7" r="3.4" fill="var(--bg)"/><circle cx="21.3" cy="10.7" r="2.3" fill="var(--accent)"/></svg>`;
}
