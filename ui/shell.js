// Zápisník – ovládání aplikace (Tauri): stav, soubory, postranní panely, dialogy, zkratky, aktualizace.
'use strict';
(() => {
const T = window.__TAURI__;
const IS_WIN = /Windows/i.test(navigator.userAgent);
document.documentElement.classList.add(IS_WIN ? 'os-win' : 'os-mac');
window.LOCAL_BASE = IS_WIN ? 'http://zapisnik.localhost/' : 'zapisnik://localhost/';
const { Library, fold, kindOf, dirname, basename, titleOf } = window.ZCore;
const invoke = (cmd, args) => T.core.invoke(cmd, args);
// chyby JavaScriptu do výstupu aplikace (pomáhá při ladění)
window.addEventListener('error', (e) => invoke('log_line', { msg: `JS chyba: ${e.message} (${e.filename}:${e.lineno})` }).catch(() => {}));
window.addEventListener('unhandledrejection', (e) => invoke('log_line', { msg: `JS chyba: ${e.reason}` }).catch(() => {}));
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MOD = (e) => (IS_WIN ? e.ctrlKey : e.metaKey);
const KEY = IS_WIN ? 'Ctrl+' : '⌘';
const LS = {
  get(k, d) { try { const v = localStorage.getItem('z.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('z.' + k, JSON.stringify(v)); } catch (e) {} },
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
const ICONS = {
  back: '<path d="m15 18-6-6 6-6"/>', fwd: '<path d="m9 18 6-6-6-6"/>', star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  quiz: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>', side: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  chev: '<path d="m9 18 6-6-6-6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  newnote: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>', newfolder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M12 10v6M9 13h6"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', link: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  read: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>', write: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
};

// ---------------------------------------------------------------- stav
let LIB = null;
const S = {
  current: null, text: '', mode: 'read', back: [], fwd: [], dirty: false, timer: null,
  favorites: LS.get('favorites', []), recent: LS.get('recent', []), inspector: LS.get('inspector', true), sidebar: true,
  focus: false, search: '', expanded: new Set(LS.get('expanded', [])), ready: false,
};
const DEFAULT_SETTINGS = { fontBody: 'system', fontHeading: 'same', fontSize: 17, lineHeight: 1.7, lineWidth: 'medium', theme: 'auto', accent: 'violet' };
const settings = () => Object.assign({}, DEFAULT_SETTINGS, LS.get('settings', {}));

// ---------------------------------------------------------------- dialogy
const dlg = {
  async ask(message, title, ok = 'OK') { return T.dialog.ask(message, { title, kind: 'warning', okLabel: ok, cancelLabel: 'Zrušit' }); },
  async info(message, title = 'Zápisník') { return T.dialog.message(message, { title }); },
  prompt(title, label, value = '') {
    return new Promise((done) => {
      const m = modal(`<h3>${esc(title)}</h3><label class="m-label">${esc(label)}</label><input class="m-input" value="${esc(value)}">
        <div class="m-actions"><button data-a="cancel">Zrušit</button><button class="primary" data-a="ok">OK</button></div>`, 'm-small');
      const input = $('.m-input', m.el);
      setTimeout(() => { input.focus(); input.select(); }, 30);
      const finish = (v) => { m.close(); done(v); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value.trim() || null); });
      m.el.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'ok') finish(input.value.trim() || null); if (a === 'cancel') finish(null); });
      m.onClose = () => done(null);
    });
  },
};
function modal(html, cls = '') {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  document.body.appendChild(wrap);
  const m = { el: wrap, onClose: null, close() { wrap.remove(); document.removeEventListener('keydown', key, true); } };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); m.close(); m.onClose?.(); } };
  document.addEventListener('keydown', key, true);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) { m.close(); m.onClose?.(); } });
  return m;
}
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2600);
}

// ---------------------------------------------------------------- soubory
const unique = (folderRel, base, ext) => {
  const taken = new Set([...LIB.all, ...LIB.dirs].map((r) => r.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = (n === 1 ? base : `${base} ${n}`) + (ext ? '.' + ext : '');
    const rel = folderRel ? folderRel + '/' + name : name;
    if (!taken.has(rel.toLowerCase())) return rel;
  }
};
const currentFolder = () => (S.current ? dirname(S.current) : '');
const cleanName = (s) => s.replace(/[\/\\:]/g, '-').trim();
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`; };

async function rescan() {
  await LIB.scan(invoke);
  renderSidebar(); renderInspector();
}

// ---------------------------------------------------------------- otevírání, režimy
async function open(rel, heading = null, record = true) {
  if (!rel) return;
  const k = kindOf(rel);
  if (k !== 'note') { T.opener.openPath(LIB.abs(rel)).catch((e) => dlg.info(String(e))); return; }
  if (rel === S.current) {
    if (heading) S.mode === 'edit' ? window.ZE.scrollToHeading(heading) : window.scrollToHeading(heading);
    return;
  }
  await flushEditor();
  await saveNow();
  if (record && S.current) { S.back.push(S.current); S.fwd = []; }
  S.current = rel;
  S.text = LIB.texts[rel] ?? (await invoke('read_text', { path: LIB.abs(rel) }).catch(() => ''));
  LS.set('lastNote', rel);
  S.recent = [rel, ...S.recent.filter((r) => r !== rel)].slice(0, 8);
  LS.set('recent', S.recent);
  for (let d = dirname(rel); d; d = dirname(d)) S.expanded.add(d);
  renderChrome();
  await reshow(heading);
}
async function reshow(heading = null) {
  window.setMode(S.mode);
  document.body.classList.toggle('editing', S.mode === 'edit');
  if (!S.current) { $('#doc').innerHTML = emptyState(); return; }
  const p = await LIB.payload(S.current, S.text, invoke);
  if (heading) p.heading = heading;
  if (S.mode === 'edit') { Object.assign(p, LIB.extras()); window.ZE.load(p); }
  else window.render(p);
}
const render = () => reshow();
function emptyState() {
  return `<div class="empty-state"><div class="es-icon">${icon('note')}</div><h2>Žádná poznámka</h2><p>Vytvoř novou poznámku tlačítkem vlevo dole nebo ${KEY}N.</p></div>`;
}
async function flushEditor() {
  if (S.mode !== 'edit' || !window.ZE) return;
  const t = window.ZE.getText();
  if (t != null) applyEditorText(t, S.current);
}
async function setMode(m) {
  if (!S.current || m === S.mode) return;
  await flushEditor();
  await saveNow();
  S.mode = m;
  renderChrome();
  await reshow();
}
const toggleMode = () => setMode(S.mode === 'read' ? 'edit' : 'read');

// ---------------------------------------------------------------- ukládání
function edit(t) {
  if (t === S.text) return;
  S.text = t; S.dirty = true;
  clearTimeout(S.timer);
  S.timer = setTimeout(saveNow, 600);
  scheduleInspector();
}
async function saveNow() {
  clearTimeout(S.timer);
  if (!S.dirty || !S.current) return;
  S.dirty = false;
  const rel = S.current, text = S.text;
  try { await invoke('write_text', { path: LIB.abs(rel), text }); LIB.setText(rel, text); }
  catch (e) { S.dirty = true; dlg.info('Poznámku se nepodařilo uložit: ' + e); }
}
async function applyEditorText(t, path) {
  if (!path) return;
  if (path === S.current) return edit(t);
  if (LIB.texts[path] == null || LIB.texts[path] === t) return;
  await invoke('write_text', { path: LIB.abs(path), text: t });
  LIB.setText(path, t);
}
async function writeNote(rel, text) {
  await invoke('write_text', { path: LIB.abs(rel), text });
  LIB.setText(rel, text);
}
function toggleTask(n, checked) {
  const lines = S.text.split('\n');
  let count = 0, inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(lines[i]);
    if (!m) continue;
    if (count === n) { lines[i] = m[1] + (checked ? 'x' : ' ') + lines[i].slice(m[1].length + 1); edit(lines.join('\n')); saveNow(); return; }
    count++;
  }
}

// ---------------------------------------------------------------- nové, přejmenování, mazání
async function newNote(folderRel = null, name = null, content = '') {
  await flushEditor(); await saveNow();
  const folder = folderRel ?? currentFolder();
  const rel = unique(folder, cleanName(name || 'Nová poznámka'), 'md');
  try { await invoke('write_text', { path: LIB.abs(rel), text: content }); }
  catch (e) { return dlg.info('Poznámku se nepodařilo vytvořit: ' + e); }
  LIB.addFile(rel, content);
  S.mode = 'edit';
  await open(rel);
  if (!name) setTimeout(() => { const i = $('#title-input'); i?.focus(); i?.select(); }, 80);
  return rel;
}
async function newFolder(folderRel = null) {
  const name = await dlg.prompt('Nová složka', 'Název složky:', 'Nová složka');
  if (!name) return;
  const rel = unique(folderRel ?? currentFolder(), cleanName(name), '');
  await invoke('make_dir', { path: LIB.abs(rel) });
  S.expanded.add(rel); LS.set('expanded', [...S.expanded]);
  await rescan();
}
async function rename(rel, rawName, isDir) {
  const newName = cleanName(rawName || '');
  if (!newName) return;
  await flushEditor(); await saveNow();
  const isNote = !isDir && kindOf(rel) === 'note';
  const parent = dirname(rel);
  const newRel = (parent ? parent + '/' : '') + (isNote ? newName + '.md' : newName);
  if (newRel === rel) return;
  const oldTitle = titleOf(rel);
  const baseUnique = !isDir && LIB.notes.filter((r) => titleOf(r).toLowerCase() === oldTitle.toLowerCase()).length === 1;
  try { await invoke('rename_path', { from: LIB.abs(rel), to: LIB.abs(newRel) }); }
  catch (e) { return dlg.info(String(e), 'Přejmenování se nepovedlo'); }
  // oprava odkazů ve všech poznámkách
  const reps = [];
  if (isDir) reps.push(['[[' + rel + '/', '[[' + newRel + '/']);
  else {
    const o = isNote ? rel.slice(0, -3) : rel, n = isNote ? newRel.slice(0, -3) : newRel;
    for (const end of [']]', '|', '#']) {
      reps.push(['[[' + o + end, '[[' + n + end]);
      if (isNote) reps.push(['[[' + rel + end, '[[' + newRel + end]);
      if (baseUnique) reps.push(['[[' + oldTitle + end, '[[' + (isNote ? newName : basename(newRel)) + end]);
    }
  }
  const moved = (r) => (r === rel ? newRel : isDir && r.startsWith(rel + '/') ? newRel + r.slice(rel.length) : r);
  for (const r of LIB.notes) {
    let t = LIB.texts[r]; if (t == null) continue;
    const orig = t;
    for (const [a, b] of reps) t = t.split(a).join(b);
    if (t !== orig) { await invoke('write_text', { path: LIB.abs(moved(r)), text: t }); if (r === S.current) S.text = t; }
  }
  if (S.current) S.current = moved(S.current);
  S.back = S.back.map(moved); S.fwd = S.fwd.map(moved);
  S.recent = S.recent.map(moved); S.favorites = S.favorites.map(moved);
  LS.set('recent', S.recent); LS.set('favorites', S.favorites); LS.set('lastNote', S.current);
  await rescan();
  renderChrome();
  await reshow();
}
async function remove(rel, isDir) {
  const ok = await dlg.ask(`Smazat „${isDir ? basename(rel) : titleOf(rel)}“? Přesune se do Koše, odkud se dá vrátit.`, 'Smazat', 'Přesunout do Koše');
  if (!ok) return;
  await saveNow();
  try { await invoke('trash_path', { path: LIB.abs(rel) }); } catch (e) { return dlg.info(String(e), 'Smazání se nepovedlo'); }
  const gone = (r) => r === rel || r.startsWith(rel + '/');
  await rescan();
  if (S.current && gone(S.current)) {
    S.current = null;
    S.back = S.back.filter((r) => !gone(r));
    const next = S.back.pop() || LIB.notes[0];
    if (next) await open(next, null, false); else { renderChrome(); await reshow(); }
  }
}

// ---------------------------------------------------------------- přílohy a kresby
function embedFor(rel) {
  const name = basename(rel);
  const target = LIB.resolve(name, S.current) === rel ? name : rel;
  const k = kindOf(rel);
  if (k === 'image' || k === 'drawing') return `![[${target}]]`;
  if (k === 'note') return `[[${target.replace(/\.md$/i, '')}]]`;
  return `[[${target}]]`;
}
async function addAttachmentData(name, b64) {
  let base = (name || '').replace(/\.[^.]+$/, '');
  const ext = (/\.([^.]+)$/.exec(name || '')?.[1] || 'png').toLowerCase();
  if (!base || ['image', 'obrázek', 'pasted', 'clipboard'].includes(base.toLowerCase())) base = 'Obrázek ' + stamp();
  const rel = unique((currentFolder() ? currentFolder() + '/' : '') + 'přílohy', base, ext);
  await invoke('write_base64', { path: LIB.abs(rel), data: b64 });
  LIB.addFile(rel);
  window.ZE.refresh({ files: LIB.all });
  return embedFor(rel);
}
async function pickAttachments() {
  const picked = await T.dialog.open({ multiple: true, title: 'Vložit obrázky nebo soubory' });
  if (!picked) return;
  const parts = [];
  for (const raw of [].concat(picked)) {
    const p = String(raw).replace(/\\/g, '/');
    const root = LIB.root.replace(/\\/g, '/').replace(/\/$/, '');
    let rel;
    if (p.startsWith(root + '/')) rel = p.slice(root.length + 1).normalize('NFC');
    else {
      const name = basename(p);
      rel = unique((currentFolder() ? currentFolder() + '/' : '') + 'přílohy', name.replace(/\.[^.]+$/, ''), (/\.([^.]+)$/.exec(name)?.[1] || '').toLowerCase());
      try { await invoke('copy_file', { from: raw, to: LIB.abs(rel) }); } catch (e) { dlg.info(String(e)); continue; }
      LIB.addFile(rel);
    }
    parts.push(embedFor(rel));
  }
  if (!parts.length) return;
  window.ZE.refresh({ files: LIB.all });
  if (S.mode === 'edit') window.ZE.insertText(parts.join('\n'));
  else { edit(S.text.replace(/\s*$/, '') + '\n\n' + parts.join('\n') + '\n'); await saveNow(); await reshow(); }
}
async function saveDrawing(svg, rel, insert, afterImage) {
  if (rel) {
    await invoke('write_text', { path: LIB.abs(rel), text: svg });
    if (S.mode === 'read') await reshow(); else window.ZE.refresh({ drawings: { [rel]: svg } });
    return;
  }
  const newRel = unique((currentFolder() ? currentFolder() + '/' : '') + 'přílohy', 'Kresba ' + stamp(), 'svg');
  await invoke('write_text', { path: LIB.abs(newRel), text: svg });
  LIB.addFile(newRel);
  const embed = embedFor(newRel);
  if (insert && S.mode === 'edit') {
    window.ZE.drawingSaved({ rel: newRel, svg, embed, insert: true, target: embed.slice(3, -2), files: LIB.all });
    return;
  }
  const lines = S.text.split('\n');
  const i = afterImage ? lines.findIndex((l) => l.includes(basename(afterImage))) : -1;
  if (i >= 0) lines.splice(i + 1, 0, embed);
  else { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push('', embed, ''); }
  edit(lines.join('\n'));
  await saveNow();
  await reshow();
}
async function setPercent(v) {
  const rel = S.current; if (!rel) return;
  if (S.text.startsWith('---') && /^procenta:.*$/m.test(S.text)) { edit(S.text.replace(/^procenta:.*$/m, `procenta: ${v}`)); await saveNow(); }
  const base = rel.slice(0, -3);
  for (const r of LIB.notes) {
    if (r === rel) continue;
    const d = LIB.texts[r]; if (!d || !d.includes('[[' + base)) continue;
    const nd = d.split('\n').map((l) => (l.includes('[[' + base + '|') || l.includes('[[' + base + ']]')) ? l.replace(/\]\]\s*-\s*\d+\s*%/, `]] - ${v}%`) : l).join('\n');
    if (nd !== d) await writeNote(r, nd);
  }
  toast(`Zapsáno ${v} %`);
  await reshow();
}

// ---------------------------------------------------------------- další funkce
function toggleFavorite(rel = S.current) {
  if (!rel) return;
  S.favorites = S.favorites.includes(rel) ? S.favorites.filter((r) => r !== rel) : [...S.favorites, rel];
  LS.set('favorites', S.favorites);
  renderSidebar(); renderChrome();
}
async function openDaily() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const rel = `Deník/${name}.md`;
  if (LIB.texts[rel] != null) return open(rel);
  const title = d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return newNote('Deník', name, `# ${title.charAt(0).toUpperCase() + title.slice(1)}\n\n`);
}
function randomNote() {
  const dir = currentFolder();
  const pool = LIB.notes.filter((r) => dirname(r) === dir && r !== S.current);
  const list = pool.length ? pool : LIB.notes;
  if (!list.length) return;
  S.mode = 'read';
  open(list[Math.floor(Math.random() * list.length)]);
}
function toggleFocus() {
  S.focus = !S.focus;
  document.body.classList.toggle('focus-mode', S.focus);
}
async function startQuiz() { await setMode('read'); setTimeout(() => window.startQuiz(), 120); }
async function newDrawing() { await setMode('edit'); setTimeout(() => window.ZE.newDrawing(), 150); }
async function printNote() { await setMode('read'); setTimeout(() => invoke('print_page').catch((e) => dlg.info(String(e))), 300); }
function goBack() { const p = S.back.pop(); if (!p) return; if (S.current) S.fwd.push(S.current); open(p, null, false); }
function goForward() { const n = S.fwd.pop(); if (!n) return; if (S.current) S.back.push(S.current); open(n, null, false); }
const reveal = (rel) => T.opener.revealItemInDir(LIB.abs(rel ?? S.current ?? '')).catch(() => T.opener.openPath(LIB.root));

async function chooseRoot() {
  const dir = await T.dialog.open({ directory: true, title: 'Vyber složku s poznámkami' });
  if (!dir) return;
  await saveNow();
  await setRoot(String(dir));
  S.current = null; S.back = []; S.fwd = [];
  LS.set('lastNote', null);
  await rescan();
  if (LIB.notes[0]) await open(LIB.notes[0], null, false); else { renderChrome(); reshow(); }
}
async function importObsidian() {
  const src = await T.dialog.open({ directory: true, title: 'Vyber složku Obsidian vaultu (zkopíruje se, originál zůstane)' });
  if (!src) return;
  const name = basename(String(src).replace(/\\/g, '/'));
  const rel = unique('', name, '');
  try { await invoke('copy_dir', { from: String(src), to: LIB.abs(rel) }); } catch (e) { return dlg.info(String(e), 'Import se nepovedl'); }
  S.expanded.add(rel); LS.set('expanded', [...S.expanded]);
  await rescan();
  toast('Import hotový');
}
async function setRoot(root) {
  await invoke('set_root', { root });
  if (!(await invoke('test_config').catch(() => ({}))).ZAPISNIK_ROOT) LS.set('root', root);
  LIB = new Library(root);
}

// ---------------------------------------------------------------- zprávy z čtení a editoru (app.js, editor)
window.webkit = { messageHandlers: { app: { postMessage: (m) => { onMessage(m).catch((e) => console.error(e)); } } } };
async function onMessage(m) {
  switch (m.type) {
    case 'ready': return S.ready ? reshow() : init();
    case 'open': return open(m.rel, m.heading);
    case 'create': { const n = basename(m.name); return newNote(null, n, `# ${n}\n\n`); }
    case 'external': return T.opener.openUrl(m.url);
    case 'toggleTask': return toggleTask(m.index, m.checked);
    case 'copy': return copyText(m.text);
    case 'edit': return toggleMode();
    case 'change': return applyEditorText(m.text, m.path);
    case 'attach': { const e = await addAttachmentData(m.name, m.data); if (e) window.ZE.insertText(e); return; }
    case 'pickImage': return pickAttachments();
    case 'saveDrawing': return saveDrawing(m.svg, m.rel, m.insert, m.afterImage);
    case 'setPercent': return setPercent(m.value);
  }
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
}

// ---------------------------------------------------------------- vykreslení oken
function renderChrome() {
  const cur = S.current;
  $('#nav-back').disabled = !S.back.length;
  $('#nav-fwd').disabled = !S.fwd.length;
  $('#note-title').textContent = cur ? titleOf(cur) : 'Zápisník';
  $('#note-sub').textContent = cur ? basename(dirname(cur)) : '';
  document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
  $('#btn-star').classList.toggle('on', !!cur && S.favorites.includes(cur));
  $('#btn-star').innerHTML = icon('star');
  document.body.classList.toggle('no-inspector', !S.inspector);
  const ti = $('#title-input');
  if (document.activeElement !== ti) ti.value = cur ? titleOf(cur) : '';
  document.title = cur ? titleOf(cur) + ' – Zápisník' : 'Zápisník';
  renderSidebar();
  renderInspector();
}

function row(rel, name, ic, extra = '', depth = 0, isDir = false, open = false) {
  const active = rel === S.current ? ' active' : '';
  const pad = 10 + depth * 14;
  return `<div class="row${active}${isDir ? ' dir' : ''}" data-rel="${esc(rel)}"${isDir ? ' data-dir="1"' : ''} style="padding-left:${pad}px" title="${esc(name)}">
    ${isDir ? `<span class="chev${open ? ' open' : ''}">${icon('chev')}</span>` : '<span class="chev-space"></span>'}
    <span class="ric">${icon(ic)}</span><span class="rname">${esc(name)}</span>${extra}</div>`;
}
function renderTree(node, depth) {
  let h = '';
  for (const c of node.children) {
    if (c.dir) {
      const isOpen = S.expanded.has(c.rel);
      h += row(c.rel, c.name, 'folder', '', depth, true, isOpen);
      if (isOpen) h += renderTree(c, depth + 1);
    } else h += row(c.rel, c.name, c.kind === 'pdf' ? 'pdf' : 'note', '', depth);
  }
  return h;
}
function renderSidebar() {
  const list = $('#sb-list');
  if (!LIB) return;
  const q = S.search.trim();
  let h = '';
  if (q) {
    const hits = LIB.search(q).slice(0, 80);
    h += `<div class="sec">Výsledky (${hits.length})</div>`;
    if (!hits.length) h += '<div class="muted-row">Nic nenalezeno</div>';
    for (const x of hits) {
      h += `<div class="hit${x.rel === S.current ? ' active' : ''}" data-rel="${esc(x.rel)}"><div class="h-t">${esc(titleOf(x.rel))}</div>
        ${x.snippet ? `<div class="h-s">${esc(x.snippet)}</div>` : ''}<div class="h-p">${esc(dirname(x.rel))}</div></div>`;
    }
  } else {
    const favs = S.favorites.filter((r) => LIB.texts[r] != null);
    if (favs.length) { h += '<div class="sec">Oblíbené</div>'; for (const r of favs) h += row(r, titleOf(r), 'star', '', 0).replace('class="ric"', 'class="ric fav"'); }
    const rec = S.recent.filter((r) => LIB.texts[r] != null).slice(0, 5);
    if (rec.length) { h += '<div class="sec">Nedávné</div>'; for (const r of rec) h += row(r, titleOf(r), 'clock', '', 0); }
    h += '<div class="sec">Poznámky</div>' + renderTree(LIB.tree, 0);
  }
  const st = list.scrollTop;
  list.innerHTML = h;
  list.scrollTop = st;
  $('#sb-count').textContent = `${LIB.notes.length} poznámek`;
}
let inspTimer = null;
const scheduleInspector = () => { clearTimeout(inspTimer); inspTimer = setTimeout(renderInspector, 400); };
function renderInspector() {
  const el = $('#insp-body');
  if (!el || !LIB) return;
  const hs = [];
  let inCode = false;
  const body = S.text.startsWith('---') ? S.text.slice(S.text.indexOf('\n---', 3) + 4) : S.text;
  for (const l of body.split('\n')) {
    if (l.startsWith('```')) { inCode = !inCode; continue; }
    const m = !inCode && /^(#{1,6})\s+(.+)$/.exec(l);
    if (m) hs.push({ level: m[1].length, text: m[2].trim() });
  }
  const min = Math.min(...hs.map((h) => h.level), 6);
  const backs = S.current ? LIB.backlinks(S.current) : [];
  el.innerHTML = `<div class="sec">Obsah</div>${hs.length ? hs.map((h) => `<div class="toc l${h.level - min}" data-h="${esc(h.text)}">${esc(h.text.replace(/[*`=]/g, ''))}</div>`).join('') : '<div class="muted-row">Bez nadpisů</div>'}
    <div class="sec">Odkazuje sem (${backs.length})</div>${backs.length ? backs.map((r) => `<div class="blink" data-rel="${esc(r)}">${icon('link')}<span>${esc(titleOf(r))}</span></div>`).join('') : '<div class="muted-row">Zatím nic</div>'}`;
}

// ---------------------------------------------------------------- rychlé otevření, kontextové menu, nastavení
function quickOpen() {
  const m = modal(`<input class="qo-input" placeholder="Najdi poznámku podle názvu…"><div class="qo-list"></div>`, 'm-quick');
  const input = $('.qo-input', m.el), list = $('.qo-list', m.el);
  let sel = 0, res = [];
  const draw = () => {
    const q = fold(input.value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    res = (q ? LIB.notes.filter((r) => { const k = LIB.searchKey(r); return words.every((w) => k.includes(w)); })
      .sort((a, b) => (fold(titleOf(b)).startsWith(q) - fold(titleOf(a)).startsWith(q)) || a.length - b.length)
      : [...S.recent.filter((r) => LIB.texts[r] != null), ...LIB.notes.filter((r) => !S.recent.includes(r))]).slice(0, 60);
    sel = Math.min(sel, Math.max(0, res.length - 1));
    list.innerHTML = res.map((r, i) => `<div class="qo-row${i === sel ? ' sel' : ''}" data-i="${i}">${icon('note')}<div><div>${esc(titleOf(r))}</div><div class="qo-path">${esc(dirname(r))}</div></div></div>`).join('')
      + (!res.length && input.value.trim() ? `<div class="qo-row create" data-create="1">＋ Vytvořit poznámku „${esc(input.value.trim())}“</div>` : '');
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => {
    const name = input.value.trim();
    m.close();
    if (res[i]) open(res[i]); else if (name) newNote(null, name, `# ${name}\n\n`);
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, res.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter') pick(sel);
  });
  list.addEventListener('click', (e) => { const r = e.target.closest('.qo-row'); if (r) pick(r.dataset.create ? -1 : +r.dataset.i); });
  draw();
  setTimeout(() => input.focus(), 20);
}

function contextMenu(x, y, items) {
  document.querySelector('.ctx')?.remove();
  const el = document.createElement('div');
  el.className = 'ctx';
  el.innerHTML = items.map((it, i) => (it === '-' ? '<div class="ctx-sep"></div>' : `<div class="ctx-item${it.danger ? ' danger' : ''}" data-i="${i}">${esc(it.label)}</div>`)).join('');
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  el.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  const close = () => { el.remove(); document.removeEventListener('mousedown', out, true); };
  const out = (e) => { if (!el.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', out, true));
  el.addEventListener('click', (e) => { const i = e.target.closest('.ctx-item')?.dataset.i; if (i == null) return; close(); items[+i].run(); });
}
function treeMenu(e, rel, isDir) {
  const folder = isDir ? rel : dirname(rel);
  const isNote = !isDir && kindOf(rel) === 'note';
  const items = [
    { label: 'Nová poznámka sem', run: () => newNote(folder) },
    { label: 'Nová složka sem…', run: () => newFolder(folder) },
    '-',
    { label: 'Přejmenovat…', run: async () => { const n = await dlg.prompt('Přejmenovat', 'Nový název:', isDir ? basename(rel) : titleOf(rel)); if (n) rename(rel, n, isDir); } },
  ];
  if (isNote) items.push({ label: S.favorites.includes(rel) ? 'Odebrat z oblíbených' : 'Přidat do oblíbených', run: () => toggleFavorite(rel) });
  items.push({ label: IS_WIN ? 'Ukázat v Průzkumníku' : 'Ukázat ve Finderu', run: () => reveal(rel) }, '-', { label: 'Smazat…', danger: true, run: () => remove(rel, isDir) });
  contextMenu(e.clientX, e.clientY, items);
}

const FONTS = [['system', 'San Francisco / Segoe (systémové)'], ['rounded', 'Zaoblené'], ['newyork', 'New York (patkové)'], ['charter', 'Charter'], ['iowan', 'Iowan Old Style'],
  ['georgia', 'Georgia'], ['palatino', 'Palatino'], ['avenir', 'Avenir Next'], ['helvetica', 'Helvetica Neue'], ['mono', 'Strojové (mono)']];
const ACCENT_HEX = { violet: '#7c5cff', blue: '#0a84ff', teal: '#12a594', green: '#30a46c', orange: '#f76b15', pink: '#e93d82', red: '#e5484d', graphite: '#6e6e76' };
function applyAll() {
  const st = settings();
  window.applySettings(st);
  T.window.getCurrentWindow().setTheme(st.theme === 'dark' ? 'dark' : st.theme === 'light' || st.theme === 'sepia' ? 'light' : null).catch(() => {});
  document.documentElement.style.setProperty('--accent-ui', ACCENT_HEX[st.accent] || ACCENT_HEX.violet);
}
async function openSettings() {
  const st = settings();
  const version = await T.app.getVersion().catch(() => '?');
  const seg = (key, opts) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(st[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const m = modal(`<h3>Nastavení</h3>
    <div class="set-grid">
      <label>Písmo textu</label><select data-k="fontBody">${FONTS.map(([v, l]) => `<option value="${v}"${st.fontBody === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label>Písmo nadpisů</label><select data-k="fontHeading"><option value="same">Stejné jako text</option>${FONTS.map(([v, l]) => `<option value="${v}"${st.fontHeading === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label>Velikost</label><div class="rng"><input type="range" min="13" max="24" step="1" data-k="fontSize" value="${st.fontSize}"><span>${st.fontSize} pt</span></div>
      <label>Řádkování</label><div class="rng"><input type="range" min="1.3" max="2.1" step="0.05" data-k="lineHeight" value="${st.lineHeight}"><span>${Number(st.lineHeight).toFixed(2)}</span></div>
      <label>Šířka textu</label>${seg('lineWidth', [['narrow', 'Úzká'], ['medium', 'Střední'], ['wide', 'Široká'], ['full', 'Celé okno']])}
      <label>Motiv</label>${seg('theme', [['auto', 'Podle systému'], ['light', 'Světlý'], ['dark', 'Tmavý'], ['sepia', 'Sépie']])}
      <label>Barva</label><div class="dots">${Object.entries(ACCENT_HEX).map(([k, c]) => `<button data-accent="${k}" class="${st.accent === k ? 'on' : ''}" style="--c:${c}"></button>`).join('')}</div>
    </div>
    <div class="set-preview"><div class="sp-h">Jak se učit efektivně</div><div class="sp-p">Příliš žluťoučký kůň úpěl ďábelské ódy. Nejdřív kostra, pak pochopení vlastními slovy a nakonec vybavování bez koukání.</div></div>
    <div class="set-sec">Složka s poznámkami</div>
    <div class="set-row"><code class="path">${esc(LIB.root)}</code><button data-a="root">Změnit…</button></div>
    <div class="set-row"><span>Převést poznámky z Obsidianu</span><button data-a="import">Importovat…</button></div>
    <div class="set-sec">Aplikace</div>
    <div class="set-row"><span>Zápisník ${esc(version)}</span><button data-a="update">Zkontrolovat aktualizace</button></div>
    <div class="m-actions"><button class="primary" data-a="close">Hotovo</button></div>`, 'm-settings');
  const save = (patch) => { LS.set('settings', Object.assign(settings(), patch)); applyAll(); preview(); };
  const preview = () => {
    const s = settings();
    const css = getComputedStyle(document.documentElement);
    const p = $('.set-preview', m.el);
    p.style.fontFamily = css.getPropertyValue('--font-body');
    $('.sp-h', p).style.fontFamily = css.getPropertyValue('--font-heading');
    p.style.fontSize = s.fontSize + 'px'; p.style.lineHeight = s.lineHeight;
  };
  m.el.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const v = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    if (e.target.type === 'range') e.target.nextElementSibling.textContent = k === 'fontSize' ? v + ' pt' : v.toFixed(2);
    save({ [k]: v });
  });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const segEl = b.closest('.seg');
    if (segEl) { segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); save({ [segEl.dataset.k]: b.dataset.v }); return; }
    if (b.dataset.accent) { m.el.querySelectorAll('[data-accent]').forEach((x) => x.classList.toggle('on', x === b)); save({ accent: b.dataset.accent }); return; }
    if (b.dataset.a === 'close') m.close();
    if (b.dataset.a === 'root') { m.close(); chooseRoot(); }
    if (b.dataset.a === 'import') { m.close(); importObsidian(); }
    if (b.dataset.a === 'update') checkUpdates(true);
  });
  preview();
}

// ---------------------------------------------------------------- aktualizace
async function checkUpdates(manual = false) {
  try {
    const upd = await T.updater.check();
    if (!upd) { if (manual) dlg.info('Máš nejnovější verzi.'); return; }
    const bar = $('#update-bar');
    bar.innerHTML = `<span>✨ Je dostupná nová verze <b>${esc(upd.version)}</b>.</span><button data-a="go">Aktualizovat a restartovat</button><button data-a="later" class="ghost">Později</button>`;
    bar.classList.add('show');
    bar.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'later') { bar.classList.remove('show'); return; }
      if (a !== 'go') return;
      await flushEditor(); await saveNow();
      let total = 0, got = 0;
      bar.innerHTML = '<span>Stahuji aktualizaci…</span>';
      await upd.downloadAndInstall((ev) => {
        if (ev.event === 'Started') total = ev.data.contentLength || 0;
        if (ev.event === 'Progress') { got += ev.data.chunkLength; if (total) bar.innerHTML = `<span>Stahuji aktualizaci… ${Math.round(got / total * 100)} %</span>`; }
        if (ev.event === 'Finished') bar.innerHTML = '<span>Instaluji…</span>';
      });
      await T.process.relaunch();
    };
  } catch (e) {
    if (manual) dlg.info('Aktualizace se nepodařilo zkontrolovat: ' + e);
  }
}

// ---------------------------------------------------------------- události rozhraní
function wire() {
  $('#sb-list').addEventListener('click', (e) => {
    const r = e.target.closest('[data-rel]'); if (!r) return;
    if (r.dataset.dir) {
      const rel = r.dataset.rel;
      S.expanded.has(rel) ? S.expanded.delete(rel) : S.expanded.add(rel);
      LS.set('expanded', [...S.expanded]);
      renderSidebar();
    } else open(r.dataset.rel);
  });
  $('#sb-list').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const r = e.target.closest('[data-rel]');
    if (r) treeMenu(e, r.dataset.rel, !!r.dataset.dir);
    else contextMenu(e.clientX, e.clientY, [{ label: 'Nová poznámka', run: () => newNote('') }, { label: 'Nová složka…', run: () => newFolder('') }]);
  });
  const search = $('#search');
  search.addEventListener('input', () => { S.search = search.value; renderSidebar(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; S.search = ''; renderSidebar(); search.blur(); } });
  $('#insp-body').addEventListener('click', (e) => {
    const h = e.target.closest('[data-h]');
    if (h) return S.mode === 'edit' ? window.ZE.scrollToHeading(h.dataset.h) : window.scrollToHeading(h.dataset.h);
    const b = e.target.closest('[data-rel]'); if (b) open(b.dataset.rel);
  });
  const act = {
    back: goBack, fwd: goForward, star: () => toggleFavorite(), quiz: startQuiz, quick: quickOpen, settings: openSettings,
    inspector: () => { S.inspector = !S.inspector; LS.set('inspector', S.inspector); renderChrome(); },
    sidebar: () => document.body.classList.toggle('no-sidebar'),
    newnote: () => newNote(), newfolder: () => newFolder(), daily: openDaily,
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (b && act[b.dataset.act]) { act[b.dataset.act](); return; }
    const mb = e.target.closest('#mode-seg button'); if (mb) setMode(mb.dataset.mode);
  });
  const ti = $('#title-input');
  const commitTitle = () => { if (S.current && ti.value.trim() && ti.value.trim() !== titleOf(S.current)) rename(S.current, ti.value.trim(), false); };
  ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); window.ZE.focus(); } });
  ti.addEventListener('blur', commitTitle);

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('#draw, #quiz, .modal-wrap')) return;
    if (!MOD(e)) return;
    const k = e.key.toLowerCase();
    const run = (f) => { e.preventDefault(); e.stopPropagation(); f(); };
    const ed = (c) => run(() => window.ZE.cmd(c));
    if (e.altKey) {
      if (e.code === 'KeyS') return run(() => toggleFavorite());
      if (e.code === 'KeyR') return run(randomNote);
      if (e.code === 'KeyI') return run(act.inspector);
      if (S.mode === 'edit' && /^Digit[0-3]$/.test(e.code)) return ed(['h0', 'h1', 'h2', 'h3'][+e.code.slice(5)]);
      return;
    }
    if (e.shiftKey) {
      if (k === 'n') return run(() => newFolder());
      if (k === 'd') return run(newDrawing);
      if (k === 'f') return run(toggleFocus);
      if (S.mode === 'edit' && k === 'x') return ed('strike');
      if (S.mode === 'edit' && k === 'h') return ed('highlight');
      if (S.mode === 'edit' && k === 'l') return ed('list');
      if (S.mode === 'edit' && k === 't') return ed('task');
      return;
    }
    if (k === 'n') return run(() => newNote());
    if (k === 'd') return run(openDaily);
    if (k === 'o') return run(quickOpen);
    if (k === 'p') return run(printNote);
    if (k === 'e') return run(toggleMode);
    if (k === 'y') return run(startQuiz);
    if (k === ',') return run(openSettings);
    if (e.key === '[') return run(goBack);
    if (e.key === ']') return run(goForward);
    if (S.mode === 'read' && k === 'f') return run(() => { $('#search').focus(); $('#search').select(); });
    if (S.mode === 'edit' && k === 'b') return ed('bold');
    if (S.mode === 'edit' && k === 'i') return ed('italic');
    if (S.mode === 'edit' && k === 'k') return ed('link');
  }, true);

  let focusTimer = null;
  window.addEventListener('focus', () => {
    clearTimeout(focusTimer);
    focusTimer = setTimeout(async () => {
      if (S.dirty || !LIB) return;
      await flushEditor(); await saveNow();
      await LIB.scan(invoke);
      renderSidebar();
      if (S.current && LIB.texts[S.current] != null && LIB.texts[S.current] !== S.text) { S.text = LIB.texts[S.current]; reshow(); }
    }, 400);
  });
  window.addEventListener('blur', () => { flushEditor().then(saveNow); });
  T.window.getCurrentWindow().onCloseRequested(async () => { await flushEditor(); await saveNow(); }).catch(() => {});
}

// ---------------------------------------------------------------- start
async function init() {
  S.ready = true;
  invoke('log_line', { msg: 'start rozhraní' }).catch(() => {});
  wire();
  applyAll();
  const tc = await invoke('test_config').catch(() => ({}));
  if (tc.ZAPISNIK_SELFTEST) { S.favorites = []; S.recent = []; }
  const root = tc.ZAPISNIK_ROOT || LS.get('root', null) || (await invoke('default_root'));
  await setRoot(root);
  await LIB.scan(invoke);
  if (!LIB.notes.length) {
    await invoke('write_text', { path: LIB.abs('Vítej v Zápisníku.md'), text: WELCOME });
    await LIB.scan(invoke);
  }
  const last = LS.get('lastNote', null);
  const start = [last, 'Vítej v Zápisníku.md'].find((r) => r && LIB.texts[r] != null) || LIB.notes[0];
  renderChrome();
  if (start) await open(start, null, false); else await reshow();
  if (tc.ZAPISNIK_SELFTEST) { window.ZSelfTest?.(); return; }
  setTimeout(() => checkUpdates(false), 4000);
  setInterval(() => checkUpdates(false), 6 * 3600 * 1000);
}
const WELCOME = `# Vítej v Zápisníku

Zápisník je jednoduchý sešit na poznámky. Každá poznámka je obyčejný soubor \`.md\` ve složce **Dokumenty › Poznámky**, takže o nic nepřijdeš.

> [!tip] Jak na to
> - **${KEY}N** nová poznámka, **${KEY}E** přepíná *Číst* a *Psát*, **${KEY}O** rychle otevřít
> - Odkaz na jinou poznámku napiš jako \`[[\` a vyber ze seznamu, **/** otevře nabídku
> - Obrázek stačí přetáhnout do textu nebo vložit ze schránky
> - Tlačítko **Kreslit** v liště otevře kreslení
`;

// pro testy
window.ZApp = { S, get LIB() { return LIB; }, open, setMode, newNote, rename, remove, saveDrawing, setPercent, toggleFavorite, quickOpen, openSettings, rescan, saveNow, flushEditor };
})();
