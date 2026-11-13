// Zápisník – index poznámek: hledání cílů odkazů, zpětné odkazy, fulltext. (Port z původní Swift verze.)
(() => {
'use strict';
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const kindOf = (r) => {
  const e = r.split('.').pop().toLowerCase();
  if (e === 'md') return 'note';
  if (e === 'svg') return 'drawing';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  return 'file';
};
const dirname = (r) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '');
const basename = (r) => r.split('/').pop();
const titleOf = (r) => (kindOf(r) === 'note' ? basename(r).replace(/\.md$/i, '') : basename(r));
const cmpName = (a, b) => a.localeCompare(b, 'cs', { numeric: true, sensitivity: 'base' });
const WIKI = /!?\[\[([^\n]+?)\]\]/g;

function splitTarget(inner) {
  let t = inner;
  const p = t.indexOf('|'); if (p >= 0) t = t.slice(0, p);
  if (t.endsWith('\\')) t = t.slice(0, -1);
  let heading = null;
  const h = t.indexOf('#'); if (h >= 0) { heading = t.slice(h + 1); t = t.slice(0, h); }
  return { target: t.trim(), heading };
}

function bodyOf(text) {
  let t = text;
  if (t.startsWith('---')) { const i = t.indexOf('\n---', 3); if (i >= 0) t = t.slice(i + 4); }
  return t.replace(/%%[\s\S]*?%%/g, '');
}

function parseAliases(text) {
  if (!text.startsWith('---')) return [];
  const out = []; let inA = false;
  for (const line of text.split('\n').slice(1)) {
    if (line.startsWith('---')) break;
    if (/^alias(es)?:/.test(line)) {
      inA = true;
      const rest = line.split(':').slice(1).join(':').trim();
      if (rest) out.push(...rest.replace(/[[\]]/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')));
      continue;
    }
    const m = inA && /^\s*-\s*(.*)$/.exec(line);
    if (m) out.push(m[1].trim().replace(/^["']|["']$/g, ''));
    else if (!line.startsWith(' ')) inA = false;
  }
  return out.filter(Boolean);
}

class Library {
  constructor(root) { this.root = root; this.reset(); }
  reset() {
    this.all = []; this.dirs = []; this.notes = []; this.texts = {}; this.folded = {}; this.outgoing = {}; this.aliases = {};
    this.relLower = new Map(); this.byName = new Map(); this.tree = { rel: '', dir: true, children: [] };
  }
  abs(rel) { return rel ? this.root.replace(/[\\/]$/, '') + '/' + rel : this.root; }

  async scan(invoke) {
    const entries = await invoke('scan', { root: this.root });
    this.reset();
    for (const e of entries) (e.dir ? this.dirs : this.all).push(e.rel.normalize('NFC'));
    this.notes = this.all.filter((f) => kindOf(f) === 'note').sort(cmpName);
    this.rebuildMaps();
    const texts = await invoke('read_many', { root: this.root, rels: this.notes });
    for (const r of this.notes) this.setText(r, texts[r] ?? texts[r.normalize('NFD')] ?? '', false);
    for (const r of this.notes) this.outgoing[r] = this.linksIn(this.texts[r], r);
    this.buildTree();
  }
  rebuildMaps() {
    this.relLower = new Map(this.all.map((f) => [f.toLowerCase(), f]));
    this.byName = new Map();
    for (const f of this.all) { const k = basename(f).toLowerCase(); if (!this.byName.has(k)) this.byName.set(k, []); this.byName.get(k).push(f); }
  }
  /** Přidá nový soubor do indexu bez celého přenačtení. */
  addFile(rel, text) {
    if (!this.all.includes(rel)) { this.all.push(rel); this.rebuildMaps(); }
    if (kindOf(rel) === 'note') {
      if (!this.notes.includes(rel)) { this.notes.push(rel); this.notes.sort(cmpName); }
      this.setText(rel, text ?? '');
    }
    this.buildTree();
  }
  setText(rel, text, links = true) {
    this.texts[rel] = text;
    this.folded[rel] = fold(bodyOf(text));
    const a = parseAliases(text); if (a.length) this.aliases[rel] = a; else delete this.aliases[rel];
    if (links) this.outgoing[rel] = this.linksIn(text, rel);
  }

  buildTree() {
    const root = { rel: '', name: '', dir: true, children: [], hasFiles: false };
    const map = new Map([['', root]]);
    const ensure = (rel) => {
      if (map.has(rel)) return map.get(rel);
      const parent = ensure(dirname(rel));
      const n = { rel, name: basename(rel), dir: true, children: [], hasFiles: false };
      parent.children.push(n); map.set(rel, n);
      return n;
    };
    for (const d of this.dirs) ensure(d);
    for (const f of this.all) {
      const p = ensure(dirname(f));
      p.hasFiles = true;
      const k = kindOf(f);
      if (k === 'note' || k === 'pdf') p.children.push({ rel: f, name: titleOf(f), dir: false, kind: k });
    }
    const prune = (n) => {
      n.children = n.children.filter((c) => { if (!c.dir) return true; prune(c); return c.children.length > 0 || !c.hasFiles; });
      n.children.sort((a, b) => (a.dir === b.dir ? cmpName(a.name, b.name) : a.dir ? -1 : 1));
    };
    prune(root);
    this.tree = root;
  }

  resolve(raw, from) {
    const t = (raw || '').trim().normalize('NFC');
    if (!t) return from;
    let lower = t.toLowerCase();
    try { lower = decodeURIComponent(lower); } catch (e) {}
    for (const c of [lower, lower + '.md']) if (this.relLower.has(c)) return this.relLower.get(c);
    if (from) {
      const dir = dirname(from).toLowerCase();
      if (dir) for (const c of [dir + '/' + lower, dir + '/' + lower + '.md']) if (this.relLower.has(c)) return this.relLower.get(c);
    }
    const base = basename(lower);
    for (const key of [base + '.md', base]) {
      const list = this.byName.get(key);
      if (!list || !list.length) continue;
      if (list.length === 1) return list[0];
      const m = list.find((r) => r.toLowerCase().endsWith('/' + lower) || r.toLowerCase().endsWith('/' + lower + '.md'));
      if (m) return m;
      if (from) { const s = list.find((r) => dirname(r) === dirname(from)); if (s) return s; }
      return list.slice().sort((a, b) => a.length - b.length)[0];
    }
    return null;
  }
  targets(text) { return [...text.matchAll(WIKI)].map((m) => splitTarget(m[1]).target); }
  linksIn(text, rel) {
    const s = new Set();
    for (const t of this.targets(text)) { if (!t) continue; const r = this.resolve(t, rel); if (r && r !== rel) s.add(r); }
    return s;
  }
  backlinks(rel) { return this.notes.filter((r) => this.outgoing[r]?.has(rel)); }
  searchKey(rel) { return fold([rel, ...(this.aliases[rel] || [])].join(' ')); }

  search(query) {
    const q = fold(query.trim());
    if (!q) return [];
    const hits = [];
    for (const r of this.notes) {
      const key = this.searchKey(r);
      const titleMatch = key.split(/[^\p{L}\p{N}#]+/u).some((w) => w.startsWith(q)) || (q.includes(' ') && key.includes(q));
      const ft = this.folded[r] || '';
      let count = 0, i = ft.indexOf(q);
      const first = i;
      while (i >= 0 && count < 500) { count++; i = ft.indexOf(q, i + q.length); }
      if (!count && !titleMatch) continue;
      let snippet = '';
      if (first >= 0) {
        const body = bodyOf(this.texts[r] || '');
        const start = Math.max(0, first - 60);
        snippet = (start ? '…' : '') + body.slice(start, start + 220)
          .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/[#*>`=|]|\[![a-z]+\][-+]?/g, '').replace(/\s+/g, ' ').trim();
      }
      hits.push({ rel: r, snippet, titleMatch, count });
    }
    return hits.sort((a, b) => (b.titleMatch - a.titleMatch) || (b.count - a.count) || (a.rel.length - b.rel.length));
  }

  /** Data pro vykreslení: text, kam vedou odkazy, vložené poznámky, kresby. */
  async payload(rel, text, invoke) {
    const links = {}, embeds = {};
    const collect = (t, from, depth) => {
      for (const target of this.targets(t)) {
        if (!target || links[target]) continue;
        const r = this.resolve(target, from);
        if (!r) { links[target] = { kind: 'missing' }; continue; }
        const k = kindOf(r);
        links[target] = { rel: r, kind: k };
        if (k === 'note' && depth < 1 && embeds[r] == null && t.includes('![[')) { embeds[r] = this.texts[r] || ''; collect(embeds[r], r, depth + 1); }
      }
    };
    collect(text, rel, 0);
    const drawRels = Object.values(links).filter((l) => l.kind === 'drawing').map((l) => l.rel);
    const drawings = drawRels.length ? await invoke('read_many', { root: this.root, rels: drawRels }) : {};
    return { path: rel, markdown: text, links, embeds, drawings };
  }
  extras() {
    return { notes: this.notes.map((r) => ({ rel: r, title: titleOf(r), aliases: this.aliases[r] || [] })), files: this.all };
  }
}

window.ZCore = { Library, fold, kindOf, dirname, basename, titleOf, cmpName, splitTarget };
})();
