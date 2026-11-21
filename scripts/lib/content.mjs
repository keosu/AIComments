import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { r, normDate } from './util.mjs';

export const TYPES = {
  essay: {
    dir: 'essays',
    label: '评论',
    title: '深度评论',
    desc: '对大模型与 AI 前沿的判断与思考：它意味着什么，瓶颈在哪里，哪些被高估，哪些被低估。',
  },
  research: {
    dir: 'research',
    label: '研究',
    title: '研究与方法',
    desc: '值得细读的论文、方法与研究思路：问题是什么，核心想法是什么，代价与局限在哪里。',
  },
  primer: {
    dir: 'primers',
    label: '原理',
    title: '原理与实践',
    desc: '定期推出的系统性长文：把一项关键技术从原理讲到工程实践。',
  },
  viewpoint: {
    dir: 'viewpoints',
    label: '观点',
    title: '人物观点',
    desc: '领域关键人物的重要观点：他们说了什么，依据是什么，我们怎么看。',
  },
  brief: {
    dir: 'briefs',
    label: '要闻',
    title: '要闻速览',
    desc: '一句话带过的重要动态，附原始链接。只记录真正有分量的进展。',
  },
};

export const typeByDir = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v.dir, k]));

export function loadAll() {
  const items = [];
  for (const [type, meta] of Object.entries(TYPES)) {
    const dir = r('content', meta.dir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const { data, content } = matter(raw);
      if (data.draft) continue;
      const slug = f.replace(/\.md$/, '');
      items.push({
        ...data,
        type,
        slug,
        file: f,
        date: normDate(data.date) || slug.slice(0, 10),
        tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t).replace(/[\/\\?#%:*"<>|]/g, '-').trim()).filter(Boolean) : [],
        sources: Array.isArray(data.sources) ? data.sources : [],
        items: Array.isArray(data.items) ? data.items : [],
        body: content.trim(),
        url: `${meta.dir}/${slug}/`,
      });
    }
  }
  return items.sort((a, b) => (a.date === b.date ? b.slug.localeCompare(a.slug) : b.date.localeCompare(a.date)));
}

export function loadPage(name) {
  const file = r('content', 'pages', `${name}.md`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, 'utf8'));
  return { ...data, body: content.trim() };
}

export function writeEntry(type, slug, data, body = '') {
  const file = r('content', TYPES[type].dir, `${slug}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null));
  fs.writeFileSync(file, matter.stringify(body ? `\n${body.trim()}\n` : '', clean));
  return file;
}

export function uniqueSlug(type, base) {
  const dir = r('content', TYPES[type].dir);
  let slug = base;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${slug}.md`))) slug = `${base}-${i++}`;
  return slug;
}
