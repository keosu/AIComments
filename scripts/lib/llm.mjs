import { r, readJSON, sleep, log } from './util.mjs';

const cfg = readJSON(r('config', 'llm.json'));

function resolveProvider(name) {
  const p = cfg.providers[name];
  if (!p) return null;
  const key = process.env[p.keyEnv];
  const baseURL = p.baseURLEnv ? process.env[p.baseURLEnv] : p.baseURL;
  const N = name.toUpperCase();
  const strong = process.env[`${N}_MODEL`] || (p.strongEnv && process.env[p.strongEnv]) || p.strong;
  const fast = process.env[`${N}_MODEL_FAST`] || (p.fastEnv && process.env[p.fastEnv]) || p.fast || strong;
  if (!key || !baseURL || !strong) return null;
  return {
    name,
    key,
    baseURL: baseURL.replace(/\/$/, ''),
    strong,
    fast,
    maxInputChars: p.maxInputChars || 30000,
    maxTokens: p.maxTokens || 4000,
    minIntervalMs: p.minIntervalMs || 0,
    jsonMode: !!p.jsonMode,
  };
}

const lastCall = {};
async function throttle(p) {
  const wait = (lastCall[p.name] || 0) + p.minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[p.name] = Date.now();
}

export function providers() {
  const order = (process.env.LLM_ORDER || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (order.length ? order : cfg.order).map(resolveProvider).filter(Boolean);
}

export function searchOrder() {
  return cfg.searchOrder || ['hn'];
}

/** Input budget of the primary provider (fallbacks truncate further in fit()). */
export function inputBudget() {
  const list = providers();
  return Math.min(list[0]?.maxInputChars || 15000, 60000);
}

function fit(messages, maxChars) {
  const total = messages.reduce((n, m) => n + m.content.length, 0);
  if (total <= maxChars) return messages;
  const over = total - maxChars;
  const idx = messages.findLastIndex((m) => m.role === 'user');
  const m = messages[idx];
  const keep = Math.max(2000, m.content.length - over - 50);
  const copy = [...messages];
  copy[idx] = { ...m, content: m.content.slice(0, keep) + '\n\n……（材料过长，已截断）' };
  return copy;
}

const clean = (s = '') => s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*<think>[\s\S]*$/i, '').trim();

async function callOnce(p, { messages, tier, json, temperature, maxTokens }) {
  const model = tier === 'fast' ? p.fast : p.strong;
  const body = {
    model,
    messages: fit(messages, p.maxInputChars),
    temperature,
    max_tokens: Math.min(maxTokens || p.maxTokens, p.maxTokens),
  };
  if (json && p.jsonMode) body.response_format = { type: 'json_object' };
  await throttle(p);
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${p.key}` };
  if (p.name === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com';
    headers['X-Title'] = 'AI Frontier Notes';
  }
  const res = await fetch(`${p.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${p.name}/${model} HTTP ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = JSON.parse(text);
  const content = clean(data.choices?.[0]?.message?.content || '');
  if (!content) throw new Error(`${p.name}/${model} returned empty content`);
  return { text: content, provider: p.name, model };
}

export const usage = { calls: 0, byModel: {} };

/**
 * Chat completion with provider fallback.
 * tier: 'fast' (planning/briefs) | 'strong' (long-form writing)
 */
export async function chat({ system, user, tier = 'strong', json = false, temperature = 0.6, maxTokens }) {
  const list = providers();
  if (!list.length) throw new Error('没有可用的大模型提供方：请至少配置 GEMINI_API_KEY、ZHIPU_API_KEY、OPENROUTER_API_KEY、GROQ_API_KEY 或 LLM_API_KEY 之一。');
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: user },
  ];
  const errors = [];
  for (const p of list) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await callOnce(p, { messages, tier, json, temperature, maxTokens });
        usage.calls++;
        usage.byModel[`${out.provider}/${out.model}`] = (usage.byModel[`${out.provider}/${out.model}`] || 0) + 1;
        return out;
      } catch (e) {
        errors.push(e.message);
        log(`  ! ${e.message.slice(0, 200)}`);
        const retryable = e.status === 429 || e.status >= 500 || e.name === 'TimeoutError';
        if (!retryable || attempt === 1) break;
        await sleep(e.status === 429 ? 20_000 : 5_000);
      }
    }
  }
  throw new Error(`所有大模型提供方均失败：\n${errors.join('\n')}`);
}

export function parseJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : text;
  const start = src.search(/[\[{]/);
  const end = Math.max(src.lastIndexOf('}'), src.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('模型输出中没有 JSON');
  return JSON.parse(src.slice(start, end + 1));
}

export async function chatJSON(opts) {
  let last;
  for (let i = 0; i < 2; i++) {
    const out = await chat({ ...opts, json: true, temperature: opts.temperature ?? 0.3 });
    try {
      return { ...out, data: parseJSON(out.text) };
    } catch (e) {
      last = e;
      log('  ! JSON 解析失败，重试');
    }
  }
  throw last;
}

/** Gemini native API with Google Search grounding. */
export async function geminiGrounded(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL_FAST || cfg.providers.gemini.fast;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`gemini search HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  const chunks = cand?.groundingMetadata?.groundingChunks || [];
  return { text, chunks: chunks.map((c) => c.web).filter(Boolean) };
}
