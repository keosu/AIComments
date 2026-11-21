import { searchOrder, geminiGrounded } from './llm.mjs';
import { normalizeUrl, truncate, stripTags, log } from './util.mjs';

const UA = 'Mozilla/5.0 (compatible; AIFrontierNotesBot/1.0; +https://github.com)';

async function resolveRedirect(url) {
  if (!/grounding-api-redirect|vertexaisearch/.test(url)) return url;
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    return res.headers.get('location') || url;
  } catch {
    return url;
  }
}

const engines = {
  async tavily(query, { days }) {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return null;
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ api_key: key, query, topic: days ? 'news' : 'general', days, max_results: 8 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`tavily HTTP ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((x) => ({ title: x.title, url: x.url, snippet: truncate(x.content || '', 400) }));
  },

  async gemini(query, { days }) {
    if (!process.env.GEMINI_API_KEY) return null;
    const out = await geminiGrounded(
      `Search the web${days ? ` for the past ${days} days` : ''}: ${query}\nList the most relevant, substantive findings with one factual sentence each. Prefer primary sources (official blogs, papers, repositories).`,
    );
    if (!out) return null;
    const results = [];
    for (const c of out.chunks.slice(0, 8)) {
      results.push({ title: c.title || '', url: await resolveRedirect(c.uri), snippet: '' });
    }
    if (results.length) results[0].snippet = truncate(out.text, 1200);
    return results;
  },

  async zhipu(query) {
    const key = process.env.ZHIPU_API_KEY;
    if (!key) return null;
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.ZHIPU_SEARCH_MODEL || 'glm-4-flash',
        messages: [{ role: 'user', content: query }],
        tools: [{ type: 'web_search', web_search: { enable: true, search_result: true, search_query: query } }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`zhipu search HTTP ${res.status}`);
    const data = await res.json();
    return (data.web_search || []).map((x) => ({ title: x.title, url: x.link, snippet: truncate(stripTags(x.content || ''), 400) }));
  },

  async hn(query, { days = 14 }) {
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since},points>40&hitsPerPage=8`;
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`hn HTTP ${res.status}`);
    const data = await res.json();
    return (data.hits || [])
      .filter((h) => h.url)
      .map((h) => ({ title: h.title, url: h.url, snippet: `Hacker News ${h.points} points, ${h.num_comments} comments` }));
  },
};

/** Web search with engine fallback; always returns an array (possibly empty). */
export async function webSearch(query, { days } = {}) {
  for (const name of searchOrder()) {
    const fn = engines[name];
    if (!fn) continue;
    try {
      const out = await fn(query, { days });
      if (out && out.length) {
        log(`  search[${name}] "${truncate(query, 50)}" → ${out.length}`);
        const seen = new Set();
        return out
          .filter((x) => x.url && /^https?:/.test(x.url))
          .filter((x) => {
            const k = normalizeUrl(x.url);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map((x) => ({ ...x, engine: name }));
      }
    } catch (e) {
      log(`  ! search[${name}] ${e.message}`);
    }
  }
  return [];
}
