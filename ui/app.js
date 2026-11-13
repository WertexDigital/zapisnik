/* Zápisník – vykreslení poznámky (Markdown + Obsidian syntaxe) */
'use strict';

const S = { path: null, links: {}, embeds: {}, drawings: {}, depth: 0 };
const post = (msg) => window.webkit?.messageHandlers?.app?.postMessage(msg);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localURL = (rel) => (window.LOCAL_BASE || 'zapisnik://localhost/') + rel.split('/').map(encodeURIComponent).join('/');
// posuvná oblast se čtením (v aplikaci je to #content, jinak celá stránka)
const SC = () => document.getElementById('content') || document.scrollingElement;
const dirOf = (rel) => rel && rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const CALLOUTS = {
  note: ['Poznámka', '✏️', 'blue'], abstract: ['Shrnutí', '📋', 'cyan'], summary: ['Shrnutí', '📋', 'cyan'], tldr: ['Shrnutí', '📋', 'cyan'],
  info: ['Info', 'ℹ️', 'blue'], todo: ['Úkol', '☑️', 'blue'], tip: ['Tip', '💡', 'cyan'], hint: ['Tip', '💡', 'cyan'],
  important: ['Důležité', '❗', 'cyan'], success: ['Hotovo', '✅', 'green'], check: ['Kontrola', '✅', 'green'], done: ['Hotovo', '✅', 'green'],
  question: ['Otázka', '❓', 'orange'], help: ['Otázka', '❓', 'orange'], faq: ['Otázka', '❓', 'orange'],
  warning: ['Pozor', '⚠️', 'orange'], caution: ['Pozor', '⚠️', 'orange'], attention: ['Pozor', '⚠️', 'orange'],
  failure: ['Chyba', '✖️', 'red'], fail: ['Chyba', '✖️', 'red'], missing: ['Chybí', '✖️', 'red'], danger: ['Nebezpečí', '⚡', 'red'],
  error: ['Chyba', '⚡', 'red'], bug: ['Chyba', '🐞', 'red'], example: ['Příklad', '📎', 'purple'], quote: ['Citace', '💬', 'gray'], cite: ['Citace', '💬', 'gray'],
};

function katexHTML(tex, display) {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' }); }
  catch (e) { return `<code>${esc(tex)}</code>`; }
}

function splitTarget(inner) {
  let alias = null, heading = null, target = inner;
  const p = target.indexOf('|'); if (p >= 0) { alias = target.slice(p + 1); target = target.slice(0, p); }
  const h = target.indexOf('#'); if (h >= 0) { heading = target.slice(h + 1); target = target.slice(0, h); }
  return { target: target.trim(), heading: heading ? heading.replace(/^\^/, '').trim() : null, alias: alias ? alias.trim() : null };
}

function renderWiki(tok) {
  const { target, heading, alias } = splitTarget(tok.inner);
  const info = target ? (S.links[target] || { kind: 'missing' }) : { kind: 'note', rel: S.path };
  if (tok.embed && info.kind === 'drawing') {
    return `<span class="media drawing-wrap"><span class="drawing">${S.drawings[info.rel] || 'Kresba nenalezena'}</span>${S.depth ? '' : `<button class="embed-btn" data-drawing="${esc(info.rel)}">✏️ Upravit kresbu</button>`}</span>`;
  }
  if (tok.embed && info.kind === 'image') {
    const w = alias && /^\d+(x\d+)?$/.test(alias) ? ` style="width:${alias.split('x')[0]}px"` : '';
    const alt = alias && !w ? esc(alias) : esc(target);
    return `<span class="media"><img class="embed-img" src="${localURL(info.rel)}" alt="${alt}"${w} loading="lazy">${S.depth ? '' : `<button class="embed-btn" data-annotate="${esc(info.rel)}">✏️ Kreslit do obrázku</button>`}</span>`;
  }
  if (tok.embed && info.kind === 'note' && S.depth < 2 && S.embeds[info.rel] != null) {
    S.depth++;
    const inner = marked.parse(prep(S.embeds[info.rel]));
    S.depth--;
    const name = info.rel.split('/').pop().replace(/\.md$/, '');
    return `<div class="embed-note"><a class="embed-title internal" data-rel="${esc(info.rel)}">${esc(name)}</a>${inner}</div>`;
  }
  const label = alias || (heading && !target ? heading : (target.split('/').pop() + (heading ? ' › ' + heading : '')));
  if (info.kind === 'missing') return `<a class="internal missing" data-create="${esc(target)}" title="Poznámka zatím neexistuje – klikni a vytvoří se">${esc(label)}</a>`;
  const cls = info.kind === 'note' ? 'internal' : 'internal file';
  const icon = info.kind === 'pdf' ? '📄 ' : (info.kind === 'image' || info.kind === 'file') ? '📎 ' : '';
  return `<a class="${cls}" data-rel="${esc(info.rel)}"${heading ? ` data-heading="${esc(heading)}"` : ''}>${icon}${esc(label)}</a>`;
}

marked.use({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: 'callout', level: 'block',
      start(src) { const m = src.match(/^> ?\[!/m); return m ? m.index : undefined; },
      tokenizer(src) {
        const m = /^(?:>[^\n]*(?:\n|$))+/.exec(src);
        if (!m) return;
        const lines = m[0].replace(/\n$/, '').split('\n');
        const head = /^> ?\[!([A-Za-z-]+)\]([-+]?)[ \t]*(.*)$/.exec(lines[0]);
        if (!head) return;
        const body = lines.slice(1).map(l => l.replace(/^> ?/, '')).join('\n');
        const tok = { type: 'callout', raw: m[0], ctype: head[1].toLowerCase(), fold: head[2], title: head[3], tokens: [], titleTokens: [] };
        this.lexer.blockTokens(body, tok.tokens);
        this.lexer.inline(head[3], tok.titleTokens);
        return tok;
      },
      renderer(tok) {
        const def = CALLOUTS[tok.ctype] || [tok.ctype.charAt(0).toUpperCase() + tok.ctype.slice(1), '📌', 'blue'];
        const title = tok.title.trim() ? this.parser.parseInline(tok.titleTokens) : def[0];
        const body = this.parser.parse(tok.tokens);
        const head = `<span class="callout-icon">${def[1]}</span><span class="callout-text">${title}</span>`;
        if (tok.fold) {
          return `<details class="callout c-${def[2]}" data-type="${tok.ctype}"${tok.fold === '+' ? ' open' : ''}><summary class="callout-title">${head}</summary><div class="callout-body">${body}</div></details>\n`;
        }
        return `<div class="callout c-${def[2]}" data-type="${tok.ctype}"><div class="callout-title">${head}</div>${body.trim() ? `<div class="callout-body">${body}</div>` : ''}</div>\n`;
      },
    },
    {
      name: 'mathBlock', level: 'block',
      start(src) { const i = src.indexOf('$$'); return i < 0 ? undefined : i; },
      tokenizer(src) { const m = /^ *\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src); if (m) return { type: 'mathBlock', raw: m[0], text: m[1] }; },
      renderer(tok) { return `<div class="math-block">${katexHTML(tok.text.trim(), true)}</div>\n`; },
    },
    {
      name: 'mathInline', level: 'inline',
      start(src) { const i = src.indexOf('$'); return i < 0 ? undefined : i; },
      tokenizer(src) {
        let m = /^\$\$([^$]+?)\$\$/.exec(src);
        if (m) return { type: 'mathInline', raw: m[0], text: m[1], display: true };
        m = /^\$(?![\s$])((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?!\d)/.exec(src);
        if (m) return { type: 'mathInline', raw: m[0], text: m[1], display: false };
      },
      renderer(tok) { return katexHTML(tok.text, tok.display); },
    },
    {
      name: 'wiki', level: 'inline',
      start(src) { const i = src.search(/!?\[\[/); return i < 0 ? undefined : i; },
      tokenizer(src) { const m = /^(!?)\[\[([^\n]+?)\]\]/.exec(src); if (m) return { type: 'wiki', raw: m[0], embed: m[1] === '!', inner: m[2] }; },
      renderer(tok) { return renderWiki(tok); },
    },
    {
      name: 'mark', level: 'inline',
      start(src) { const i = src.indexOf('=='); return i < 0 ? undefined : i; },
      tokenizer(src) { const m = /^==(?=\S)([^=\n]+?)==/.exec(src); if (m) return { type: 'mark', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) }; },
      renderer(tok) { return `<mark>${this.parser.parseInline(tok.tokens)}</mark>`; },
    },
  ],
  renderer: {
    code(code, info) {
      const lang = (info || '').trim().split(/\s+/)[0].toLowerCase();
      if (lang === 'mermaid') return `<div class="mermaid">${esc(code)}</div>\n`;
      const map = { cs: 'csharp', 'c#': 'csharp', razor: 'xml', cshtml: 'xml', html: 'xml', sh: 'bash', zsh: 'bash', ps1: 'powershell', tsql: 'sql' };
      const l = map[lang] || lang;
      let html = esc(code);
      try { if (l && hljs.getLanguage(l)) html = hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch (e) {}
      return `<div class="code"><button class="copy" title="Kopírovat">Kopírovat</button>${lang && lang !== 'text' ? `<span class="lang">${esc(lang)}</span>` : ''}<pre><code class="hljs">${html}</code></pre></div>\n`;
    },
    image(href, title, text) {
      let alt = text || '', width = '';
      const m = /^(.*?)\|(\d+)(?:x\d+)?$/.exec(alt);
      if (m) { alt = m[1]; width = ` style="width:${m[2]}px"`; }
      let src = href || '';
      if (!/^[a-z]+:/i.test(src)) {
        const rel = decodeURI(src).replace(/^\.\//, '');
        src = localURL(dirOf(S.path) ? dirOf(S.path) + '/' + rel : rel);
      }
      const cap = alt && !/^\d+$/.test(alt) ? `<figcaption>${esc(alt)}</figcaption>` : '';
      return `<figure><img src="${esc(src)}" alt="${esc(alt)}"${width}${title ? ` title="${esc(title)}"` : ''} loading="lazy">${cap}</figure>`;
    },
    checkbox(checked) { return `<input type="checkbox" class="task"${checked ? ' checked' : ''}> `; },
  },
});

function splitFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(md);
  if (!m) return { props: [], body: md };
  const props = []; let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_\-ěščřžýáíéůúťďňóĚŠČŘŽÝÁÍÉŮÚ]+):\s*(.*)$/.exec(line);
    if (kv) { cur = { key: kv[1], values: kv[2] ? [kv[2].replace(/^["']|["']$/g, '')] : [] }; props.push(cur); }
    else { const li = /^\s*-\s*(.*)$/.exec(line); if (li && cur) cur.values.push(li[1].replace(/^["']|["']$/g, '')); }
  }
  return { props, body: md.slice(m[0].length) };
}

function prep(md) {
  const { body } = splitFrontmatter(md);
  // Obsidian komentáře %% … %% se nezobrazují
  let out = body.replace(/%%[\s\S]*?%%/g, '');
  // svislítko v [[odkazu|textu]] uvnitř tabulky by rozdělilo buňku → escapovat
  out = out.split('\n').map(l => /^\s*\|/.test(l) ? l.replace(/\[\[[^\n]*?\]\]/g, w => w.replace(/(?<!\\)\|/g, '\\|')) : l).join('\n');
  // tučný popisek („**Souvisí s:**“) hned pod seznamem má být samostatný odstavec
  let inCode = false, prevList = false;
  out = out.split('\n').map(l => {
    if (/^\s*```/.test(l)) { inCode = !inCode; prevList = false; return l; }
    if (inCode) return l;
    const isLabel = prevList && /^\*\*[^*]+\*\*\s*$/.test(l);
    prevList = /^\s*(?:[-*+]|\d+[.)])\s/.test(l) || (prevList && /^\s+\S/.test(l));
    return isLabel ? '\n' + l : l;
  }).join('\n');
  return out;
}

const LABELS = { '⏱': '⏱', predmet: 'Předmět', cast: 'Část', otazka: 'Otázka', procenta: 'Umím', datum: 'Učit se', tags: 'Štítky', prepsano: 'Přepsáno', vytvoreno: 'Vytvořeno', aliases: 'Aliasy' };
function propsHTML(props) {
  const shown = props.filter(p => p.values.length && !['vytvoreno', 'aliases'].includes(p.key));
  if (!shown.length) return '';
  return `<div class="props">${shown.map(p => {
    let v = p.values.join(', ');
    if (p.key === 'procenta') v += ' %';
    if (p.key === 'tags') v = p.values.map(t => '#' + t).join(' ');
    return `<span class="prop"><span class="k">${esc(LABELS[p.key] || p.key)}</span> ${esc(v)}</span>`;
  }).join('')}</div>`;
}

function headingId(text) { return 'h-' + fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function scrollToHeading(text) {
  if (!text) { SC().scrollTop = 0; return; }
  const want = fold(text);
  const hs = [...document.querySelectorAll('#doc h1,#doc h2,#doc h3,#doc h4,#doc h5,#doc h6')];
  const h = hs.find(e => fold(e.textContent) === want) || hs.find(e => fold(e.textContent).startsWith(want));
  if (h) { h.scrollIntoView({ block: 'start' }); h.classList.add('flash'); setTimeout(() => h.classList.remove('flash'), 1200); }
}

let mermaidReady = false;
function setupMermaid() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'loose', fontFamily: '-apple-system, sans-serif' });
  mermaidReady = true;
}

window.render = function (p) {
  const same = p.path === S.path;
  const y = SC().scrollTop;
  S.path = p.path; S.links = p.links || {}; S.embeds = p.embeds || {}; S.drawings = p.drawings || {}; S.depth = 0;
  const { props } = splitFrontmatter(p.markdown);
  let html;
  try { html = marked.parse(prep(p.markdown)); }
  catch (e) { html = `<pre>${esc(String(e))}</pre><pre>${esc(p.markdown)}</pre>`; }
  const doc = document.getElementById('doc');
  const words = (prep(p.markdown).match(/[\p{L}\p{N}]+/gu) || []).length;
  if (words > 120) props.push({ key: '⏱', values: [`${Math.max(1, Math.round(words / 200))} min čtení`] });
  doc.innerHTML = propsHTML(props) + (p.markdown.trim() ? html : '<p class="empty">Prázdná poznámka – přepni na <b>Psát</b> (⌘E) a začni psát.</p>');
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { h.id = headingId(h.textContent); });
  doc.querySelectorAll('table').forEach(t => { const w = document.createElement('div'); w.className = 'table-wrap'; t.replaceWith(w); w.appendChild(t); });
  let i = 0;
  doc.querySelectorAll('input.task').forEach(cb => { if (!cb.closest('.embed-note')) cb.dataset.index = i++; else cb.disabled = true; });
  const nodes = doc.querySelectorAll('.mermaid');
  if (nodes.length) {
    if (!mermaidReady) setupMermaid();
    mermaid.run({ nodes }).catch(() => {});
  }
  if (same && !p.heading) SC().scrollTop = y;
  else if (p.heading) scrollToHeading(p.heading);
  else SC().scrollTop = 0;
};
window.scrollToHeading = scrollToHeading;

document.addEventListener('click', (e) => {
  const eb = e.target.closest('.embed-btn');
  if (eb && document.body.dataset.mode === 'read') {
    e.preventDefault();
    if (eb.dataset.drawing) {
      const rel = eb.dataset.drawing;
      window.ZE.openDrawing({ svg: S.drawings[rel], onSave: (svg) => post({ type: 'saveDrawing', svg, rel, insert: false }) });
    } else if (eb.dataset.annotate) {
      window.ZE.openDrawing({ imageURL: localURL(eb.dataset.annotate), onSave: (svg) => post({ type: 'saveDrawing', svg, rel: null, insert: false, afterImage: eb.dataset.annotate }) });
    }
    return;
  }
  const copy = e.target.closest('button.copy');
  if (copy) {
    const code = copy.parentElement.querySelector('code').innerText;
    post({ type: 'copy', text: code });
    copy.textContent = 'Zkopírováno'; setTimeout(() => (copy.textContent = 'Kopírovat'), 1200);
    return;
  }
  const a = e.target.closest('a');
  if (!a) return;
  if (a.dataset.create != null) { e.preventDefault(); post({ type: 'create', name: a.dataset.create }); return; }
  if (a.dataset.rel != null) {
    e.preventDefault();
    if (a.dataset.rel === S.path && a.dataset.heading) { scrollToHeading(a.dataset.heading); return; }
    post({ type: 'open', rel: a.dataset.rel, heading: a.dataset.heading || null, newWindow: e.metaKey });
    return;
  }
  const href = a.getAttribute('href') || '';
  if (/^https?:|^mailto:/i.test(href)) { e.preventDefault(); post({ type: 'external', url: href }); return; }
  if (href.startsWith('#')) { e.preventDefault(); scrollToHeading(decodeURIComponent(href.slice(1))); }
});

document.addEventListener('change', (e) => {
  const cb = e.target;
  if (cb.matches && cb.matches('input.task') && cb.dataset.index != null) post({ type: 'toggleTask', index: Number(cb.dataset.index), checked: cb.checked });
});

document.addEventListener('dblclick', (e) => {
  if (e.target.closest('a, input, button, summary, .code')) return;
  if (e.altKey) post({ type: 'edit' });
});

// ===== Režim, nastavení vzhledu =====
window.setMode = (m) => { document.body.dataset.mode = m; if (m === 'edit') window.ZE?.focus(); };

const FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI Variable Display", "Segoe UI", sans-serif',
  newyork: '"New York", ui-serif, Cambria, Georgia, serif',
  charter: 'Charter, "Iowan Old Style", Georgia, serif',
  iowan: '"Iowan Old Style", Palatino, Georgia, serif',
  georgia: 'Georgia, "Times New Roman", serif',
  avenir: '"Avenir Next", Avenir, -apple-system, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  palatino: 'Palatino, "Palatino Linotype", serif',
  mono: '"SF Mono", ui-monospace, Menlo, Consolas, "Cascadia Mono", monospace',
};
const ACCENTS = { violet: '124, 92, 255', blue: '10, 132, 255', teal: '18, 165, 148', green: '48, 164, 108', orange: '247, 107, 21', pink: '233, 61, 130', red: '229, 72, 77', graphite: '110, 110, 118' };
const WIDTHS = { narrow: '640px', medium: '760px', wide: '920px', full: '100%' };
window.applySettings = (st) => {
  const r = document.documentElement.style;
  r.setProperty('--font-body', FONTS[st.fontBody] || FONTS.system);
  r.setProperty('--font-heading', st.fontHeading === 'same' || !FONTS[st.fontHeading] ? 'var(--font-body)' : FONTS[st.fontHeading]);
  r.setProperty('--font-size', (st.fontSize || 17) + 'px');
  r.setProperty('--line-height', String(st.lineHeight || 1.7));
  r.setProperty('--line-width', WIDTHS[st.lineWidth] || WIDTHS.medium);
  r.setProperty('--accent-rgb', ACCENTS[st.accent] || ACCENTS.violet);
  if (st.theme === 'sepia') document.documentElement.dataset.theme = 'sepia'; else delete document.documentElement.dataset.theme;
  window.ZE?.refresh?.();
};

// ===== Zkoušení z otázek (rámečky [!question]) =====
window.startQuiz = () => {
  const qs = [...document.querySelectorAll('#doc .callout[data-type="question"], #doc .callout[data-type="faq"], #doc .callout[data-type="help"]')]
    .filter(c => !c.closest('.embed-note'))
    .map(c => ({ q: c.querySelector('.callout-text')?.innerHTML || '', a: c.querySelector('.callout-body')?.innerHTML || '' }));
  const box = document.createElement('div');
  box.id = 'quiz';
  document.body.appendChild(box);
  let order = qs.map((_, i) => i).sort(() => Math.random() - 0.5), i = 0, shown = false, good = [], bad = [];
  const close = () => { box.remove(); document.removeEventListener('keydown', key, true); };
  function draw() {
    if (!qs.length) {
      box.innerHTML = `<div class="quiz-card"><div class="quiz-q">Tahle poznámka nemá otázky na sebezkoušení.</div><p class="quiz-sub">Přidej je v režimu Psát přes / → „Otázka se skrytou odpovědí“.</p><div class="quiz-actions"><button class="primary" data-a="close">Zavřít</button></div></div>`;
      return;
    }
    if (i >= order.length) {
      const pct = Math.round(good.length / order.length * 100);
      box.innerHTML = `<div class="quiz-card"><div class="quiz-top"><span>Hotovo</span><div class="quiz-bar"><i style="width:100%"></i></div><button class="quiz-close" data-a="close">✕</button></div>
        <div class="quiz-score">${pct} %</div><p class="quiz-sub">Umíš ${good.length} z ${order.length} otázek.</p>
        <div class="quiz-actions">${bad.length ? `<button data-a="again">Zopakovat ${bad.length} chybné</button>` : ''}<button data-a="all">Znovu vše</button><button class="primary" data-a="save">Zapsat ${pct} % do poznámky</button></div></div>`;
      box.dataset.pct = pct;
      return;
    }
    const it = qs[order[i]];
    box.innerHTML = `<div class="quiz-card"><div class="quiz-top"><span>Otázka ${i + 1} / ${order.length}</span><div class="quiz-bar"><i style="width:${i / order.length * 100}%"></i></div><button class="quiz-close" data-a="close" title="Ukončit (Esc)">✕</button></div>
      <div class="quiz-q">${it.q}</div>
      ${shown ? `<div class="quiz-a markdown">${it.a}</div><div class="quiz-actions"><button class="bad" data-a="bad">Neumím<kbd>1</kbd></button><button class="good" data-a="good">Umím<kbd>2</kbd></button></div>`
        : `<p class="quiz-sub">Odpověz nahlas nebo v duchu, pak si zkontroluj odpověď.</p><div class="quiz-actions"><button class="primary" data-a="show">Ukázat odpověď<kbd>mezerník</kbd></button></div>`}</div>`;
  }
  function act(a) {
    if (a === 'close') return close();
    if (a === 'show') shown = true;
    if (a === 'good' || a === 'bad') { (a === 'good' ? good : bad).push(order[i]); i++; shown = false; }
    if (a === 'again') { order = bad.slice().sort(() => Math.random() - 0.5); i = 0; good = []; bad = []; }
    if (a === 'all') { order = qs.map((_, k) => k).sort(() => Math.random() - 0.5); i = 0; good = []; bad = []; }
    if (a === 'save') { post({ type: 'setPercent', value: Number(box.dataset.pct) }); return close(); }
    draw();
  }
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === ' ' && !shown && i < order.length) { e.preventDefault(); act('show'); }
    else if (shown && e.key === '1') act('bad');
    else if (shown && e.key === '2') act('good');
  }
  document.addEventListener('keydown', key, true);
  draw();
};

post({ type: 'ready' });
