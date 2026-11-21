(() => {
  const root = document.documentElement;
  const BASE = root.dataset.base || '/';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Theme: auto → light → dark ---------- */
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
  const themeBtn = $('[data-action="theme"]');
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');

  function syncThemeColor() {
    const bg = getComputedStyle(document.body).backgroundColor;
    $$('meta[name="theme-color"]').forEach((m) => {
      if (root.dataset.theme === 'auto') {
        m.content = m.media.includes('dark') ? '#090c14' : '#f5f6f8';
      } else {
        m.content = bg;
      }
    });
  }

  function setTheme(t, persist = true) {
    root.dataset.theme = t;
    if (persist) {
      try { t === 'auto' ? localStorage.removeItem('theme') : localStorage.setItem('theme', t); } catch {}
    }
    if (themeBtn) themeBtn.title = `主题：${THEME_LABEL[t]}`;
    requestAnimationFrame(() => {
      syncThemeColor();
      document.dispatchEvent(new Event('themechange'));
    });
  }
  setTheme(root.dataset.theme || 'auto', false);
  themeBtn?.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(root.dataset.theme) + 1) % THEMES.length];
    setTheme(next);
    toast(`主题：${THEME_LABEL[next]}`, null, 1400);
  });
  darkMQ.addEventListener?.('change', () => {
    if (root.dataset.theme !== 'auto') return;
    syncThemeColor();
    document.dispatchEvent(new Event('themechange'));
  });

  /* ---------- Hero network ---------- */
  const canvas = $('.hero-canvas');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const LINK = 140;
    let w = 0, h = 0, pts = [], colors = [], raf = 0, running = false;
    const pointer = { x: -1e4, y: -1e4 };
    const rgb = (v) => {
      v = v.trim();
      if (v.startsWith('#')) {
        const n = v.length === 4 ? v.slice(1).split('').map((c) => c + c).join('') : v.slice(1, 7);
        return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
      }
      return (v.match(/\d+/g) || [128, 128, 128]).slice(0, 3).map(Number);
    };
    const readColors = () => {
      const cs = getComputedStyle(root);
      colors = ['--c-research', '--c-primer', '--accent', '--c-viewpoint'].map((k) => rgb(cs.getPropertyValue(k)));
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, Math.max(28, (w * h) / 11000)));
      pts = Array.from({ length: n }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.6 + 0.7,
        c: i % 9 === 0 ? 1 + (i % 3) : 0,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          const [r, g, bl] = colors[a.c || b.c];
          ctx.strokeStyle = `rgba(${r},${g},${bl},${(1 - Math.sqrt(d2) / LINK) * 0.32})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        const pd = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (pd < 180) {
          const [r, g, bl] = colors[2];
          ctx.strokeStyle = `rgba(${r},${g},${bl},${(1 - pd / 180) * 0.6})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }
      for (const p of pts) {
        const [r, g, b] = colors[p.c];
        ctx.fillStyle = `rgba(${r},${g},${b},${p.c ? 0.95 : 0.7})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.c ? p.r + 1.2 : p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (running && !reduce) raf = requestAnimationFrame(draw);
    };
    const start = () => { if (!running) { running = true; raf = requestAnimationFrame(draw); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    readColors();
    resize();
    draw();
    if (!reduce) {
      new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop())).observe(canvas);
      document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
      const host = canvas.parentElement;
      host.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
      });
      host.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });
    }
    let rt;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); draw(); }, 150); });
    document.addEventListener('themechange', () => { readColors(); draw(); });
  }

  /* ---------- Code copy ---------- */
  $$('.prose pre').forEach((pre) => {
    if (!navigator.clipboard) return;
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'copy-btn', textContent: 'COPY' });
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.innerText || '');
        btn.textContent = 'COPIED';
      } catch {
        btn.textContent = 'FAILED';
      }
      setTimeout(() => (btn.textContent = 'COPY'), 1500);
    });
    pre.append(btn);
  });

  /* ---------- Fullscreen ---------- */
  const fsBtn = $('[data-action="fullscreen"]');
  const fsSupported = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function toggleFullscreen() {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      req?.call(root, { navigationUI: 'hide' })?.catch?.(() => {});
    }
  }
  function onFsChange() {
    const on = !!fsElement();
    root.classList.toggle('is-fullscreen', on);
    if (fsBtn) {
      fsBtn.title = on ? '退出全屏 (F)' : '全屏 (F)';
      fsBtn.setAttribute('aria-pressed', String(on));
    }
  }
  if (fsSupported && fsBtn) {
    fsBtn.hidden = false;
    fsBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
      toggleFullscreen();
    });
  }

  /* ---------- Reading progress ---------- */
  const bar = $('.progress span');
  const prose = $('.prose');
  if (bar && prose && document.body.classList.contains('page-article')) {
    let ticking = false;
    const update = () => {
      const rect = prose.getBoundingClientRect();
      const total = rect.height - innerHeight * 0.6;
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(total, 1)));
      bar.style.width = `${(p * 100).toFixed(2)}%`;
      ticking = false;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- TOC ---------- */
  const tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const visible = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
        const heads = $$('.prose h2[id], .prose h3[id]');
        const current = heads.find((h) => visible.has(h.id)) || heads.filter((h) => h.getBoundingClientRect().top < 120).pop();
        tocLinks.forEach((a) => a.classList.remove('active'));
        if (current) map.get(current.id)?.classList.add('active');
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    $$('.prose h2[id], .prose h3[id]').forEach((h) => io.observe(h));
    const details = $('.toc details');
    if (details && matchMedia('(max-width: 1179px)').matches && tocLinks.length > 6) details.open = false;
  }

  /* ---------- Search ---------- */
  const q = $('#q');
  if (q) {
    const results = $('#search-results');
    const status = $('#search-status');
    let index = null;
    const escHTML = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const mark = (text, terms) => {
      let h = escHTML(text);
      terms.forEach((t) => { if (t) h = h.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`); });
      return h;
    };
    const snippet = (text, term) => {
      const i = text.toLowerCase().indexOf(term.toLowerCase());
      if (i < 0) return text.slice(0, 110);
      const s = Math.max(0, i - 40);
      return (s > 0 ? '…' : '') + text.slice(s, s + 120) + '…';
    };
    async function run() {
      const v = q.value.trim();
      const url = new URL(location.href);
      v ? url.searchParams.set('q', v) : url.searchParams.delete('q');
      history.replaceState(null, '', url);
      if (!v) { results.innerHTML = ''; status.textContent = index ? `共 ${index.length} 篇可搜索` : ''; return; }
      index ??= await fetch(`${BASE}search.json`).then((r) => r.json());
      const terms = v.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = index
        .map((it) => {
          const fields = [[it.t, 6], [it.g.join(' '), 4], [it.s, 3], [it.x, 1]];
          let score = 0;
          for (const term of terms) {
            let hit = 0;
            for (const [f, w] of fields) if (f.toLowerCase().includes(term)) hit += w;
            if (!hit) return null;
            score += hit;
          }
          return { it, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || b.it.d.localeCompare(a.it.d))
        .slice(0, 50);
      status.textContent = scored.length ? `找到 ${scored.length} 条结果` : '没有找到相关内容';
      results.innerHTML = scored
        .map(({ it }) => {
          const body = it.s && it.s.toLowerCase().includes(terms[0]) ? it.s : snippet(it.x || it.s, terms[0]);
          return `<li><p class="meta">${it.y} · ${it.d}</p><a href="${BASE}${it.u}">${mark(it.t, terms)}</a><p>${mark(body, terms)}</p></li>`;
        })
        .join('');
    }
    let timer;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    const initial = new URLSearchParams(location.search).get('q');
    if (initial) { q.value = initial; run(); }
  }

  /* ---------- Toast ---------- */
  const toastEl = $('.toast');
  let toastTimer;
  function toast(msg, action, ms = 0) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.innerHTML = '';
    toastEl.append(Object.assign(document.createElement('span'), { textContent: msg }));
    if (action) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: action.label });
      b.addEventListener('click', () => { toastEl.hidden = true; action.run(); });
      toastEl.append(b);
    }
    toastEl.hidden = false;
    if (ms) toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
  }

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
        const prompt = (w) =>
          toast('有新内容可用', { label: '刷新', run: () => w.postMessage('SKIP_WAITING') });
        if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w);
          });
        });
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          location.reload();
        });
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      } catch {}
    });
  }

  const installBtn = $('[data-action="install"]');
  let deferred;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (installBtn) installBtn.hidden = false;
  });
  installBtn?.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    installBtn.hidden = true;
  });
  addEventListener('appinstalled', () => { if (installBtn) installBtn.hidden = true; toast('已安装到设备', null, 2000); });
})();
