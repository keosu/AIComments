import { TYPES } from './content.mjs';
import { esc, formatDateZh, hostOf, hash } from './util.mjs';
import { logoSVG } from './icons.mjs';

const ICONS = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  sun: '<svg class="i-light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>',
  moon: '<svg class="i-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
  auto: '<svg class="i-auto" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/></svg>',
  expand: '<svg class="i-expand" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  shrink: '<svg class="i-shrink" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></svg>',
  rss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.3" fill="currentColor"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

const EN = { essay: 'ESSAY', research: 'RESEARCH', primer: 'PRIMER', viewpoint: 'VIEWPOINT', brief: 'BRIEFING' };

export function initials(name = '') {
  const n = String(name).trim();
  if (!n) return '?';
  if (/[\u4e00-\u9fff]/.test(n)) return n.replace(/[^\u4e00-\u9fff]/g, '').slice(0, 1);
  const parts = n.split(/[\s·.-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

export function createTemplates(ctx) {
  const { site, base, version } = ctx;
  const u = (p = '') => base + p.replace(/^\//, '');
  const abs = (p = '') => ctx.siteUrl.replace(/\/$/, '') + '/' + p.replace(/^\//, '');
  const tagUrl = (t) => u(`tags/${encodeURIComponent(t)}/`);
  const coverUrl = (it) => u(`covers/${it.type}-${it.slug}.svg`);

  const nav = ['essay', 'research', 'primer', 'viewpoint', 'brief'];

  function layout({ title, description = site.description, body, active = '', path = '', hasMath = false, bodyClass = '', ogType = 'website' }) {
    const fullTitle = title ? `${title} · ${site.title}` : `${site.title} · ${site.subtitle}`;
    return `<!doctype html>
<html lang="${site.language}" data-theme="auto" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(path)}">
<meta name="theme-color" content="${site.colors.light}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${site.colors.dark}" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="manifest" href="${u('manifest.webmanifest')}">
<link rel="icon" href="${u('icons/icon.svg')}" type="image/svg+xml">
<link rel="icon" href="${u('icons/favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${u('icons/apple-touch-icon.png')}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(site.shortTitle)}">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="${u('feed.xml')}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title || site.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(path)}">
<meta property="og:site_name" content="${esc(site.title)}">
<meta property="og:image" content="${abs('icons/icon-512.png')}">
<script>(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();</script>
<link rel="stylesheet" href="${u('assets/style.css')}?v=${version}">
${hasMath ? `<link rel="stylesheet" href="${u('assets/katex/katex.min.css')}?v=${version}">` : ''}
<script defer src="${u('assets/app.js')}?v=${version}"></script>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">跳到正文</a>
<div class="progress" aria-hidden="true"><span></span></div>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${u()}" aria-label="${esc(site.title)} 首页">
      ${logoSVG('logo')}
      <span class="brand-text"><span class="brand-title">${esc(site.title)}</span><span class="brand-sub">${esc(site.subtitle)}</span></span>
    </a>
    <nav class="nav" aria-label="主导航">
      ${nav.map((t) => `<a class="t-${t}" href="${u(TYPES[t].dir + '/')}"${active === t ? ' aria-current="page"' : ''}>${TYPES[t].label}</a>`).join('')}
      <a href="${u('archive/')}"${active === 'archive' ? ' aria-current="page"' : ''}>归档</a>
    </nav>
    <div class="tools">
      <a class="icon-btn" href="${u('search/')}" aria-label="搜索" title="搜索">${ICONS.search}</a>
      <button class="icon-btn" type="button" data-action="theme" aria-label="切换主题" title="主题：跟随系统">${ICONS.auto}${ICONS.sun}${ICONS.moon}</button>
      <button class="icon-btn" type="button" data-action="fullscreen" aria-label="全屏" title="全屏 (F)" hidden>${ICONS.expand}${ICONS.shrink}</button>
      <button class="icon-btn" type="button" data-action="install" aria-label="安装应用" title="安装到设备" hidden>${ICONS.install}</button>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div>
      <p class="footer-title">${logoSVG('logo')} ${esc(site.title)}</p>
      <p class="muted">${esc(site.tagline)}</p>
    </div>
    <div class="footer-links">
      <a href="${u('about/')}">关于</a>
      <a href="${u('archive/')}">归档</a>
      <a href="${u('tags/')}">标签</a>
      <a href="${u('feed.xml')}">${ICONS.rss}RSS</a>
    </div>
    <p class="muted small">${esc(site.cadence)}。部分内容由 AI 辅助检索与撰写，均附原始来源，请以原文为准。</p>
  </div>
</footer>
<div class="toast" role="status" aria-live="polite" hidden></div>
</body>
</html>`;
  }

  const typeLabel = (it) => `<a class="type t-${it.type}" href="${u(TYPES[it.type].dir + '/')}">${TYPES[it.type].label}<span class="type-en">${EN[it.type]}</span></a>`;
  const dateTag = (d) => `<time datetime="${d}">${formatDateZh(d)}</time>`;
  const tagList = (tags = []) =>
    tags.length ? `<ul class="tags">${tags.map((t) => `<li><a href="${tagUrl(t)}">#${esc(t)}</a></li>`).join('')}</ul>` : '';

  function avatar(name, size = '') {
    const hue = parseInt(hash(name || '?', 4), 16) % 360;
    return `<span class="avatar ${size}" style="--h:${hue}" aria-hidden="true">${esc(initials(name))}</span>`;
  }

  function card(it, { showType = true, cover = true } = {}) {
    return `<article class="card t-${it.type}">
  ${cover ? `<a class="card-cover" href="${u(it.url)}" tabindex="-1" aria-hidden="true"><img src="${coverUrl(it)}" alt="" loading="lazy" decoding="async" width="1200" height="630"></a>` : ''}
  <div class="card-body">
    <p class="meta">${showType ? typeLabel(it) + '<span class="dot">·</span>' : ''}${dateTag(it.date)}${it.minutes ? `<span class="dot">·</span>${it.minutes} 分钟` : ''}</p>
    <h3><a href="${u(it.url)}">${esc(it.title)}</a></h3>
    ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ''}
  </div>
</article>`;
  }

  function personCard(it) {
    return `<article class="person-card t-viewpoint">
  <div class="person-head">${avatar(it.person)}<div><p class="person-name">${esc(it.person || '')}</p><p class="person-role">${esc(it.role || '')}</p></div></div>
  <h3><a href="${u(it.url)}">${esc(it.title)}</a></h3>
  ${it.quote ? `<blockquote class="person-quote">${esc(it.quote)}</blockquote>` : it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ''}
</article>`;
  }

  function briefList(items = [], { limit = Infinity } = {}) {
    return `<ol class="brief-list">${items
      .slice(0, limit)
      .map(
        (b) => `<li>
  <a class="brief-title" href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.title)}</a>
  ${b.text ? `<p>${esc(b.text)}</p>` : ''}
  <span class="brief-src">${esc(b.source || hostOf(b.url))}</span>
</li>`,
      )
      .join('')}</ol>`;
  }

  let sectionNo = 0;
  function section(type, items, { title = TYPES[type].title, layout: lay = '' } = {}) {
    if (!items.length) return '';
    const no = String(++sectionNo).padStart(2, '0');
    const inner = type === 'viewpoint'
      ? `<div class="person-grid">${items.map(personCard).join('')}</div>`
      : `<div class="cards ${lay}">${items.map((it) => card(it, { showType: false })).join('')}</div>`;
    return `<section class="block t-${type}">
  <h2 class="section-title"><span><b class="sec-no">${no}</b>${title}<i class="sec-en">${EN[type]}</i></span><a href="${u(TYPES[type].dir + '/')}">全部 ${ICONS.arrow}</a></h2>
  ${inner}
</section>`;
  }

  function home({ all, byType, stats, tagSet }) {
    sectionNo = 0;
    const essays = byType.essay;
    const hero = essays[0];
    const latestBrief = byType.brief[0];
    const focus = (site.focus || []).map((t) =>
      tagSet.has(t) ? `<a class="chip" href="${tagUrl(t)}">${esc(t)}</a>` : `<span class="chip">${esc(t)}</span>`,
    );
    const body = `
<section class="hero-wrap">
  <canvas class="hero-canvas" aria-hidden="true"></canvas>
  <div class="wrap hero">
    <div class="hero-text">
      <p class="kicker"><span class="pulse" aria-hidden="true"></span>FRONTIER NOTES · ${esc(site.cadence)}</p>
      ${hero ? `<p class="eyebrow">${typeLabel(hero)}<span class="dot">·</span>${dateTag(hero.date)}<span class="dot">·</span>${hero.minutes} 分钟</p>
      <h1><a href="${u(hero.url)}">${esc(hero.title)}</a></h1>
      ${hero.summary ? `<p class="lede">${esc(hero.summary)}</p>` : ''}
      <a class="btn" href="${u(hero.url)}">阅读全文 ${ICONS.arrow}</a>` : `<h1>${esc(site.title)}</h1><p class="lede">${esc(site.tagline)}</p>`}
    </div>
    ${hero ? `<a class="hero-cover t-essay" href="${u(hero.url)}" tabindex="-1" aria-hidden="true"><img src="${coverUrl(hero)}" alt="" width="1200" height="630"></a>` : ''}
  </div>
  <div class="wrap hero-meta">
    <dl class="stats">
      <div><dt>深度文章</dt><dd>${String(stats.articles).padStart(2, '0')}</dd></div>
      <div><dt>引用来源</dt><dd>${String(stats.sources).padStart(2, '0')}</dd></div>
      <div><dt>主题标签</dt><dd>${String(stats.tags).padStart(2, '0')}</dd></div>
      <div><dt>要闻条目</dt><dd>${String(stats.briefs).padStart(2, '0')}</dd></div>
    </dl>
    ${focus.length ? `<div class="focus"><span class="focus-label">关注方向</span>${focus.join('')}</div>` : ''}
  </div>
</section>
<div class="wrap home-grid">
  <div class="home-main">
    ${section('research', byType.research.slice(0, 4))}
    ${section('viewpoint', byType.viewpoint.slice(0, 4))}
    ${section('primer', byType.primer.slice(0, 2), { layout: 'wide' })}
    ${essays.length > 1 ? section('essay', essays.slice(1, 5), { title: '更多评论' }) : ''}
  </div>
  <aside class="home-aside">
    ${latestBrief ? `<section class="panel t-brief">
      <h2 class="section-title"><span><i class="live" aria-hidden="true"></i>要闻速览</span><a href="${u(latestBrief.url)}">${dateTag(latestBrief.date)}</a></h2>
      ${briefList(latestBrief.items, { limit: 8 })}
      <a class="more" href="${u('briefs/')}">全部要闻 ${ICONS.arrow}</a>
    </section>` : ''}
    <section class="panel about-panel">
      <h2 class="section-title"><span>关于本站</span></h2>
      <p>${esc(site.tagline)}</p>
      <p class="aside-links"><a href="${u('about/')}">编辑方针</a><a href="${u('feed.xml')}">${ICONS.rss}订阅 RSS</a></p>
    </section>
  </aside>
</div>`;
    return layout({ body, path: '', bodyClass: 'page-home' });
  }

  function article(it, { html, toc, hasMath, prev, next }) {
    const showToc = toc.length >= 3;
    const sources = (it.sources || []).filter((s) => s && s.url);
    const isView = it.type === 'viewpoint';
    const body = `
<article class="article t-${it.type}${showToc ? ' has-toc' : ''}">
  <div class="article-banner"><img src="${coverUrl(it)}" alt="" width="1200" height="630"></div>
  <header class="article-head wrap-text">
    <p class="eyebrow">${typeLabel(it)}<span class="dot">·</span>${dateTag(it.date)}<span class="dot">·</span>约 ${it.minutes} 分钟${sources.length ? `<span class="dot">·</span>${sources.length} 个来源` : ''}</p>
    <h1>${esc(it.title)}</h1>
    ${isView && it.person ? `<div class="person-head large">${avatar(it.person, 'lg')}<div><p class="person-name">${esc(it.person)}</p><p class="person-role">${esc(it.role || '')}</p></div></div>` : ''}
    ${it.summary ? `<p class="lede">${esc(it.summary)}</p>` : ''}
    ${tagList(it.tags)}
  </header>
  <div class="article-layout">
    ${showToc ? `<aside class="toc"><details open><summary>目录 · CONTENTS</summary><ol>${toc
      .map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`)
      .join('')}</ol></details></aside>` : ''}
    <div class="prose">
      ${html}
      ${sources.length ? `<section class="sources"><h2>参考资料 · REFERENCES</h2><ol>${sources
        .map((s, i) => `<li value="${s.n || i + 1}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a><span class="src-host">${esc(hostOf(s.url))}</span></li>`)
        .join('')}</ol></section>` : ''}
      ${it.generated ? `<p class="ai-note"><b>AI</b>本文由 AI 辅助检索与撰写${it.model ? `（${esc(it.model)}）` : ''}，基于公开资料生成，可能存在疏漏，请以参考资料中的原始来源为准。</p>` : ''}
    </div>
  </div>
  <nav class="pager wrap-text" aria-label="上一篇与下一篇">
    ${prev ? `<a class="prev" href="${u(prev.url)}"><span>← 较新</span>${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="${u(next.url)}"><span>较早 →</span>${esc(next.title)}</a>` : '<span></span>'}
  </nav>
</article>`;
    return layout({ title: it.title, description: it.summary, body, active: it.type, path: it.url, hasMath, bodyClass: 'page-article', ogType: 'article' });
  }

  function brief(it, { html, prev, next }) {
    const body = `
<article class="article brief-page t-brief">
  <div class="article-banner short"><img src="${coverUrl(it)}" alt="" width="1200" height="630"></div>
  <header class="article-head wrap-text">
    <p class="eyebrow">${typeLabel(it)}<span class="dot">·</span>${dateTag(it.date)}<span class="dot">·</span>${it.items.length} 条</p>
    <h1>${esc(it.title)}</h1>
    ${it.summary ? `<p class="lede">${esc(it.summary)}</p>` : ''}
  </header>
  <div class="wrap-text">
    ${html ? `<div class="prose">${html}</div>` : ''}
    ${briefList(it.items)}
    ${it.generated ? `<p class="ai-note"><b>AI</b>摘要由 AI 辅助生成${it.model ? `（${esc(it.model)}）` : ''}，请以原始链接为准。</p>` : ''}
  </div>
  <nav class="pager wrap-text" aria-label="上一期与下一期">
    ${prev ? `<a class="prev" href="${u(prev.url)}"><span>← 较新</span>${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="${u(next.url)}"><span>较早 →</span>${esc(next.title)}</a>` : '<span></span>'}
  </nav>
</article>`;
    return layout({ title: it.title, description: it.summary, body, active: 'brief', path: it.url, bodyClass: 'page-article' });
  }

  function timeline(items, { showType = false } = {}) {
    const groups = new Map();
    for (const it of items) {
      const k = it.date.slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    return [...groups]
      .map(([k, list]) => {
        const [y, m] = k.split('-');
        return `<section class="tl-group"><h2 class="tl-month"><b>${y}</b>.${m}</h2><ul class="tl">${list
          .map(
            (it) => `<li class="t-${it.type}">
  <a class="tl-thumb" href="${u(it.url)}" tabindex="-1" aria-hidden="true"><img src="${coverUrl(it)}" alt="" loading="lazy" width="1200" height="630"></a>
  <div>
    <p class="meta">${showType ? `<span class="type t-${it.type}">${TYPES[it.type].label}</span><span class="dot">·</span>` : ''}<time datetime="${it.date}">${it.date}</time>${it.person ? `<span class="dot">·</span>${esc(it.person)}` : ''}</p>
    <a class="tl-title" href="${u(it.url)}">${esc(it.title)}</a>
    ${it.summary ? `<p class="tl-sum">${esc(it.summary)}</p>` : ''}
  </div>
</li>`,
          )
          .join('')}</ul></section>`;
      })
      .join('');
  }

  function pageHead(title, desc, type = '') {
    return `<header class="page-head wrap${type ? ` t-${type}` : ''}">
  ${type ? `<p class="kicker">${EN[type]}</p>` : ''}
  <h1>${title}</h1>
  ${desc ? `<p class="lede">${desc}</p>` : ''}
</header>`;
  }

  function list(type, items) {
    const meta = TYPES[type];
    const body = `
${pageHead(meta.title, meta.desc, type)}
<div class="wrap list-wrap">
  ${items.length ? (type === 'brief' ? briefArchive(items) : timeline(items)) : '<p class="muted">暂无内容。</p>'}
</div>`;
    return layout({ title: meta.title, description: meta.desc, body, active: type, path: `${meta.dir}/` });
  }

  function briefArchive(items) {
    return items
      .map(
        (it) => `<section class="brief-issue">
  <h2><a href="${u(it.url)}">${esc(it.title)}</a></h2>
  <p class="meta">${dateTag(it.date)} · ${it.items.length} 条</p>
  ${briefList(it.items, { limit: 5 })}
  ${it.items.length > 5 ? `<a class="more" href="${u(it.url)}">查看本期全部 ${ICONS.arrow}</a>` : ''}
</section>`,
      )
      .join('');
  }

  function archive(items) {
    const body = `
${pageHead('归档', `全部 ${items.length} 篇，按时间倒序。`)}
<div class="wrap list-wrap">${timeline(items, { showType: true })}</div>`;
    return layout({ title: '归档', body, active: 'archive', path: 'archive/' });
  }

  function tagIndex(tags) {
    const body = `
${pageHead('标签')}
<div class="wrap list-wrap"><ul class="tag-cloud">${tags
      .map(([t, n]) => `<li><a href="${tagUrl(t)}">#${esc(t)}<span>${n}</span></a></li>`)
      .join('')}</ul></div>`;
    return layout({ title: '标签', body, path: 'tags/' });
  }

  function tagPage(tag, items) {
    const body = `
<header class="page-head wrap"><p class="kicker"><a href="${u('tags/')}">TAG</a></p><h1>#${esc(tag)}</h1><p class="lede">${items.length} 篇</p></header>
<div class="wrap list-wrap">${timeline(items, { showType: true })}</div>`;
    return layout({ title: `标签：${tag}`, body, path: `tags/${encodeURIComponent(tag)}/` });
  }

  function page({ title, html, hasMath, path, description }) {
    const body = `
<article class="article">
  <header class="article-head wrap-text"><h1>${esc(title)}</h1></header>
  <div class="wrap-text prose">${html}</div>
</article>`;
    return layout({ title, body, path, hasMath, description });
  }

  function search() {
    const body = `
<header class="page-head wrap-text"><p class="kicker">SEARCH</p><h1>搜索</h1></header>
<div class="wrap-text search-wrap">
  <form class="search-form" role="search" onsubmit="return false">
    <input id="q" type="search" placeholder="搜索标题、摘要、标签、人物……" autocomplete="off" autofocus aria-label="搜索关键词">
  </form>
  <p class="muted small" id="search-status"></p>
  <ol class="search-results" id="search-results"></ol>
</div>`;
    return layout({ title: '搜索', body, path: 'search/', bodyClass: 'page-search' });
  }

  function offline() {
    const body = `
<section class="wrap-text empty-state">
  <p class="kicker">OFFLINE</p>
  <h1>暂时离线</h1>
  <p class="lede">当前网络不可用，这个页面还没有被缓存。已经读过的文章可以离线访问。</p>
  <p><a class="btn" href="${u()}">返回首页 ${ICONS.arrow}</a></p>
</section>`;
    return layout({ title: '离线', body, path: 'offline/' });
  }

  function notFound() {
    const body = `
<section class="wrap-text empty-state">
  <p class="kicker">ERROR 404</p>
  <h1>页面不存在</h1>
  <p class="lede">链接可能已经变化。可以试试搜索，或者回到首页。</p>
  <p class="btn-row"><a class="btn" href="${u('search/')}">搜索 ${ICONS.arrow}</a><a class="btn ghost" href="${u()}">首页 ${ICONS.arrow}</a></p>
</section>`;
    return layout({ title: '404', body, path: '404.html' });
  }

  return { layout, home, article, brief, list, archive, tagIndex, tagPage, page, search, offline, notFound };
}
