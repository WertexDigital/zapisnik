// Živý náhled: Markdown se zobrazuje jako hotový text, značky se ukážou jen na řádku s kurzorem.
import { StateField } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { icon } from './icons.js';

export const Z = { path: null, links: {}, drawings: {}, embeds: {}, notes: [], files: [], post: (m) => window.webkit?.messageHandlers?.app?.postMessage(m) };

export const CALLOUTS = {
  note: ['Poznámka', '✏️', 'blue'], abstract: ['Shrnutí', '📋', 'cyan'], summary: ['Shrnutí', '📋', 'cyan'], tldr: ['Shrnutí', '📋', 'cyan'],
  info: ['Info', 'ℹ️', 'blue'], todo: ['Úkol', '☑️', 'blue'], tip: ['Tip', '💡', 'cyan'], hint: ['Tip', '💡', 'cyan'],
  important: ['Důležité', '❗', 'cyan'], success: ['Hotovo', '✅', 'green'], check: ['Kontrola', '✅', 'green'], done: ['Hotovo', '✅', 'green'],
  question: ['Otázka', '❓', 'orange'], help: ['Otázka', '❓', 'orange'], faq: ['Otázka', '❓', 'orange'],
  warning: ['Pozor', '⚠️', 'orange'], caution: ['Pozor', '⚠️', 'orange'], attention: ['Pozor', '⚠️', 'orange'],
  failure: ['Chyba', '✖️', 'red'], fail: ['Chyba', '✖️', 'red'], missing: ['Chybí', '✖️', 'red'], danger: ['Nebezpečí', '⚡', 'red'],
  error: ['Chyba', '⚡', 'red'], bug: ['Chyba', '🐞', 'red'], example: ['Příklad', '📎', 'purple'], quote: ['Citace', '💬', 'gray'], cite: ['Citace', '💬', 'gray'],
};

export const localURL = (rel) => (window.LOCAL_BASE || 'zapisnik://localhost/') + rel.split('/').map(encodeURIComponent).join('/');
export const kindOf = (r) => {
  const e = r.split('.').pop().toLowerCase();
  if (e === 'md') return 'note';
  if (e === 'svg') return 'drawing';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  return 'file';
};
export function resolveTarget(target) {
  if (!target) return { kind: 'note', rel: Z.path };
  if (Z.links[target]) return Z.links[target];
  const low = target.toLowerCase();
  let r = Z.files.find(f => f.toLowerCase() === low || f.toLowerCase() === low + '.md');
  if (!r) r = Z.files.find(f => { const b = f.split('/').pop().toLowerCase(); return b === low || b === low + '.md'; });
  return r ? { rel: r, kind: kindOf(r) } : { kind: 'missing' };
}
export function splitTarget(inner) {
  let alias = null, heading = null, target = inner;
  const p = target.indexOf('|'); if (p >= 0) { alias = target.slice(p + 1); target = target.slice(0, p); }
  if (target.endsWith('\\')) target = target.slice(0, -1);
  const h = target.indexOf('#'); if (h >= 0) { heading = target.slice(h + 1); target = target.slice(0, h); }
  return { target: target.trim(), heading: heading ? heading.trim() : null, alias: alias ? alias.trim() : null };
}

// ---------- widgety

class LinkWidget extends WidgetType {
  constructor(label, info, heading, target) { super(); this.label = label; this.info = info; this.heading = heading; this.target = target; }
  eq(o) { return o.label === this.label && o.info.rel === this.info.rel && o.heading === this.heading; }
  toDOM() {
    const a = document.createElement('span');
    const missing = this.info.kind === 'missing';
    a.className = 'cm-link-widget' + (missing ? ' missing' : '');
    a.textContent = (this.info.kind === 'pdf' ? '📄 ' : '') + this.label;
    a.title = missing ? 'Poznámka zatím neexistuje – klikni a vytvoří se' : 'Klikni pro otevření';
    a.addEventListener('mousedown', (e) => e.preventDefault());
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (missing) Z.post({ type: 'create', name: this.target });
      else Z.post({ type: 'open', rel: this.info.rel, heading: this.heading });
    });
    return a;
  }
  ignoreEvent() { return true; }
}

class ImageWidget extends WidgetType {
  constructor(src, width, rel) { super(); this.src = src; this.width = width; this.rel = rel; }
  eq(o) { return o.src === this.src && o.width === this.width; }
  toDOM(view) {
    const w = document.createElement('span');
    w.className = 'cm-embed';
    const img = document.createElement('img');
    img.src = this.src;
    if (this.width) img.style.width = this.width + 'px';
    img.onload = () => view.requestMeasure();
    w.appendChild(img);
    if (this.rel) {
      const b = document.createElement('button');
      b.className = 'embed-btn';
      b.innerHTML = icon('pen', 14) + ' Kreslit do obrázku';
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.preventDefault(); window.ZE.annotateImage(this.rel); });
      w.appendChild(b);
    }
    return w;
  }
  ignoreEvent(e) { return e.type !== 'mousedown'; }
}

class DrawingWidget extends WidgetType {
  constructor(rel, svg) { super(); this.rel = rel; this.svg = svg; }
  eq(o) { return o.rel === this.rel && o.svg === this.svg; }
  toDOM(view) {
    const w = document.createElement('span');
    w.className = 'cm-embed cm-drawing';
    w.innerHTML = this.svg || '<span class="missing-drawing">Kresba nenalezena</span>';
    const b = document.createElement('button');
    b.className = 'embed-btn';
    b.innerHTML = icon('pen', 14) + ' Upravit kresbu';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.preventDefault(); window.ZE.editDrawing(this.rel); });
    w.appendChild(b);
    requestAnimationFrame(() => view.requestMeasure());
    return w;
  }
  ignoreEvent(e) { return e.type !== 'mousedown'; }
}

class NoteEmbedWidget extends WidgetType {
  constructor(label, rel) { super(); this.label = label; this.rel = rel; }
  eq(o) { return o.label === this.label && o.rel === this.rel; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-note-embed';
    s.textContent = '↳ Vložená poznámka: ' + this.label;
    s.addEventListener('mousedown', (e) => e.preventDefault());
    s.addEventListener('click', () => this.rel && Z.post({ type: 'open', rel: this.rel }));
    return s;
  }
  ignoreEvent() { return true; }
}

class CheckboxWidget extends WidgetType {
  constructor(checked, pos) { super(); this.checked = checked; this.pos = pos; }
  eq(o) { return o.checked === this.checked && o.pos === this.pos; }
  toDOM(view) {
    const c = document.createElement('input');
    c.type = 'checkbox'; c.className = 'cm-task'; c.checked = this.checked;
    c.addEventListener('mousedown', (e) => e.preventDefault());
    c.addEventListener('click', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return c;
  }
  ignoreEvent() { return true; }
}

class TextWidget extends WidgetType {
  constructor(cls, text, html) { super(); this.cls = cls; this.text = text; this.html = html; }
  eq(o) { return o.cls === this.cls && o.text === this.text && o.html === this.html; }
  toDOM() { const s = document.createElement('span'); s.className = this.cls; if (this.html != null) s.innerHTML = this.html; else s.textContent = this.text; return s; }
  ignoreEvent() { return false; }
}

class MathWidget extends WidgetType {
  constructor(tex, display) { super(); this.tex = tex; this.display = display; }
  eq(o) { return o.tex === this.tex && o.display === this.display; }
  toDOM() {
    const s = document.createElement(this.display ? 'div' : 'span');
    s.className = this.display ? 'cm-math-block' : 'cm-math-inline';
    try { s.innerHTML = katex.renderToString(this.tex, { displayMode: this.display, throwOnError: false }); } catch (e) { s.textContent = this.tex; }
    return s;
  }
  ignoreEvent() { return false; }
}

class TableWidget extends WidgetType {
  constructor(md, from) { super(); this.md = md; this.from = from; }
  eq(o) { return o.md === this.md; }
  toDOM(view) {
    const d = document.createElement('div');
    d.className = 'cm-table-widget';
    let html = '';
    try { html = window.marked ? window.marked.parse(this.md) : ''; } catch (e) { html = ''; }
    d.innerHTML = `<div class="table-wrap">${html}</div>`;
    d.title = 'Klikni pro úpravu tabulky';
    d.addEventListener('mousedown', (e) => {
      if (e.target.closest('a')) return;
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from + 2 } }); view.focus();
    });
    return d;
  }
  ignoreEvent() { return true; }
}

class PropsWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(o) { return o.text === this.text; }
  toDOM(view) {
    const d = document.createElement('div');
    d.className = 'cm-props';
    const labels = { predmet: 'Předmět', cast: 'Část', otazka: 'Otázka', procenta: 'Umím', datum: 'Učit se', tags: 'Štítky', prepsano: 'Přepsáno' };
    const chips = [];
    let cur = null;
    for (const line of this.text.split('\n').slice(1, -1)) {
      const kv = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
      if (kv) { cur = { k: kv[1], v: kv[2] ? [kv[2].replace(/^["']|["']$/g, '')] : [] }; chips.push(cur); }
      else { const li = /^\s*-\s*(.*)$/.exec(line); if (li && cur) cur.v.push(li[1]); }
    }
    const shown = chips.filter(c => c.v.length && !['vytvoreno', 'aliases'].includes(c.k));
    d.innerHTML = `<span class="cm-props-label">Vlastnosti</span>` + shown.map(c =>
      `<span class="prop"><span class="k">${labels[c.k] || c.k}</span> ${(c.k === 'tags' ? c.v.map(x => '#' + x) : c.v).join(', ')}${c.k === 'procenta' ? ' %' : ''}</span>`).join('');
    d.title = 'Klikni pro úpravu vlastností';
    d.addEventListener('mousedown', (e) => { e.preventDefault(); view.dispatch({ selection: { anchor: view.state.doc.line(2).from } }); view.focus(); });
    return d;
  }
  ignoreEvent() { return true; }
}

// ---------- pomocné

const HIDE = Decoration.replace({});
const lineCls = (cls) => Decoration.line({ class: cls });
const markCls = (cls, style) => Decoration.mark(style ? { class: cls, attributes: { style } } : { class: cls });

function activeLines(view) {
  const s = new Set();
  if (!view.hasFocus) return s;
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number, b = view.state.doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) s.add(i);
  }
  return s;
}

export function frontmatterEnd(doc) {
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return 0;
  for (let i = 2; i <= Math.min(doc.lines, 300); i++) if (doc.line(i).text.trim() === '---') return doc.line(i).to;
  return 0;
}

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (/^(InlineCode|FencedCode|CodeBlock|CodeText|HTMLBlock|Comment)$/.test(n.name)) return true;
  }
  return false;
}

// ---------- hlavní výpočet dekorací

function build(view) {
  const { state } = view;
  const doc = state.doc;
  const act = activeLines(view);
  const isAct = (pos) => act.has(doc.lineAt(pos).number);
  const fmEnd = frontmatterEnd(doc);
  const out = [];
  const replaced = []; // [from, to] atomických náhrad – nic dalšího se s nimi nesmí překrývat
  const overlaps = (f, t) => replaced.some(([a, b]) => f < b && t > a);
  const rep = (f, t, deco) => { if (f >= t || overlaps(f, t)) return false; replaced.push([f, t]); out.push(deco.range(f, t)); return true; };

  for (const { from, to } of view.visibleRanges) {
    // 1) řádky: rámečky, citace, odkazy, zvýraznění, barvy, vzorce
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos);
      pos = line.to + 1;
      if (line.to <= fmEnd) { out.push(lineCls('cm-frontmatter').range(line.from)); continue; }
      const text = line.text;
      const active = act.has(line.number);

      if (text.startsWith('>')) {
        let start = line.number;
        while (start > 1 && doc.line(start - 1).text.startsWith('>')) start--;
        const head = /^>\s?\[!([A-Za-z-]+)\]([-+]?)\s?(.*)$/.exec(doc.line(start).text);
        const isLast = line.number === doc.lines || !doc.line(line.number + 1).text.startsWith('>');
        const isFirst = line.number === start;
        if (head) {
          const def = CALLOUTS[head[1].toLowerCase()] || [head[1], '📌', 'blue'];
          out.push(lineCls(`cm-callout c-${def[2]}${isFirst ? ' cm-callout-first' : ''}${isLast ? ' cm-callout-last' : ''}`).range(line.from));
          if (isFirst) {
            const m = /^>\s?\[![A-Za-z-]+\][-+]?\s?/.exec(text);
            if (!active) rep(line.from, line.from + m[0].length, Decoration.replace({ widget: new TextWidget('cm-callout-icon', null, `${def[1]}${head[3].trim() ? '' : ' ' + def[0]}`) }));
            else out.push(markCls('cm-callout-tag').range(line.from, line.from + m[0].length));
            if (line.from + m[0].length < line.to) out.push(markCls('cm-callout-title').range(line.from + m[0].length, line.to));
          } else if (!active) {
            const m = /^>\s?/.exec(text); rep(line.from, line.from + m[0].length, HIDE);
          }
        } else {
          out.push(lineCls(`cm-quote${isFirst ? ' cm-quote-first' : ''}${isLast ? ' cm-quote-last' : ''}`).range(line.from));
          if (!active) { const m = /^>\s?/.exec(text); rep(line.from, line.from + m[0].length, HIDE); }
        }
      }
      if (/^\s*\|/.test(text)) out.push(lineCls('cm-table').range(line.from));

      // [[odkazy]] a ![[vložení]]
      for (const m of text.matchAll(/(!?)\[\[([^\n]+?)\]\]/g)) {
        const f = line.from + m.index, t = f + m[0].length;
        if (inCode(state, f)) continue;
        const { target, heading, alias } = splitTarget(m[2]);
        const info = resolveTarget(target);
        if (active) { out.push(markCls('cm-wikilink').range(f, t)); replaced.push([f, t]); continue; }
        if (m[1] && info.kind === 'image') {
          const w = alias && /^\d+$/.test(alias) ? +alias : null;
          rep(f, t, Decoration.replace({ widget: new ImageWidget(localURL(info.rel), w, info.rel) }));
        } else if (m[1] && info.kind === 'drawing') {
          rep(f, t, Decoration.replace({ widget: new DrawingWidget(info.rel, Z.drawings[info.rel]) }));
        } else if (m[1] && info.kind === 'note') {
          rep(f, t, Decoration.replace({ widget: new NoteEmbedWidget(target.split('/').pop(), info.rel) }));
        } else {
          const label = alias || (heading && !target ? heading : target.split('/').pop() + (heading ? ' › ' + heading : ''));
          rep(f, t, Decoration.replace({ widget: new LinkWidget(label, info, heading, target) }));
        }
      }
      // ==zvýraznění==
      for (const m of text.matchAll(/==(?=\S)([^=\n]+?)==/g)) {
        const f = line.from + m.index, t = f + m[0].length;
        if (overlaps(f, t) || inCode(state, f)) continue;
        out.push(markCls('cm-highlight').range(f + 2, t - 2));
        if (!active) { rep(f, f + 2, HIDE); rep(t - 2, t, HIDE); }
      }
      // barevný text a barevné zvýraznění
      for (const m of text.matchAll(/<(span|mark) style="(color|background):\s*([^";]+);?">(.*?)<\/\1>/g)) {
        const f = line.from + m.index, t = f + m[0].length;
        if (overlaps(f, t) || inCode(state, f)) continue;
        const openLen = m[0].indexOf('>') + 1, closeLen = m[1].length + 3;
        out.push(markCls(m[2] === 'color' ? 'cm-color' : 'cm-bgcolor', `${m[2]}:${m[3]}`).range(f + openLen, t - closeLen));
        if (!active) { rep(f, f + openLen, HIDE); rep(t - closeLen, t, HIDE); }
        else { out.push(markCls('cm-tag').range(f, f + openLen)); out.push(markCls('cm-tag').range(t - closeLen, t)); }
      }
      // %% komentáře %% – řádek jen s komentářem se schová
      if (!active && /^\s*%%.*%%\s*$/.test(text)) {
        out.push(lineCls('cm-collapsed').range(line.from));
        if (line.to > line.from) rep(line.from, line.to, HIDE);
        continue;
      }
      for (const m of text.matchAll(/%%.*?%%/g)) {
        const f = line.from + m.index;
        if (!overlaps(f, f + m[0].length)) out.push(markCls('cm-comment').range(f, f + m[0].length));
      }
      // vzorce
      for (const m of text.matchAll(/\$\$([^$]+?)\$\$|\$(?![\s$])((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?!\d)/g)) {
        const f = line.from + m.index, t = f + m[0].length;
        if (overlaps(f, t) || inCode(state, f)) continue;
        if (active) out.push(markCls('cm-math-src').range(f, t));
        else rep(f, t, Decoration.replace({ widget: new MathWidget(m[1] ?? m[2], m[1] != null && text.trim() === m[0]) }));
      }
    }

    // 2) strom Markdownu: nadpisy, tučné, kód, seznamy, úkoly…
    syntaxTree(state).iterate({
      from, to,
      enter: (n) => {
        const name = n.name;
        if (name === 'Document') return;
        if (n.to <= fmEnd) return false;
        if (n.from < fmEnd) return;
        const parent = n.node.parent?.name;
        let m;
        if ((m = /^ATXHeading(\d)$/.exec(name))) { out.push(lineCls(`cm-h cm-h${m[1]}`).range(doc.lineAt(n.from).from)); return; }
        if ((m = /^SetextHeading(\d)$/.exec(name))) { out.push(lineCls(`cm-h cm-h${m[1]}`).range(doc.lineAt(n.from).from)); return; }
        switch (name) {
          case 'HeaderMark':
            if (/^ATXHeading/.test(parent) && !isAct(n.from)) rep(n.from, Math.min(n.to + (doc.sliceString(n.to, n.to + 1) === ' ' ? 1 : 0), doc.lineAt(n.from).to), HIDE);
            else out.push(markCls('cm-mark').range(n.from, n.to));
            return;
          case 'EmphasisMark': case 'StrikethroughMark':
            if (!isAct(n.from)) rep(n.from, n.to, HIDE);
            return;
          case 'InlineCode':
            out.push(markCls('cm-inline-code').range(n.from, n.to));
            return;
          case 'CodeMark':
            if (parent === 'InlineCode' && !isAct(n.from)) rep(n.from, n.to, HIDE);
            return false;
          case 'FencedCode': {
            const l1 = doc.lineAt(n.from).number, l2 = doc.lineAt(n.to).number;
            let blockActive = false;
            for (let i = l1; i <= l2; i++) if (act.has(i)) blockActive = true;
            for (let i = l1; i <= l2; i++) {
              const ln = doc.line(i);
              out.push(lineCls(`cm-codeblock${i === l1 ? ' cm-codeblock-first' : ''}${i === l2 ? ' cm-codeblock-last' : ''}`).range(ln.from));
            }
            if (!blockActive) {
              const first = doc.line(l1), lang = first.text.replace(/^\s*```+/, '').trim();
              rep(first.from, first.to, Decoration.replace({ widget: new TextWidget('cm-fence-label', lang || 'kód') }));
              const last = doc.line(l2);
              if (l2 > l1 && /^\s*```+\s*$/.test(last.text)) rep(last.from, last.to, Decoration.replace({ widget: new TextWidget('cm-fence-end', '') }));
            }
            return false;
          }
          case 'Link': {
            if (isAct(n.from)) return false;
            const url = n.node.getChild('URL');
            const href = url ? doc.sliceString(url.from, url.to) : '';
            out.push(Decoration.mark({ class: 'cm-link', attributes: { 'data-href': href, title: href } }).range(n.from, n.to));
            for (let c = n.node.firstChild; c; c = c.nextSibling) if (c.name === 'LinkMark' || c.name === 'URL' || c.name === 'LinkTitle') rep(c.from, c.to, HIDE);
            return false;
          }
          case 'Image': {
            if (isAct(n.from)) return false;
            const url = n.node.getChild('URL');
            if (!url) return false;
            let src = doc.sliceString(url.from, url.to);
            const alt = doc.sliceString(n.from + 2, (n.node.getChildren('LinkMark')[1] || url).from);
            const wm = /\|(\d+)/.exec(alt);
            if (!/^[a-z]+:/i.test(src)) { const dir = Z.path && Z.path.includes('/') ? Z.path.slice(0, Z.path.lastIndexOf('/')) + '/' : ''; src = localURL(dir + decodeURI(src)); }
            rep(n.from, n.to, Decoration.replace({ widget: new ImageWidget(src, wm ? +wm[1] : null, null) }));
            return false;
          }
          case 'ListMark': {
            const item = n.node.parent;
            const isTask = item && item.getChild('Task');
            if (isAct(n.from)) { out.push(markCls('cm-list-mark').range(n.from, n.to)); return; }
            if (isTask) { rep(n.from, Math.min(n.to + 1, doc.lineAt(n.from).to), HIDE); return; }
            if (item?.parent?.name === 'BulletList') rep(n.from, n.to, Decoration.replace({ widget: new TextWidget('cm-bullet', '•') }));
            else out.push(markCls('cm-list-mark').range(n.from, n.to));
            return;
          }
          case 'TaskMarker': {
            const checked = /x/i.test(doc.sliceString(n.from, n.to));
            rep(n.from, n.to, Decoration.replace({ widget: new CheckboxWidget(checked, n.from) }));
            if (checked) { const ln = doc.lineAt(n.from); if (n.to + 1 < ln.to) out.push(markCls('cm-task-done').range(n.to + 1, ln.to)); }
            return;
          }
          case 'HorizontalRule':
            if (!isAct(n.from)) rep(n.from, n.to, Decoration.replace({ widget: new TextWidget('cm-hr', '') }));
            return;
          case 'URL':
            if (parent !== 'Link' && parent !== 'Image') out.push(Decoration.mark({ class: 'cm-link', attributes: { 'data-href': doc.sliceString(n.from, n.to) } }).range(n.from, n.to));
            return;
        }
      },
    });
  }
  return Decoration.set(out, true);
}

export const livePreview = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = build(view); }
  update(u) {
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || u.transactions.some(t => t.effects.length) || syntaxTree(u.startState) !== syntaxTree(u.state))
      this.decorations = build(u.view);
  }
}, { decorations: (v) => v.decorations });

// Blokové náhrady (přes více řádků): vlastnosti nahoře a vzorce $$ … $$
function blockDecos(state) {
  const doc = state.doc;
  const sel = state.selection.main;
  const out = [];
  const touches = (f, t) => state.selection.ranges.some(r => r.to >= f && r.from <= t);
  const fm = frontmatterEnd(doc);
  if (fm && !touches(0, fm)) out.push(Decoration.replace({ widget: new PropsWidget(doc.sliceString(0, fm)), block: true }).range(0, fm));
  let open = null;
  for (let i = 1; i <= doc.lines; i++) {
    const ln = doc.line(i);
    if (ln.to <= fm) continue;
    if (/^\s*```/.test(ln.text)) { // přeskoč bloky kódu
      for (i++; i <= doc.lines && !/^\s*```/.test(doc.line(i).text); i++);
      continue;
    }
    // tabulky: | … | + oddělovač | --- |
    if (/^\s*\|/.test(ln.text) && i < doc.lines && /^\s*\|?\s*:?-{2,}/.test(doc.line(i + 1).text)) {
      let j = i + 1;
      while (j < doc.lines && /^\s*\|/.test(doc.line(j + 1).text)) j++;
      const f = ln.from, t = doc.line(j).to;
      if (!touches(f, t)) out.push(Decoration.replace({ widget: new TableWidget(doc.sliceString(f, t), f), block: true }).range(f, t));
      i = j;
      continue;
    }
    if (ln.text.trim() === '$$') {
      if (!open) open = ln;
      else {
        const f = open.from, t = ln.to;
        if (!touches(f, t)) out.push(Decoration.replace({ widget: new MathWidget(doc.sliceString(open.to + 1, ln.from - 1), true), block: true }).range(f, t));
        open = null;
      }
    }
  }
  void sel;
  return Decoration.set(out, true);
}

export const blockField = StateField.define({
  create: (s) => blockDecos(s),
  update: (v, tr) => (tr.docChanged || tr.selection ? blockDecos(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});
