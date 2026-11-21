import { hash } from './util.mjs';

export const TYPE_COLORS = {
  essay: ['#f5a524', '#fb923c'],
  research: ['#22d3ee', '#60a5fa'],
  primer: ['#a78bfa', '#818cf8'],
  viewpoint: ['#fb7185', '#f472b6'],
  brief: ['#34d399', '#2dd4bf'],
};

const LABELS = { essay: 'ESSAY', research: 'RESEARCH', primer: 'PRIMER', viewpoint: 'VIEWPOINT', brief: 'BRIEFING' };
const W = 1200;
const H = 630;

function rng(seed) {
  let s = parseInt(hash(seed, 8), 16) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const f = (n) => +n.toFixed(1);

function orbits(R, [c1, c2]) {
  const cx = 600 + (R() - 0.5) * 240;
  const cy = 300 + (R() - 0.5) * 60;
  let out = '';
  const n = 5 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const rx = 90 + i * 55 + R() * 20;
    const ry = rx * (0.32 + R() * 0.18);
    const rot = -25 + R() * 50;
    out += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})" fill="none" stroke="${c1}" stroke-opacity="${f(0.75 - i * 0.09)}" stroke-width="${i === 0 ? 2.5 : 1.5}"/>`;
    const a = R() * Math.PI * 2;
    const t = (rot * Math.PI) / 180;
    const px = cx + rx * Math.cos(a) * Math.cos(t) - ry * Math.sin(a) * Math.sin(t);
    const py = cy + rx * Math.cos(a) * Math.sin(t) + ry * Math.sin(a) * Math.cos(t);
    out += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(4 + R() * 5)}" fill="${i % 2 ? c2 : '#fff'}" fill-opacity="0.9"/>`;
  }
  out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="28" fill="${c1}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="60" fill="${c1}" fill-opacity="0.15"/>`;
  return out;
}

function graph(R, [c1, c2]) {
  const pts = Array.from({ length: 30 }, () => [260 + R() * 860, 70 + R() * 460]);
  let out = '';
  const seen = new Set();
  pts.forEach((p, i) => {
    const near = pts
      .map((q, j) => [j, Math.hypot(p[0] - q[0], p[1] - q[1])])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3);
    for (const [j] of near) {
      const k = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(pts[j][0])}" y2="${f(pts[j][1])}" stroke="${c1}" stroke-opacity="${f(0.2 + R() * 0.35)}" stroke-width="1.4"/>`;
    }
  });
  pts.forEach((p, i) => {
    const hot = R() < 0.18;
    if (hot) out += `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="18" fill="${c2}" fill-opacity="0.18"/>`;
    out += `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(hot ? 7 : 3 + R() * 3)}" fill="${hot ? c2 : c1}"/>`;
  });
  return out;
}

function heatmap(R, [c1, c2]) {
  const n = 12;
  const size = 34;
  const gap = 5;
  const x0 = 640 - (n * (size + gap)) / 2 + 160;
  const y0 = 315 - (n * (size + gap)) / 2;
  let out = '';
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const v = Math.min(1, Math.pow(R(), 2.2) + (i === j ? 0.55 : 0) + (j === 0 ? 0.35 : 0));
      out += `<rect x="${f(x0 + j * (size + gap))}" y="${f(y0 + i * (size + gap))}" width="${size}" height="${size}" rx="5" fill="${v > 0.6 ? c2 : c1}" fill-opacity="${f(0.08 + v * 0.85)}"/>`;
    }
  }
  for (let k = 0; k < 3; k++) {
    const amp = 30 + R() * 40;
    const freq = 0.008 + R() * 0.01;
    const ph = R() * 6;
    const yb = 150 + k * 140 + R() * 40;
    let d = '';
    for (let x = 40; x <= 560; x += 10) d += `${x === 40 ? 'M' : 'L'}${x} ${f(yb + Math.sin(x * freq + ph) * amp)}`;
    out += `<path d="${d}" fill="none" stroke="${c1}" stroke-opacity="${f(0.55 - k * 0.12)}" stroke-width="2"/>`;
  }
  return out;
}

function voice(R, [c1, c2]) {
  let out = `<text x="150" y="380" font-family="Georgia, 'Times New Roman', serif" font-size="400" fill="${c1}" fill-opacity="0.9">“</text>`;
  const n = 64;
  const x0 = 470;
  for (let i = 0; i < n; i++) {
    const env = Math.sin((i / n) * Math.PI);
    const h = 16 + env * (60 + R() * 200);
    out += `<rect x="${f(x0 + i * 10.5)}" y="${f(315 - h / 2)}" width="5" height="${f(h)}" rx="2.5" fill="${i % 7 === 0 ? c2 : c1}" fill-opacity="${f(0.35 + env * 0.55)}"/>`;
  }
  return out;
}

function signal(R, [c1, c2]) {
  let out = `<line x1="60" y1="400" x2="1140" y2="400" stroke="${c1}" stroke-opacity="0.4" stroke-width="2"/>`;
  for (let i = 0; i < 26; i++) {
    const x = 90 + i * 41;
    const h = 20 + Math.pow(R(), 1.6) * 240;
    out += `<line x1="${x}" y1="400" x2="${x}" y2="${f(400 - h)}" stroke="${h > 180 ? c2 : c1}" stroke-width="${h > 180 ? 5 : 3}" stroke-linecap="round" stroke-opacity="${f(0.45 + h / 500)}"/>`;
    if (h > 180) out += `<circle cx="${x}" cy="${f(400 - h)}" r="9" fill="${c2}"/>`;
  }
  return out;
}

const MOTIFS = { essay: orbits, research: graph, primer: heatmap, viewpoint: voice, brief: signal };

export function coverSVG(type, seed) {
  const R = rng(`${type}:${seed}`);
  const colors = TYPE_COLORS[type] || TYPE_COLORS.essay;
  const gx = f(0.35 + R() * 0.4);
  const gy = f(0.3 + R() * 0.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a0e1a"/><stop offset="1" stop-color="#141b2e"/></linearGradient>
<radialGradient id="glow" cx="${gx}" cy="${gy}" r="0.65"><stop offset="0" stop-color="${colors[0]}" stop-opacity="0.32"/><stop offset="1" stop-color="${colors[0]}" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity="0.05"/></pattern>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${MOTIFS[type]?.(R, colors) || ''}
<text x="48" y="552" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="20" fill="#fff" fill-opacity="0.45" letter-spacing="5">${LABELS[type] || ''} · 0x${hash(seed, 6)}</text>
</svg>`;
}
