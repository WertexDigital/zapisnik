// Zápisník – editor (CodeMirror 6) + kreslení. Vystavuje window.ZE.
import { EditorState, EditorSelection, StateEffect, Text } from '@codemirror/state';
import { EditorView, keymap, drawSelection, dropCursor, placeholder, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, LanguageDescription, LanguageSupport, StreamLanguage, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, startCompletion } from '@codemirror/autocomplete';
import { searchKeymap, search } from '@codemirror/search';
import { csharp, java, cpp } from '@codemirror/legacy-modes/mode/clike';
import { standardSQL } from '@codemirror/legacy-modes/mode/sql';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { css } from '@codemirror/legacy-modes/mode/css';
import { html as htmlMode } from '@codemirror/legacy-modes/mode/xml';
import { javascript, json } from '@codemirror/legacy-modes/mode/javascript';
import { python } from '@codemirror/legacy-modes/mode/python';
import { Z, livePreview, blockField, frontmatterEnd, localURL, CALLOUTS } from './livepreview.js';
import { openDrawing } from './drawing.js';
import { icon } from './icons.js';

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lang = (name, alias, mode) => LanguageDescription.of({ name, alias, support: new LanguageSupport(StreamLanguage.define(mode)) });
const codeLanguages = [
  lang('csharp', ['cs', 'c#'], csharp), lang('java', [], java), lang('cpp', ['c', 'c++'], cpp), lang('sql', ['tsql', 'mysql'], standardSQL),
  lang('bash', ['sh', 'zsh', 'shell', 'powershell', 'ps1'], shell), lang('css', [], css), lang('html', ['razor', 'cshtml', 'xml'], htmlMode),
  lang('javascript', ['js', 'ts', 'typescript'], javascript), lang('json', [], json), lang('python', ['py'], python),
];

const highlight = HighlightStyle.define([
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--muted)' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.url, color: 'var(--faint)' },
  { tag: t.processingInstruction, color: 'var(--faint)' },
  { tag: t.keyword, color: 'var(--code-kw)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--code-str)' },
  { tag: t.comment, color: 'var(--faint)', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-num)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--code-type)' },
  { tag: [t.function(t.variableName), t.propertyName, t.attributeName], color: 'var(--code-fn)' },
  { tag: t.meta, color: 'var(--faint)' },
]);

let view = null;
let changeTimer = null;
let wordTimer = null;
const ZE = (window.ZE = {});

// ---------- příkazy formátování

function wrap(before, after = before) {
  const { state } = view;
  view.dispatch(state.update(state.changeByRange((r) => {
    const pre = state.sliceDoc(r.from - before.length, r.from), post = state.sliceDoc(r.to, r.to + after.length);
    if (pre === before && post === after)
      return { changes: [{ from: r.from - before.length, to: r.from }, { from: r.to, to: r.to + after.length }], range: EditorSelection.range(r.from - before.length, r.to - before.length) };
    if (r.empty) {
      const w = state.wordAt(r.from);
      if (w) return { changes: [{ from: w.from, insert: before }, { from: w.to, insert: after }], range: EditorSelection.range(w.from + before.length, w.to + before.length) };
      return { changes: { from: r.from, insert: before + after }, range: EditorSelection.cursor(r.from + before.length) };
    }
    return { changes: [{ from: r.from, insert: before }, { from: r.to, insert: after }], range: EditorSelection.range(r.from + before.length, r.to + before.length) };
  }), { scrollIntoView: true, userEvent: 'input' }));
  view.focus();
}

const BLOCK_RE = /^(#{1,6}\s+|\s*[-*+]\s\[[ xX]\]\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s?)/;
function linePrefix(prefix) {
  const { state } = view;
  const lines = new Set();
  for (const r of state.selection.ranges) for (let l = state.doc.lineAt(r.from).number; l <= state.doc.lineAt(r.to).number; l++) lines.add(l);
  const nums = [...lines];
  const all = prefix && nums.every((n) => state.doc.line(n).text.startsWith(prefix));
  const changes = nums.map((n, i) => {
    const line = state.doc.line(n);
    const m = BLOCK_RE.exec(line.text);
    let p = all ? '' : prefix;
    if (p === '1. ') p = `${i + 1}. `;
    return { from: line.from, to: line.from + (m ? m[0].length : 0), insert: p };
  });
  view.dispatch({ changes, userEvent: 'input' });
  view.focus();
}

function insertBlock(text, cursorOffset = null) {
  const { state } = view;
  const r = state.selection.main;
  const line = state.doc.lineAt(r.from);
  const atEmpty = line.text.trim() === '';
  const from = atEmpty ? line.from : line.to;
  const insert = (atEmpty ? '' : '\n') + text;
  const anchor = from + (cursorOffset == null ? insert.length : (atEmpty ? 0 : 1) + cursorOffset);
  view.dispatch({ changes: { from, to: atEmpty ? line.to : line.to, insert }, selection: { anchor }, scrollIntoView: true, userEvent: 'input' });
  view.focus();
}

function insertCallout(type) {
  const def = CALLOUTS[type] || ['', ''];
  const { state } = view;
  const r = state.selection.main;
  if (!r.empty) {
    const a = state.doc.lineAt(r.from), b = state.doc.lineAt(r.to);
    const body = state.sliceDoc(a.from, b.to).split('\n').map((l) => '> ' + l).join('\n');
    const head = `> [!${type}]${type === 'question' ? '-' : ''} ${def[0]}\n`;
    view.dispatch({ changes: { from: a.from, to: b.to, insert: head + body }, userEvent: 'input' });
  } else {
    const head = `> [!${type}]${type === 'question' ? '-' : ''} ${type === 'question' ? 'Otázka?' : def[0]}\n> `;
    insertBlock(head);
  }
  view.focus();
}

function insertAtCursor(text) {
  const r = view.state.selection.main;
  view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length }, scrollIntoView: true, userEvent: 'input' });
  view.focus();
}

const today = () => { const d = new Date(); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; };

export const TEXT_COLORS = [['Červená', '#e5484d'], ['Oranžová', '#f76b15'], ['Žlutá', '#d29e00'], ['Zelená', '#30a46c'], ['Modrá', '#0090ff'], ['Fialová', '#8e4ec6'], ['Růžová', '#e93d82'], ['Šedá', '#8b8d98']];
export const BG_COLORS = [['Žluté', 'rgba(255,214,10,.4)'], ['Zelené', 'rgba(48,164,108,.3)'], ['Modré', 'rgba(0,144,255,.25)'], ['Růžové', 'rgba(233,61,130,.25)'], ['Fialové', 'rgba(142,78,198,.28)'], ['Oranžové', 'rgba(247,107,21,.3)']];

const CMDS = {
  bold: () => wrap('**'), italic: () => wrap('*'), strike: () => wrap('~~'), highlight: () => wrap('=='), code: () => wrap('`'),
  h0: () => linePrefix(''), h1: () => linePrefix('# '), h2: () => linePrefix('## '), h3: () => linePrefix('### '),
  list: () => linePrefix('- '), olist: () => linePrefix('1. '), task: () => linePrefix('- [ ] '), quote: () => linePrefix('> '),
  link: () => { const r = view.state.selection.main; if (r.empty) { insertAtCursor('[['); startCompletion(view); } else wrap('[[', ']]'); },
  table: () => insertBlock('| Sloupec 1 | Sloupec 2 | Sloupec 3 |\n| --- | --- | --- |\n|  |  |  |\n', 2 + 0),
  codeblock: () => insertBlock('```csharp\n\n```\n', 10),
  math: () => insertBlock('$$\n\n$$\n', 3),
  hr: () => insertBlock('\n---\n'),
  date: () => insertAtCursor(today()),
  image: () => Z.post({ type: 'pickImage' }),
  drawing: () => ZE.newDrawing(),
  color: (c) => wrap(`<span style="color:${c}">`, '</span>'),
  bg: (c) => wrap(`<mark style="background:${c}">`, '</mark>'),
  callout: (type) => insertCallout(type),
  undo: () => undo(view), redo: () => redo(view),
};

// ---------- / příkazy

const SLASH = [
  ['Nadpis 1', 'h1', 'h1', 'nadpis velky'], ['Nadpis 2', 'h2', 'h2', 'nadpis'], ['Nadpis 3', 'h3', 'h3', 'nadpis maly'],
  ['Seznam', 'list', 'list', 'odrazky'], ['Číslovaný seznam', 'olist', 'olist', 'cisla'], ['Úkol', 'task', 'task', 'checkbox todo zaskrtavaci'],
  ['Citace', 'quote', 'quote', ''], ['Tip', 'callout:tip', 'callout', 'ramecek'], ['Info', 'callout:info', 'callout', 'ramecek'],
  ['Pozor', 'callout:warning', 'callout', 'ramecek varovani'], ['Důležité', 'callout:important', 'callout', 'ramecek zapamatuj'],
  ['Otázka se skrytou odpovědí', 'callout:question', 'callout', 'ramecek otazka kviz'], ['Příklad', 'callout:example', 'callout', 'ramecek'],
  ['Kresba', 'drawing', 'pen', 'kreslit obrazek'], ['Obrázek ze souboru', 'image', 'image', 'foto'], ['Tabulka', 'table', 'table', ''],
  ['Blok kódu', 'codeblock', 'code', 'kod program'], ['Vzorec', 'math', 'sigma', 'matematika latex'], ['Oddělovací čára', 'hr', 'hr', 'cara'],
  ['Odkaz na poznámku', 'link', 'link', 'propojit'], ['Dnešní datum', 'date', 'calendar', 'datum dnes'],
];
function runCmd(id) { const [c, arg] = id.split(':'); CMDS[c]?.(arg); }

function slashSource(ctx) {
  const m = ctx.matchBefore(/(?:^|\s)\/[\p{L}\d ]{0,20}$/u);
  if (!m) return null;
  const slash = m.from + m.text.indexOf('/');
  const q = fold(ctx.state.sliceDoc(slash + 1, ctx.pos)).trim();
  if (q.includes('  ')) return null;
  const options = SLASH.filter(([label, , , keys]) => !q || fold(label).includes(q) || keys.includes(q)).map(([label, id, ic]) => ({
    label, type: 'slash', icon: ic,
    apply: (v, c, from, to) => { v.dispatch({ changes: { from: slash, to } }); runCmd(id); },
  }));
  if (!options.length) return null;
  return { from: slash, options, filter: false };
}

function wikiSource(ctx) {
  const m = ctx.matchBefore(/\[\[[^\]|#\n]*$/);
  if (!m) return null;
  const q = fold(m.text.slice(2));
  const counts = {};
  for (const n of Z.notes) counts[n.title.toLowerCase()] = (counts[n.title.toLowerCase()] || 0) + 1;
  const opts = Z.notes
    .filter((n) => !q || fold(n.title).includes(q) || fold(n.rel).includes(q) || (n.aliases || []).some((a) => fold(a).includes(q)))
    .sort((a, b) => (fold(a.title).startsWith(q) ? 0 : 1) - (fold(b.title).startsWith(q) ? 0 : 1) || a.title.length - b.title.length)
    .slice(0, 60)
    .map((n) => {
      const text = counts[n.title.toLowerCase()] > 1 ? n.rel.replace(/\.md$/, '') : n.title;
      return {
        label: n.title, detail: n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : '', type: 'note', icon: 'link',
        apply: (v, c, from, to) => {
          const after = v.state.sliceDoc(to, to + 2) === ']]';
          const ins = text + (after ? '' : ']]');
          v.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: from + ins.length + (after ? 2 : 0) } });
        },
      };
    });
  return { from: m.from + 2, options: opts, filter: false };
}

// ---------- vytvoření editoru

function extensions() {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    EditorView.lineWrapping,
    indentUnit.of('\t'),
    EditorState.tabSize.of(4),
    markdown({ base: markdownLanguage, codeLanguages, addKeymap: true }),
    syntaxHighlighting(highlight),
    closeBrackets(),
    search({ top: true }),
    autocompletion({
      override: [wikiSource, slashSource], icons: false, closeOnBlur: true, activateOnTyping: true,
      addToOptions: [{ render: (c) => { const s = document.createElement('span'); s.className = 'cm-ac-icon'; s.innerHTML = icon(c.icon || 'text', 15); return s; }, position: 20 }],
    }),
    keymap.of([...closeBracketsKeymap, ...markdownKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
    placeholder('Začni psát… (napiš / pro nabídku: nadpis, seznam, kresba, tabulka…)'),
    livePreview,
    blockField,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        clearTimeout(changeTimer);
        changeTimer = setTimeout(flush, 300);
        clearTimeout(wordTimer);
        wordTimer = setTimeout(updateCount, 400);
      }
    }),
    EditorView.domEventHandlers({
      paste: (e) => handleFiles(e, e.clipboardData),
      drop: (e) => handleFiles(e, e.dataTransfer),
      click: (e) => {
        const a = e.target.closest('.cm-link');
        if (a && (e.metaKey || !view.hasFocus) && a.dataset.href) { e.preventDefault(); Z.post({ type: 'external', url: a.dataset.href }); return true; }
        return false;
      },
    }),
  ];
}

function handleFiles(e, dt) {
  const files = [...(dt?.files || [])];
  if (!files.length) return false;
  e.preventDefault();
  if (e.type === 'drop') {
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos != null) view.dispatch({ selection: { anchor: pos } });
  }
  for (const f of files) {
    const r = new FileReader();
    r.onload = () => Z.post({ type: 'attach', name: f.name || 'Obrázek.png', data: String(r.result).split(',')[1] });
    r.readAsDataURL(f);
  }
  return true;
}

function flush() {
  clearTimeout(changeTimer);
  if (!view || Z.path == null) return;
  const text = view.state.doc.toString();
  if (text === Z.lastSent) return;
  Z.lastSent = text;
  Z.post({ type: 'change', path: Z.path, text });
}

function updateCount() {
  const el = document.getElementById('wordcount');
  if (!el || !view) return;
  const body = view.state.doc.toString().replace(/^---[\s\S]*?\n---/, '').replace(/[#>*`=\-|[\]]/g, ' ');
  const words = (body.match(/[\p{L}\p{N}]+/gu) || []).length;
  el.textContent = `${words.toLocaleString('cs-CZ')} slov · ${Math.max(1, Math.round(words / 200))} min čtení`;
}

// ---------- lišta nástrojů

function buildToolbar() {
  const bar = document.getElementById('toolbar');
  const btn = (cmd, ic, title) => `<button data-cmd="${cmd}" title="${title}">${icon(ic)}</button>`;
  const callouts = [['tip', '💡 Tip'], ['info', 'ℹ️ Info'], ['warning', '⚠️ Pozor'], ['important', '❗ Důležité'], ['question', '❓ Otázka se skrytou odpovědí'], ['example', '📎 Příklad'], ['note', '✏️ Poznámka']];
  bar.innerHTML = `
    <div class="tb-group">
      <div class="tb-menu"><button class="tb-drop" title="Styl odstavce">${icon('heading')}<span>Text</span>${icon('chevron', 12)}</button>
        <div class="tb-pop">
          <button data-cmd="h0">${icon('text')} Obyčejný text</button><button data-cmd="h1">${icon('h1')} Nadpis 1</button>
          <button data-cmd="h2">${icon('h2')} Nadpis 2</button><button data-cmd="h3">${icon('h3')} Nadpis 3</button></div></div>
    </div>
    <div class="tb-group">${btn('bold', 'bold', 'Tučně (⌘B)')}${btn('italic', 'italic', 'Kurzíva (⌘I)')}${btn('strike', 'strike', 'Přeškrtnout')}${btn('code', 'code', 'Kód v textu')}
      <div class="tb-menu"><button class="tb-drop" title="Barva textu a zvýraznění">${icon('palette')}${icon('chevron', 12)}</button>
        <div class="tb-pop tb-colors">
          <div class="tb-label">Barva textu</div><div class="tb-swatches">${TEXT_COLORS.map(([n, c]) => `<button data-cmd="color:${c}" title="${n}" style="--sw:${c}" class="sw text">A</button>`).join('')}</div>
          <div class="tb-label">Zvýraznění</div><div class="tb-swatches"><button data-cmd="highlight" title="Žluté (==text==)" style="--sw:rgba(255,214,10,.45)" class="sw"></button>${BG_COLORS.slice(1).map(([n, c]) => `<button data-cmd="bg:${c}" title="${n}" style="--sw:${c}" class="sw"></button>`).join('')}</div>
        </div></div>
    </div>
    <div class="tb-group">${btn('list', 'list', 'Seznam')}${btn('olist', 'olist', 'Číslovaný seznam')}${btn('task', 'task', 'Úkol')}${btn('quote', 'quote', 'Citace')}
      <div class="tb-menu"><button class="tb-drop" title="Rámeček">${icon('callout')}${icon('chevron', 12)}</button>
        <div class="tb-pop">${callouts.map(([c, l]) => `<button data-cmd="callout:${c}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="tb-group">${btn('link', 'link', 'Odkaz na poznámku (⌘K)')}${btn('image', 'image', 'Vložit obrázek')}
      <button data-cmd="drawing" class="tb-accent" title="Nová kresba">${icon('pen')}<span>Kreslit</span></button>
      ${btn('table', 'table', 'Tabulka')}${btn('codeblock', 'code', 'Blok kódu')}${btn('math', 'sigma', 'Vzorec')}${btn('hr', 'hr', 'Čára')}
    </div>
    <div class="tb-spacer"></div><span id="wordcount"></span>`;
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('tb-drop')) { const m = b.parentElement; const open = m.classList.contains('open'); bar.querySelectorAll('.tb-menu').forEach((x) => x.classList.remove('open')); m.classList.toggle('open', !open); return; }
    bar.querySelectorAll('.tb-menu').forEach((x) => x.classList.remove('open'));
    if (b.dataset.cmd) runCmd(b.dataset.cmd);
  });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('.tb-menu')) bar.querySelectorAll('.tb-menu').forEach((x) => x.classList.remove('open')); });
}

// ---------- API pro Swift

ZE.load = (p) => {
  flush();
  Z.path = p.path; Z.links = p.links || {}; Z.drawings = p.drawings || {}; Z.embeds = p.embeds || {};
  if (p.notes) Z.notes = p.notes;
  if (p.files) Z.files = p.files;
  Z.lastSent = p.markdown;
  const fm = frontmatterEnd(Text.of(p.markdown.split('\n')));
  const state = EditorState.create({ doc: p.markdown, extensions: extensions(), selection: { anchor: fm ? Math.min(fm + 1, p.markdown.length) : 0 } });
  if (!view) {
    buildToolbar();
    view = new EditorView({ state, parent: document.getElementById('editor') });
  } else view.setState(state);
  updateCount();
  requestAnimationFrame(() => {
    view.focus();
    if (p.heading) ZE.scrollToHeading(p.heading);
    else view.scrollDOM.scrollTop = 0;
  });
};
ZE.getText = () => { const t = view ? view.state.doc.toString() : null; if (t != null) Z.lastSent = t; return t; };
ZE.flush = flush;
ZE.complete = () => view && startCompletion(view);
ZE.cmd = (name) => { if (view && document.body.dataset.mode === 'edit') runCmd(name); };
ZE.insertText = (text) => { if (view) insertAtCursor(text); };
ZE.focus = () => view?.focus();
ZE.refresh = (p) => {
  if (p?.drawings) Object.assign(Z.drawings, p.drawings);
  if (p?.links) Object.assign(Z.links, p.links);
  if (p?.files) Z.files = p.files;
  view?.dispatch({ effects: StateEffect.appendConfig.of([]) });
};
ZE.scrollToHeading = (text) => {
  if (!view) return;
  const want = fold(text).trim();
  const doc = view.state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    const m = /^#{1,6}\s+(.*)$/.exec(l.text);
    if (m && fold(m[1]).trim().startsWith(want)) {
      view.dispatch({ selection: { anchor: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'start', yMargin: 20 }) });
      view.focus();
      return;
    }
  }
};

// ---------- kresby

ZE.openDrawing = openDrawing;
ZE.newDrawing = () => openDrawing({
  onSave: (svg) => Z.post({ type: 'saveDrawing', svg, rel: null, insert: document.body.dataset.mode === 'edit' }),
});
ZE.editDrawing = (rel) => openDrawing({
  svg: Z.drawings[rel],
  onSave: (svg) => { Z.drawings[rel] = svg; Z.post({ type: 'saveDrawing', svg, rel, insert: false }); ZE.refresh(); },
});
ZE.annotateImage = (rel) => openDrawing({
  imageURL: localURL(rel),
  onSave: (svg) => Z.post({ type: 'saveDrawing', svg, rel: null, insert: document.body.dataset.mode === 'edit', afterImage: rel }),
});
ZE.drawingSaved = (r) => {
  if (r.rel && r.svg) Z.drawings[r.rel] = r.svg;
  if (r.rel) { Z.links[r.target || r.rel] = { rel: r.rel, kind: 'drawing' }; if (!Z.files.includes(r.rel)) Z.files.push(r.rel); }
  if (r.insert && r.embed && view) {
    insertBlock(r.embed + '\n');
  }
  ZE.refresh();
};

// při opuštění okna hned odeslat rozepsaný text
window.addEventListener('blur', () => flush());
document.addEventListener('visibilitychange', () => flush());
