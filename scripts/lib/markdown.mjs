import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { slugify, stripTags } from './util.mjs';

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
  markedKatex({ throwOnError: false, nonStandard: true, output: 'html' }),
  { gfm: true },
);

export function renderMarkdown(src = '') {
  let html = marked.parse(src);
  const toc = [];
  const used = new Set();
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = stripTags(inner);
    let id = slugify(text) || `sec-${toc.length + 1}`;
    while (used.has(id)) id += '-1';
    used.add(id);
    toc.push({ level: Number(level), id, text });
    return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${level}>`;
  });
  html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"');
  html = html.replace(/<pre><code class="hljs language-([\w+#-]+)">/g, '<pre data-lang="$1"><code class="hljs language-$1">');
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  const hasMath = html.includes('class="katex');
  return { html, toc, hasMath };
}

export function renderInline(src = '') {
  return marked.parseInline(src);
}
