import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const r = (...p) => path.join(ROOT, ...p);

export function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

export const hash = (s, n = 10) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n);

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function stripTags(html = '') {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function decodeEntities(s = '') {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return named[e.toLowerCase()] ?? m;
  });
}

export const truncate = (s = '', n = 200) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

export function slugify(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function asciiSlug(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function dateInTZ(d = new Date(), timeZone = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function normDate(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function formatDateZh(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

export function readingMinutes(text = '') {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 450 + words / 220));
}

export function normalizeUrl(u = '') {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_src$|source$|fbclid$|gclid$)/i.test(k)) url.searchParams.delete(k);
    }
    url.hostname = url.hostname.replace(/^www\./, '');
    let s = url.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s.replace(/^http:/, 'https:');
  } catch {
    return u;
  }
}

export function hostOf(u = '') {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}
