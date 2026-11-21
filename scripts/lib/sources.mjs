import { XMLParser } from 'fast-xml-parser';
import { normalizeUrl, stripTags, truncate, hash, log, decodeEntities } from './util.mjs';
import { webSearch } from './search.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 AIFrontierNotes/1.0';
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: false });

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  return v['#text'] != null ? String(v['#text']) : '';
};
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

async function get(url, { timeout = 25_000, accept } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...(accept ? { accept } : {}) }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function atomLink(links) {
  const list = arr(links);
  const alt = list.find((l) => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate')) || list[0];
  return typeof alt === 'string' ? alt : alt?.['@_href'] || '';
}

export function parseFeed(xmlText) {
  const doc = xml.parse(xmlText);
  const channel = doc.rss?.channel || doc['rdf:RDF'];
  const raw = channel ? arr(channel.item || doc['rdf:RDF']?.item) : arr(doc.feed?.entry);
  return raw.map((it) => {
    const link = channel ? text(it.link) || text(it.guid) : atomLink(it.link);
    const date = text(it.pubDate) || text(it.published) || text(it.updated) || text(it['dc:date']);
    const summary = text(it.description) || text(it.summary) || text(it['content:encoded']) || text(it.content);
    const unwrap = (s) => s.replace(/^<!\[CDATA\[|\]\]>$/g, '');
    return {
      title: stripTags(decodeEntities(unwrap(text(it.title)))),
      url: decodeEntities(link).trim(),
      date: date && !isNaN(new Date(date)) ? new Date(date) : null,
      snippet: truncate(stripTags(decodeEntities(unwrap(summary))), 500),
    };
  });
}

async function fromFeeds(feeds, since) {
  const out = [];
  await Promise.all(
    feeds.map(async (f) => {
      try {
        const res = await get(f.url, { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' });
        const items = parseFeed(await res.text()).filter((i) => i.url && i.title && (!i.date || i.date >= since));
        items.slice(0, 15).forEach((i) => out.push({ ...i, source: f.name, kind: f.kind, weight: f.weight ?? 1 }));
        log(`  feed ${f.name}: ${items.length}`);
      } catch (e) {
        log(`  ! feed ${f.name}: ${e.message}`);
      }
    }),
  );
  return out;
}

async function fromHFPapers(cfg, since) {
  if (!cfg?.enabled) return [];
  const days = [];
  for (let d = new Date(); d >= since; d = new Date(d - 86400_000)) days.push(d.toISOString().slice(0, 10));
  const all = [];
  for (const day of days) {
    try {
      const res = await get(`https://huggingface.co/api/daily_papers?date=${day}&limit=${cfg.perDay || 50}`);
      const list = await res.json();
      for (const p of list) {
        const paper = p.paper || p;
        if (!paper?.id) continue;
        all.push({
          title: paper.title || p.title,
          url: `https://arxiv.org/abs/${paper.id}`,
          date: new Date(p.publishedAt || paper.publishedAt || day),
          snippet: truncate((paper.ai_summary ? paper.ai_summary + ' ' : '') + (paper.summary || ''), 600),
          source: 'HF Daily Papers',
          kind: 'paper',
          weight: cfg.weight ?? 2,
          metric: paper.upvotes || 0,
          arxiv: paper.id,
        });
      }
    } catch (e) {
      log(`  ! hf papers ${day}: ${e.message}`);
    }
  }
  const seen = new Set();
  const uniq = all.filter((p) => !seen.has(p.arxiv) && seen.add(p.arxiv));
  uniq.sort((a, b) => b.metric - a.metric);
  log(`  hf papers: ${uniq.length} (keep ${cfg.keep})`);
  return uniq.slice(0, cfg.keep || 25);
}

async function fromHN(cfg, since) {
  if (!cfg?.enabled) return [];
  const t = Math.floor(since.getTime() / 1000);
  const out = [];
  await Promise.all(
    cfg.queries.map(async (q) => {
      try {
        const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${t},points>${cfg.minPoints || 100}&hitsPerPage=20`;
        const data = await (await get(url)).json();
        for (const h of data.hits || []) {
          if (!h.url) continue;
          out.push({
            title: h.title,
            url: h.url,
            date: new Date(h.created_at),
            snippet: `Hacker News 讨论：${h.points} points，${h.num_comments} 条评论。`,
            source: 'Hacker News',
            kind: 'discussion',
            weight: cfg.weight ?? 1,
            metric: h.points,
            discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
          });
        }
      } catch (e) {
        log(`  ! hn "${q}": ${e.message}`);
      }
    }),
  );
  log(`  hacker news: ${out.length}`);
  return out;
}

async function fromSearch(cfg, days) {
  if (!cfg?.enabled) return [];
  const out = [];
  for (const q of cfg.queries || []) {
    const results = await webSearch(q, { days });
    if (results[0]?.engine === 'hn') continue;
    for (const r of results) {
      const date = r.date && !isNaN(new Date(r.date)) ? new Date(r.date) : null;
      out.push({ title: r.title || r.url, url: r.url, date, snippet: r.snippet, source: `搜索：${r.engine}`, kind: 'news', weight: 1.5 });
    }
  }
  return out;
}

function score(c, now) {
  const ageDays = c.date ? Math.max(0, (now - c.date) / 86400_000) : 3;
  const metric = c.metric ? Math.log10(c.metric + 1) : 0;
  return c.weight * 2 + metric * (c.kind === 'paper' ? 1.6 : 1.2) - ageDays * 0.25;
}

export async function collect(sourcesCfg, { windowDays = 6 } = {}) {
  const now = new Date();
  const since = new Date(now - windowDays * 86400_000);
  const parts = await Promise.all([
    fromFeeds(sourcesCfg.feeds || [], since),
    fromHFPapers(sourcesCfg.huggingfacePapers, since),
    fromHN(sourcesCfg.hackerNews, since),
    fromSearch(sourcesCfg.webSearch, windowDays),
  ]);
  const byKey = new Map();
  for (const c of parts.flat()) {
    if (!c.url || !c.title) continue;
    const key = normalizeUrl(c.url);
    const prev = byKey.get(key);
    const item = { ...c, key, id: hash(key, 6), title: decodeEntities(c.title).trim(), score: score(c, now) };
    if (!prev || item.score > prev.score) byKey.set(key, prev ? { ...item, score: item.score + 0.5 } : item);
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

/** Fetch readable text of a page (arXiv → HTML full text when available). */
export async function fetchText(url, maxChars = 6000) {
  const arxiv = url.match(/arxiv\.org\/(?:abs|pdf|html)\/([\w.\-/]+?)(?:v\d+)?(?:\.pdf)?$/);
  const candidates = arxiv ? [`https://arxiv.org/html/${arxiv[1]}`, `https://arxiv.org/abs/${arxiv[1]}`] : [url];
  for (const u of candidates) {
    try {
      const res = await get(u, { timeout: 30_000 });
      const type = res.headers.get('content-type') || '';
      if (!/html|xml|text/.test(type)) continue;
      const html = await res.text();
      const t = extractText(html);
      if (t.length > 400) return truncate(t, maxChars);
    } catch {}
  }
  return '';
}

export function extractText(html) {
  let h = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<math[\s\S]*?<\/math>/gi, ' [公式] ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const main = h.match(/<article[\s\S]*?<\/article>/i)?.[0] || h.match(/<main[\s\S]*?<\/main>/i)?.[0];
  if (main && main.length > 2000) h = main;
  h = h.replace(/<\/(p|h[1-6]|li|div|section|br|tr)>/gi, '\n');
  return stripTags(h.replace(/\n/g, ' ¶ ')).replace(/(\s*¶\s*)+/g, '\n').trim();
}
