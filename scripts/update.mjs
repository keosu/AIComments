import fs from 'node:fs';
import { r, readJSON, writeJSON, dateInTZ, asciiSlug, hash, hostOf, truncate, log } from './lib/util.mjs';
import { loadAll, writeEntry, uniqueSlug } from './lib/content.mjs';
import { collect, fetchText } from './lib/sources.mjs';
import { webSearch } from './lib/search.mjs';
import { chat, chatJSON, inputBudget, providers, usage } from './lib/llm.mjs';
import {
  EDITORIAL, planPrompt, briefsPrompt, essayPrompt, researchPrompt, viewpointPrompt,
  primerOutlinePrompt, primerSectionPrompt, parseArticle, linkCitations, verifyQuotes,
} from './lib/prompts.mjs';

// ---------- Options ----------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || '';
const DRY = flag('dry');
const COLLECT_ONLY = flag('collect-only');
const ONLY = (opt('only') || process.env.UPDATE_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const FORCE_PRIMER = flag('force-primer') || process.env.FORCE_PRIMER === 'true';
const PRIMER_TOPIC = opt('topic') || process.env.PRIMER_TOPIC || '';
const want = (k) => !ONLY.length || ONLY.includes(k);

const site = readJSON(r('site.config.json'));
const U = site.update;
const sourcesCfg = readJSON(r('config', 'sources.json'));
const primerTopics = readJSON(r('config', 'primer-topics.json'), { topics: [] }).topics;
const statePath = r('data', 'state.json');
const seenPath = r('data', 'seen.json');
const state = readJSON(statePath, { issue: 0, lastRun: null, lastPrimer: null, primers: [] });
const seen = readJSON(seenPath, {});
const today = dateInTZ(new Date(), U.timezone);
const SYSTEM = `${EDITORIAL}\n\n今天是 ${today}。`;
const report = [];
const errors = [];
let briefWritten = false;

const MIN_CJK = { essay: 900, research: 700, viewpoint: 700, primer: 2500 };
const TYPE_ZH = { essay: '评论', research: '研究', viewpoint: '观点', primer: '原理', brief: '要闻' };
const cjk = (s) => (s.match(/[\u4e00-\u9fff]/g) || []).length;

function save(type, meta, body = '', slugHint = '') {
  const base = `${today}-${asciiSlug(slugHint) || hash(meta.title, 6)}`;
  const slug = uniqueSlug(type, base);
  if (DRY) {
    log(`[dry] ${type}/${slug}: ${meta.title}`);
    console.log(truncate(body, 1500));
    return slug;
  }
  writeEntry(type, slug, meta, body);
  log(`✓ 写入 ${type}/${slug}.md`);
  report.push(`- **${TYPE_ZH[type]}**：${meta.title}`);
  return slug;
}

async function gatherMaterials(cands, queries, budget, maxItems = 8) {
  const mats = [];
  const per = Math.max(1200, Math.floor((budget - 5000) / Math.max(3, cands.length + queries.length)));
  for (const c of cands) {
    const full = await fetchText(c.url, per);
    mats.push({ title: c.title, url: c.url, source: c.source, content: full ? `${c.snippet ? `摘要：${c.snippet}\n` : ''}正文节选：${full}` : c.snippet });
  }
  for (const q of queries) {
    const results = await webSearch(q, { days: 60 });
    for (const x of results.slice(0, 3)) {
      if (mats.some((m) => m.url === x.url)) continue;
      mats.push({ title: x.title || hostOf(x.url), url: x.url, source: hostOf(x.url), content: x.snippet });
    }
  }
  return mats.filter((m) => (m.content || '').length > 40).slice(0, maxItems);
}

// ---------- Steps ----------
async function writeBriefs(items) {
  log(`撰写要闻（${items.length} 条）`);
  await Promise.all(
    items.map(async (c) => {
      if (c.snippet && c.snippet.length >= 120 && !/Hacker News/.test(c.snippet)) return;
      const text = await fetchText(c.url, 900);
      if (text) c.snippet = text;
    }),
  );
  const { data, model } = await chatJSON({ system: SYSTEM, user: briefsPrompt(items), tier: 'fast' });
  const byId = new Map(items.map((c) => [c.id, c]));
  const out = (data.items || [])
    .filter((b) => byId.has(b.id) && b.title)
    .map((b) => {
      const c = byId.get(b.id);
      const source = /Hacker News|搜索/.test(c.source) ? hostOf(c.url) : c.source;
      return { title: b.title.trim(), text: (b.text || '').trim(), url: c.url, source };
    });
  if (out.length < Math.min(3, items.length)) throw new Error('要闻生成条目过少');
  const issue = state.issue + 1;
  const [, m, d] = today.split('-').map(Number);
  save('brief', {
    title: `第 ${issue} 期要闻 · ${m} 月 ${d} 日`,
    date: today,
    issue,
    summary: data.intro || '',
    generated: true,
    model,
    items: out,
  }, '', 'briefs');
  briefWritten = true;
}

async function writeEssay(spec, byId) {
  log(`撰写评论：${spec.topic}`);
  const cands = (spec.ids || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 6);
  const materials = await gatherMaterials(cands, (spec.queries || []).slice(0, 3), inputBudget(), 9);
  if (materials.length < 2) throw new Error(`评论材料不足：${spec.topic}`);
  const { text, model } = await chat({ system: SYSTEM, user: essayPrompt({ ...spec, materials }), tier: 'strong', temperature: 0.7 });
  const a = parseArticle(text);
  if (!a.title || cjk(a.body) < MIN_CJK.essay) throw new Error(`评论质量不达标（${cjk(a.body)} 字）`);
  const { body, sources } = linkCitations(a.body, materials);
  const allSources = materials.map((m, i) => ({ n: i + 1, title: m.title, url: m.url }));
  save('essay', { title: a.title, date: today, summary: a.summary, tags: a.tags, generated: true, model, sources: sources.length ? sources : allSources }, body, a.slug);
  return cands.map((c) => c.key);
}

async function writeResearch(spec, byId) {
  const c = byId.get(spec.id);
  if (!c) return [];
  log(`撰写研究解读：${c.title}`);
  const budget = inputBudget();
  const full = await fetchText(c.url, Math.max(6000, budget - 6000));
  const materials = [{ title: c.title, url: c.url, source: c.source, content: `${c.snippet ? `摘要：${c.snippet}\n` : ''}${full ? `正文节选：${full}` : ''}` }];
  if (materials[0].content.length < 600) throw new Error(`研究材料不足：${c.title}`);
  const { text, model } = await chat({ system: SYSTEM, user: researchPrompt({ why: spec.why || '', materials }), tier: 'strong', temperature: 0.5 });
  const a = parseArticle(text);
  if (!a.title || cjk(a.body) < MIN_CJK.research) throw new Error(`研究解读质量不达标（${cjk(a.body)} 字）`);
  const { body, sources } = linkCitations(a.body, materials);
  save('research', {
    title: a.title,
    date: today,
    summary: a.summary,
    tags: a.tags,
    generated: true,
    model,
    sources: sources.length ? sources : [{ n: 1, title: c.title, url: c.url }],
  }, body, a.slug);
  return [c.key];
}

async function writeViewpoint(spec, byId) {
  const c = byId.get(spec.id);
  if (!c) return;
  log(`撰写人物观点：${spec.person} · ${c.title}`);
  const full = await fetchText(c.url, Math.max(6000, inputBudget() - 7000));
  if (full.length < 800) throw new Error(`人物观点材料不足（需要原文正文）：${c.title}`);
  const materials = [{ title: c.title, url: c.url, source: c.source, content: `${c.snippet ? `摘要：${c.snippet}\n` : ''}正文：${full}` }];
  const { text, model } = await chat({ system: SYSTEM, user: viewpointPrompt({ person: spec.person, why: spec.why || '', materials }), tier: 'strong', temperature: 0.5 });
  const a = parseArticle(text);
  const q = verifyQuotes(a.body, materials);
  if (q.dropped) log(`  引语核验：保留 ${q.kept}，删除 ${q.dropped} 处无法逐字核对的引语`);
  if (!a.title || cjk(q.body) < MIN_CJK.viewpoint) throw new Error(`人物观点质量不达标（${cjk(q.body)} 字）`);
  const { body, sources } = linkCitations(q.body, materials);
  save('viewpoint', {
    title: a.title,
    date: today,
    person: a.person || spec.person,
    role: a.role || undefined,
    summary: a.summary,
    tags: a.tags,
    generated: true,
    model,
    sources: sources.length ? sources : [{ n: 1, title: c.title, url: c.url }],
  }, body, a.slug);
}

function primerDue() {
  if (FORCE_PRIMER || PRIMER_TOPIC) return true;
  if (!state.lastPrimer) return true;
  const days = (new Date(today) - new Date(state.lastPrimer)) / 86400_000;
  return days >= (U.primerEveryDays || 28);
}

async function writePrimer() {
  const topic = PRIMER_TOPIC || primerTopics.find((t) => !state.primers.includes(t));
  if (!topic) {
    log('原理长文选题队列已用完，请在 config/primer-topics.json 中补充');
    return null;
  }
  log(`撰写原理长文：${topic}`);
  const search = await webSearch(topic);
  const materials = search.filter((x) => x.engine !== 'hn').slice(0, 6).map((x) => ({ title: x.title || hostOf(x.url), url: x.url, source: hostOf(x.url), content: x.snippet }));
  const { data: outline } = await chatJSON({ system: SYSTEM, user: primerOutlinePrompt({ topic, materials }), tier: 'strong' });
  if (!outline?.sections?.length) throw new Error('原理长文大纲生成失败');
  outline.sections = outline.sections.slice(0, 8);
  const parts = [];
  let model = '';
  for (let i = 0; i < outline.sections.length; i++) {
    log(`  第 ${i + 1}/${outline.sections.length} 节：${outline.sections[i].heading}`);
    const prevTail = parts.length ? parts.at(-1).slice(-300) : '';
    const out = await chat({ system: SYSTEM, user: primerSectionPrompt({ outline, index: i, prevTail, materials }), tier: 'strong', temperature: 0.5 });
    model = out.model;
    let sec = out.text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
    if (!/^##\s/.test(sec)) sec = `## ${outline.sections[i].heading}\n\n${sec.replace(/^#+\s.*\n/, '')}`;
    parts.push(sec);
  }
  const raw = parts.join('\n\n');
  if (cjk(raw) < MIN_CJK.primer) throw new Error(`原理长文过短（${cjk(raw)} 字）`);
  const linked = linkCitations(raw, materials);
  const body = linked.body;
  const sources = linked.sources.length ? linked.sources : materials.map((m, i) => ({ n: i + 1, title: m.title, url: m.url }));
  save('primer', {
    title: outline.title || topic,
    date: today,
    summary: outline.summary || '',
    tags: (outline.tags || []).slice(0, 6),
    generated: true,
    model,
    sources,
  }, body, outline.slug);
  return topic;
}

// ---------- Main ----------
async function main() {
  log(`AI 前沿评论 · 内容更新 ${today}${DRY ? '（dry run）' : ''}`);
  log(`可用大模型：${providers().map((p) => `${p.name}(${p.fast} / ${p.strong})`).join(' → ') || '无'}`);

  if (!COLLECT_ONLY && !providers().length) throw new Error('没有可用的大模型：请在仓库 Secrets 中配置 GEMINI_API_KEY / ZHIPU_API_KEY 等任一免费接口的密钥（见 README）。');

  const needCollect = want('briefs') || want('essay') || want('research') || want('viewpoint') || COLLECT_ONLY;
  let candidates = [];
  if (needCollect) {
    log('采集候选条目…');
    candidates = (await collect(sourcesCfg, { windowDays: U.windowDays })).filter((c) => !seen[c.key]);
    log(`候选（去重后）：${candidates.length}`);
  }

  if (COLLECT_ONLY) {
    candidates.slice(0, 60).forEach((c) => console.log(`${c.score.toFixed(2).padStart(6)} ${c.id} [${c.source}] ${c.title}`));
    return;
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const usedKeys = new Set();
  let wrote = 0;

  if (candidates.length >= 3 && (want('briefs') || want('essay') || want('research') || want('viewpoint'))) {
    const budget = inputBudget();
    const perLine = 300;
    const shown = candidates.slice(0, Math.min(U.maxCandidates, Math.floor((budget - 4000) / perLine)));
    const existing = loadAll();
    const recent = existing.filter((i) => i.type !== 'brief').slice(0, 15).map((i) => i.title);
    const recentBriefs = existing.filter((i) => i.type === 'brief').slice(0, 2).flatMap((b) => b.items.map((x) => x.title));
    log(`主编选题（${shown.length} 条候选）…`);
    let plan = { briefs: [], essays: [], research: [] };
    try {
      plan = (await chatJSON({ system: SYSTEM, user: planPrompt({ date: today, days: U.windowDays, candidates: shown, recent, recentBriefs, cfg: U }), tier: 'fast' })).data;
      shown.forEach((c) => usedKeys.add(c.key));
    } catch (e) {
      errors.push(`选题失败：${e.message}`);
    }
    log(`选题结果：要闻 ${plan.briefs?.length || 0}，评论 ${plan.essays?.length || 0}，研究 ${plan.research?.length || 0}`);

    if (want('briefs')) {
      const items = (plan.briefs || []).map((id) => byId.get(id)).filter(Boolean).slice(0, U.briefs.max);
      if (items.length >= Math.min(3, U.briefs.min)) {
        try { await writeBriefs(items); wrote++; } catch (e) { errors.push(`要闻：${e.message}`); }
      }
    }
    if (want('essay')) {
      for (const spec of (plan.essays || []).slice(0, U.essays)) {
        try { await writeEssay(spec, byId); wrote++; } catch (e) { errors.push(`评论：${e.message}`); }
      }
    }
    if (want('research')) {
      for (const spec of (plan.research || []).slice(0, U.research)) {
        try { await writeResearch(spec, byId); wrote++; } catch (e) { errors.push(`研究：${e.message}`); }
      }
    }
    if (want('viewpoint')) {
      for (const spec of (plan.viewpoints || []).filter((v) => v.person).slice(0, U.viewpoints ?? 1)) {
        try { await writeViewpoint(spec, byId); wrote++; } catch (e) { errors.push(`观点：${e.message}`); }
      }
    }
  } else if (needCollect) {
    log('候选不足，跳过本期常规内容');
  }

  if (want('primer') && primerDue()) {
    try {
      const topic = await writePrimer();
      if (topic) {
        wrote++;
        if (!DRY) {
          state.primers = [...new Set([...state.primers, topic])];
          state.lastPrimer = today;
        }
      }
    } catch (e) {
      errors.push(`原理：${e.message}`);
    }
  }

  if (!DRY) {
    for (const k of usedKeys) seen[k] = today;
    const cutoff = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
    for (const [k, d] of Object.entries(seen)) if (d < cutoff) delete seen[k];
    writeJSON(seenPath, seen);
    if (briefWritten) state.issue += 1;
    state.lastRun = today;
    writeJSON(statePath, state);
  }

  const summary = [
    `## 内容更新 ${today}`,
    report.length ? report.join('\n') : '_本次没有生成新内容_',
    errors.length ? `\n### 问题\n${errors.map((e) => `- ${truncate(e, 400)}`).join('\n')}` : '',
    `\n大模型调用：${usage.calls} 次 ${JSON.stringify(usage.byModel)}`,
  ].join('\n');
  console.log('\n' + summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');

  if (!wrote && errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
