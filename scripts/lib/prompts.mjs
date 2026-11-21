import fs from 'node:fs';
import { r, hostOf, truncate } from './util.mjs';

export const EDITORIAL = fs.readFileSync(r('config', 'editorial.md'), 'utf8');

const HEADER_FORMAT = `输出格式（严格遵守，四行元信息 + 分隔线 + 正文）：
TITLE: 文章标题（有观点、具体，不超过 30 字，不要书名号）
SLUG: 英文短链接（小写字母、数字、连字符，3–6 个词）
SUMMARY: 一句话摘要（60–120 字，陈述核心观点而非介绍文章）
TAGS: 3–5 个标签，逗号分隔
---
正文 Markdown（不要再写一级标题）`;

export function materialsBlock(materials) {
  return materials
    .map((m, i) => `[${i + 1}] ${m.title}（${m.source || hostOf(m.url)}）\n${m.content || m.snippet || ''}`)
    .join('\n\n');
}

export function planPrompt({ date, days, candidates, recent, cfg }) {
  const lines = candidates
    .map((c) => `${c.id} | ${c.date ? c.date.toISOString().slice(5, 10) : '--'} | ${c.source} | ${c.kind}${c.metric ? `(${c.metric})` : ''} | ${c.title} | ${truncate(c.snippet || '', 180)}`)
    .join('\n');
  return `今天是 ${date}。下面是过去 ${days} 天从各信息源实时收集的候选条目，格式为：id | 日期 | 来源 | 类型(热度) | 标题 | 摘要。这些就是当前最新的动态；不要依赖你训练数据中的旧知识来判断“什么是最新的”，同等分量下优先选择更新的条目。

请以主编身份为本期挑选内容：

1. briefs：${cfg.briefs.min}–${cfg.briefs.max} 条值得“一句话带过”的重要动态（模型发布、重要研究、开源进展、产业与政策要闻）。只选有实质分量的，宁少勿滥；同一事件只保留最权威的一条来源（官方博客/论文优先于转载）。
2. essays：至多 ${cfg.essays} 个深度评论选题。应是本期最值得深入思考的话题——能引出有洞见的判断，而不只是“发生了什么”。每个给出：topic（中文选题）、angle（核心论点或要追问的问题，1–2 句）、ids（作为材料的候选 id，2–6 个）、queries（2–3 条补充背景用的英文搜索词）。如果本期没有足够分量的话题，返回空数组。
3. research：至多 ${cfg.research} 篇最值得做方法解读的论文、技术报告或技术博客（优先提出新方法、新思路、可能影响后续研究的工作），给出 id 与 why（一句话理由）。不要与 essays 的核心材料重复。
4. viewpoints：至多 ${cfg.viewpoints ?? 1} 个“人物观点”。只在某个候选是领域关键人物（知名研究者、实验室或公司负责人、有影响力的工程师）的**第一手**公开表达（本人撰写的文章、访谈、演讲、播客）且观点有分量时才选。给出 id、person（人物姓名，用通行写法）与 why。没有合适的就返回空数组。

关注方向包括但不限于：大模型、世界模型、推理与强化学习、智能体、多模态与具身智能、可解释性与对齐、AI 基础设施与算力、AI 与科学。

避免与近期已发表的选题重复：
${recent.length ? recent.map((t) => `- ${t}`).join('\n') : '（无）'}

只输出 JSON，不要任何解释：
{"briefs": ["id"], "essays": [{"topic": "", "angle": "", "ids": [""], "queries": [""]}], "research": [{"id": "", "why": ""}], "viewpoints": [{"id": "", "person": "", "why": ""}]}

候选条目：
${lines}`;
}

export function briefsPrompt(items) {
  return `为以下每个条目写一条中文要闻，并写一句本期导语。

要求：
- title：中文标题，不超过 26 字，准确点出主体（模型名、机构名保留原文）。
- text：一句话，不超过 80 字，说清“是什么”以及“为什么值得关注”。只依据给定信息，不夸大，不编造数字。
- intro：一句话导语（不超过 70 字），点出本期最值得关注的动向，不要罗列。
- 保持输入顺序，id 原样返回。

只输出 JSON：{"intro": "", "items": [{"id": "", "title": "", "text": ""}]}

条目：
${items.map((c) => `[${c.id}] ${c.source} | ${c.title} | ${truncate(c.snippet || '', 400)}`).join('\n')}`;
}

export function essayPrompt({ topic, angle, materials }) {
  return `请写一篇深度评论。

选题：${topic}
切入角度：${angle}

写作要求：
- 篇幅 2500–4000 字。开头两三句内直接亮出核心判断，不要铺垫背景。
- 用 3–5 个二级标题（## ）组织论证，以连贯论述为主，必要时使用列表或表格。
- 必须包含：对主流叙事的审视（哪里成立、哪里被高估或低估）；技术或经济层面的机制分析；至少一个明确的、未来可以检验的判断，或值得跟踪的信号。
- 引用材料中的事实时，在句末用 [n] 标注材料编号（可连用，如 [1][3]）。不要输出任何链接，不要引入材料之外的具体数字或事件。
- 结尾不要写总结式套话。

${HEADER_FORMAT}

材料：
${materialsBlock(materials)}`;
}

export function researchPrompt({ why, materials }) {
  return `请为材料 [1] 所述的工作写一篇「研究与方法」解读，其余材料（如有）仅作背景。
推荐理由：${why}

写作要求：
- 篇幅 1800–3000 字，面向有机器学习基础的读者。
- 结构：## 问题 ／ ## 核心思路 ／ ## 方法细节 ／ ## 证据与结果 ／ ## 我们的看法。在「方法细节」中可使用公式或伪代码。
- 「我们的看法」要具体：方法成立的前提、可能失效的场景、与已有工作的关系、值得追问的问题。
- 只依据材料。材料没写清的细节明确写“论文未详述”，不要臆测数字。引用用 [n] 标注。
- TITLE 用“点出核心思想”的中文标题，不要直接照搬论文英文名（论文名可在正文首段给出）。

${HEADER_FORMAT}

材料：
${materialsBlock(materials)}`;
}

export function viewpointPrompt({ person, why, materials }) {
  return `请就 ${person} 在材料 [1] 中表达的观点写一篇「人物观点」评述，其余材料（如有）仅作背景。
推荐理由：${why}

写作要求：
- 篇幅 1500–2500 字。
- 结构：## 背景（此人是谁、在什么场合说的）／ ## 核心观点（3–5 条，逐条概括）／ ## 论证与依据（他凭什么这么认为）／ ## 我们的看法（哪些成立、哪些存疑、有哪些有分量的反对意见）。
- 直接引语最多 4 处，必须使用如下格式单独成段：
  > 中文译文（原文：“逐字摘自材料的原文”）
  原文必须**逐字**出自材料，不得改写、拼接或凭记忆补充；做不到逐字引用时，改为不带引号的转述。无法逐字核对的引语会被自动删除。
- 区分“他说了什么”和“我们的推断”，不要把评述者的观点安到人物身上。引用材料事实用 [n] 标注。

输出格式（严格遵守，六行元信息 + 分隔线 + 正文）：
TITLE: 标题（点出核心观点，不超过 30 字）
SLUG: 英文短链接（小写字母、数字、连字符，3–6 个词）
SUMMARY: 一句话摘要（60–120 字）
TAGS: 3–5 个标签，逗号分隔
PERSON: 人物姓名
ROLE: 身份（不超过 20 字，例如“图灵奖得主、Meta 首席 AI 科学家”）
---
正文 Markdown（不要再写一级标题）

材料：
${materialsBlock(materials)}`;
}

const normQuote = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Drop quoted passages whose original text cannot be found verbatim in the materials. */
export function verifyQuotes(body, materials) {
  const corpus = normQuote(materials.map((m) => m.content || '').join(' '));
  let kept = 0;
  let dropped = 0;
  const out = body
    .split('\n')
    .filter((line) => {
      const m = line.match(/原文[:：]\s*[“"「]([^”"」]{8,})[”"」]/);
      if (!m) return true;
      const q = normQuote(m[1]);
      if (q.length >= 8 && corpus.includes(q)) {
        kept++;
        return true;
      }
      dropped++;
      return false;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return { body: out, kept, dropped };
}

export function primerOutlinePrompt({ topic, materials }) {
  return `你将撰写一篇「原理与实践」系统性长文，主题：${topic}

读者是有机器学习基础的工程师与研究者。目标：读完能理解原理的来龙去脉，并知道工程上如何取舍。
请先给出大纲：6–8 节，覆盖问题背景与动机、核心原理（必要时含数学推导）、关键变体及其取舍、工程实践要点与常见坑、前沿进展与开放问题、延伸学习路线。

只输出 JSON：
{"title": "中文标题", "slug": "english-slug", "summary": "60–120 字摘要", "tags": ["标签"], "sections": [{"heading": "节标题", "points": ["要点"]}]}

补充材料（可能为空，可作参考）：
${materials.length ? materialsBlock(materials) : '（无）'}`;
}

export function primerSectionPrompt({ outline, index, prevTail, materials }) {
  const s = outline.sections[index];
  return `长文《${outline.title}》的大纲：
${outline.sections.map((x, i) => `${i + 1}. ${x.heading}`).join('\n')}

现在撰写第 ${index + 1} 节「${s.heading}」，要点：${(s.points || []).join('；')}

要求：
- 900–1600 字，以 “## ${s.heading}” 开头；可用 ### 小标题、公式、代码块、表格。
- 与前后各节自然衔接，不重复其他节的内容，不要写全文总结。
- 若使用补充材料中的事实，用 [n] 标注编号。提及经典论文时只写名称与年份，并且只在非常确定时提及；不要输出任何链接。
${prevTail ? `\n上一节的结尾：……${prevTail}\n` : ''}
只输出这一节的 Markdown。

补充材料：
${materials.length ? materialsBlock(materials) : '（无）'}`;
}

export function parseArticle(text) {
  const t = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '');
  const idx = t.search(/^-{3,}\s*$/m);
  let head = idx >= 0 ? t.slice(0, idx) : '';
  let body = idx >= 0 ? t.slice(idx).replace(/^-{3,}\s*\n/, '') : t;
  if (idx < 0 || !/TITLE/i.test(head)) {
    const m = t.match(/^((?:\s*\**(?:TITLE|SLUG|SUMMARY|TAGS|PERSON|ROLE)\**\s*[:：].*\n)+)/i);
    if (m) {
      head = m[1];
      body = t.slice(m[1].length).replace(/^\s*-{3,}\s*\n/, '');
    }
  }
  const field = (k) => head.match(new RegExp(`^\\s*\\**${k}\\**\\s*[:：]\\s*(.+)$`, 'mi'))?.[1].trim().replace(/^["“《]|["”》]$/g, '') || '';
  body = body.replace(/^#\s+.+\n+/, '').trim();
  return {
    title: field('TITLE'),
    slug: field('SLUG'),
    summary: field('SUMMARY'),
    tags: field('TAGS').split(/[,，、]/).map((s) => s.trim()).filter(Boolean).slice(0, 6),
    person: field('PERSON'),
    role: field('ROLE'),
    body,
  };
}

/**
 * Turn [n] markers into links to the provided materials and drop any link the model invented.
 * Returns the processed body and the list of cited sources.
 */
export function linkCitations(body, materials) {
  const allowed = new Set(materials.map((m) => m.url));
  let out = body.replace(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) => (allowed.has(url) ? m : label));
  const cited = new Set();
  out = out.replace(/\[(\d{1,2}(?:\s*[,，、]\s*\d{1,2})*)\](?!\()/g, (m, inner) => {
    const nums = inner.split(/[,，、]/).map((s) => Number(s.trim()));
    if (!nums.every((n) => materials[n - 1])) return '';
    nums.forEach((n) => cited.add(n));
    return nums.map((n) => `<sup>[[${n}]](${materials[n - 1].url})</sup>`).join('');
  });
  const sources = [...cited].sort((a, b) => a - b).map((n) => ({ n, title: materials[n - 1].title, url: materials[n - 1].url }));
  return { body: out, sources };
}
