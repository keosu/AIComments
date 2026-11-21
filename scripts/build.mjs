import fs from 'node:fs';
import path from 'node:path';
import { r, readJSON, writeFile, hash, esc, readingMinutes, log } from './lib/util.mjs';
import { TYPES, loadAll, loadPage } from './lib/content.mjs';
import { renderMarkdown } from './lib/markdown.mjs';
import { createTemplates } from './lib/templates.mjs';
import { iconPNG, iconSVG } from './lib/icons.mjs';
import { coverSVG } from './lib/covers.mjs';

const t0 = Date.now();
const site = readJSON(r('site.config.json'));
const siteUrl = (process.env.SITE_URL || site.url).replace(/\/$/, '');
const base = process.env.BASE_PATH ?? (process.env.SITE_URL ? new URL(siteUrl + '/').pathname : '/');
const OUT = r('dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const css = fs.readFileSync(r('src', 'style.css'), 'utf8');
const js = fs.readFileSync(r('src', 'app.js'), 'utf8');

const all = loadAll();
for (const it of all) {
  it.rendered = renderMarkdown(it.body);
  it.minutes = readingMinutes(it.body + (it.items || []).map((b) => b.text).join(''));
  if (it.type === 'viewpoint' && !it.quote) {
    const q = it.body.match(/^>\s*(.+)$/m)?.[1] || '';
    it.quote = q.replace(/[（(]原文[:：][\s\S]*?[)）]\s*$/, '').replace(/[*_`]/g, '').trim();
  }
}
const version = hash(css + js + JSON.stringify(all.map((i) => [i.slug, i.body, i.items])), 8);
const T = createTemplates({ site, base, siteUrl, version });

const byType = Object.fromEntries(Object.keys(TYPES).map((k) => [k, all.filter((i) => i.type === k)]));
const out = (p, html) => writeFile(path.join(OUT, p), html);

const articles = all.filter((i) => i.type !== 'brief');
const tagSet = new Set(articles.flatMap((i) => i.tags));
const stats = {
  articles: articles.length,
  sources: new Set(articles.flatMap((i) => i.sources.map((s) => s?.url)).filter(Boolean)).size,
  tags: tagSet.size,
  briefs: byType.brief.reduce((n, b) => n + b.items.length, 0),
};
out('index.html', T.home({ all, byType, stats, tagSet }));
for (const it of all) writeFile(path.join(OUT, 'covers', `${it.type}-${it.slug}.svg`), coverSVG(it.type, it.slug));

for (const [type, items] of Object.entries(byType)) {
  out(`${TYPES[type].dir}/index.html`, T.list(type, items));
  items.forEach((it, i) => {
    const ctx = { ...it.rendered, prev: items[i - 1], next: items[i + 1] };
    out(`${it.url}index.html`, type === 'brief' ? T.brief(it, ctx) : T.article(it, ctx));
  });
}

out('archive/index.html', T.archive(all));

const tagMap = new Map();
for (const it of articles) for (const t of it.tags) tagMap.set(t, [...(tagMap.get(t) || []), it]);
const tags = [...tagMap].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh'));
out('tags/index.html', T.tagIndex(tags.map(([t, l]) => [t, l.length])));
for (const [t, list] of tags) out(`tags/${t}/index.html`, T.tagPage(t, list));

const about = loadPage('about');
if (about) {
  const { html, hasMath } = renderMarkdown(about.body);
  out('about/index.html', T.page({ title: about.title || '关于', html, hasMath, path: 'about/', description: about.description }));
}
out('search/index.html', T.search());
out('offline/index.html', T.offline());
out('404.html', T.notFound());

writeFile(
  path.join(OUT, 'search.json'),
  JSON.stringify(
    all.map((it) => ({
      t: it.title,
      u: it.url,
      y: TYPES[it.type].label,
      d: it.date,
      s: it.summary || '',
      g: it.person ? [...it.tags, it.person] : it.tags,
      x: it.type === 'brief' ? it.items.map((b) => `${b.title} ${b.text || ''}`).join(' ') : it.body.replace(/[#>*`$\[\]()_|-]/g, ' ').replace(/\s+/g, ' ').slice(0, 1500),
    })),
  ),
);

// RSS
const abs = (p) => `${siteUrl}/${p}`;
const rssItems = all.slice(0, 40).map((it) => {
  const content = it.type === 'brief'
    ? `<ul>${it.items.map((b) => `<li><a href="${esc(b.url)}">${esc(b.title)}</a>：${esc(b.text || '')}</li>`).join('')}</ul>`
    : it.rendered.html;
  return `<item>
<title>${esc(`[${TYPES[it.type].label}] ${it.title}`)}</title>
<link>${abs(it.url)}</link>
<guid isPermaLink="true">${abs(it.url)}</guid>
<pubDate>${new Date(it.date + 'T08:00:00+08:00').toUTCString()}</pubDate>
${it.tags.map((t) => `<category>${esc(t)}</category>`).join('')}
<description>${esc(it.summary || '')}</description>
<content:encoded><![CDATA[${content.replaceAll(']]>', ']]&gt;')}]]></content:encoded>
</item>`;
});
writeFile(
  path.join(OUT, 'feed.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(site.title)}</title>
<link>${siteUrl}/</link>
<atom:link href="${abs('feed.xml')}" rel="self" type="application/rss+xml"/>
<description>${esc(site.description)}</description>
<language>${site.language}</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems.join('\n')}
</channel>
</rss>`,
);

const pages = ['', 'archive/', 'about/', ...Object.values(TYPES).map((t) => `${t.dir}/`), ...all.map((i) => i.url)];
writeFile(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `<url><loc>${abs(p)}</loc></url>`).join('\n')}
</urlset>`,
);
writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${abs('sitemap.xml')}\n`);
writeFile(path.join(OUT, '.nojekyll'), '');

// Assets
writeFile(path.join(OUT, 'assets', 'style.css'), css);
writeFile(path.join(OUT, 'assets', 'app.js'), js);
const katexDist = r('node_modules', 'katex', 'dist');
fs.mkdirSync(path.join(OUT, 'assets', 'katex'), { recursive: true });
fs.copyFileSync(path.join(katexDist, 'katex.min.css'), path.join(OUT, 'assets', 'katex', 'katex.min.css'));
fs.cpSync(path.join(katexDist, 'fonts'), path.join(OUT, 'assets', 'katex', 'fonts'), {
  recursive: true,
  filter: (src) => !/\.(ttf|woff)$/.test(src),
});

// Icons
const icons = path.join(OUT, 'icons');
writeFile(path.join(icons, 'icon.svg'), iconSVG());
writeFile(path.join(icons, 'icon-192.png'), iconPNG(192));
writeFile(path.join(icons, 'icon-512.png'), iconPNG(512));
writeFile(path.join(icons, 'maskable-512.png'), iconPNG(512, { maskable: true }));
writeFile(path.join(icons, 'apple-touch-icon.png'), iconPNG(180, { maskable: true }));
writeFile(path.join(icons, 'favicon-32.png'), iconPNG(32));

// PWA
writeFile(
  path.join(OUT, 'manifest.webmanifest'),
  JSON.stringify(
    {
      id: base,
      name: site.title,
      short_name: site.shortTitle,
      description: site.description,
      lang: site.language,
      start_url: base,
      scope: base,
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'any',
      background_color: site.colors.dark,
      theme_color: site.colors.dark,
      categories: ['education', 'news', 'productivity'],
      icons: [
        { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: `${base}icons/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      ],
      shortcuts: [
        { name: TYPES.essay.title, url: `${base}essays/` },
        { name: TYPES.primer.title, url: `${base}primers/` },
        { name: TYPES.viewpoint.title, url: `${base}viewpoints/` },
        { name: TYPES.brief.title, url: `${base}briefs/` },
      ],
    },
    null,
    2,
  ),
);

const precache = [
  './',
  'offline/',
  `assets/style.css?v=${version}`,
  `assets/app.js?v=${version}`,
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'search.json',
];
const sw = fs
  .readFileSync(r('src', 'sw.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(precache));
writeFile(path.join(OUT, 'sw.js'), sw);

log(`Built ${all.length} entries (${articles.length} articles, ${byType.brief.length} briefs) → dist/ base=${base} v=${version} in ${Date.now() - t0}ms`);
