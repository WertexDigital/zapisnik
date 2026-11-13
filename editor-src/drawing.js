// Kreslení do poznámek – výsledek je SVG soubor, který v sobě nese i data tahů (dá se znovu upravit).
import { getStroke } from 'perfect-freehand';
import { icon } from './icons.js';

const COLORS = ['auto', '#e5484d', '#f76b15', '#f5b800', '#30a46c', '#0090ff', '#8e4ec6', '#e93d82'];
const SIZES = { pen: [2, 4, 8], marker: [12, 20, 30], shape: [2, 3.5, 6], eraser: [10, 20, 36] };
const TOOLS = [
  ['pen', 'Pero (P)', 'pen'], ['marker', 'Zvýrazňovač (M)', 'marker'], ['eraser', 'Guma (E)', 'eraser'],
  ['line', 'Čára (L)', 'line'], ['arrow', 'Šipka (A)', 'arrow'], ['rect', 'Obdélník (R)', 'rect'], ['ellipse', 'Elipsa (O)', 'ellipse'],
];
const KEYS = { p: 'pen', m: 'marker', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse' };
const BGS = [['none', 'Prázdné', 'blank'], ['lines', 'Linky', 'lines'], ['grid', 'Mřížka', 'grid'], ['dots', 'Tečky', 'dots']];

const r2 = (v) => Math.round(v * 10) / 10;
const fillOf = (c) => (c === 'auto' ? 'currentColor' : c);

function pathFromOutline(pts) {
  if (!pts.length) return '';
  const d = pts.reduce((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    acc.push(r2(x0), r2(y0), r2((x0 + x1) / 2), r2((y0 + y1) / 2));
    return acc;
  }, ['M', r2(pts[0][0]), r2(pts[0][1]), 'Q']);
  d.push('Z');
  return d.join(' ');
}

function strokeSVG(s) {
  const fill = fillOf(s.color);
  if (s.tool === 'pen' || s.tool === 'marker') {
    const outline = getStroke(s.points, {
      size: s.size, thinning: s.tool === 'pen' ? 0.55 : 0, smoothing: 0.5, streamline: 0.45,
      simulatePressure: !s.pressure, last: true,
      start: { cap: true }, end: { cap: true },
    });
    const op = s.tool === 'marker' ? ' fill-opacity="0.35"' : '';
    return `<path d="${pathFromOutline(outline)}" fill="${fill}"${op}/>`;
  }
  const [a, b] = [s.points[0], s.points[s.points.length - 1]];
  const st = `stroke="${fill}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  if (s.tool === 'line') return `<line x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(b[0])}" y2="${r2(b[1])}" ${st}/>`;
  if (s.tool === 'arrow') {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), len = 10 + s.size * 3;
    const p1 = [b[0] - len * Math.cos(ang - 0.45), b[1] - len * Math.sin(ang - 0.45)];
    const p2 = [b[0] - len * Math.cos(ang + 0.45), b[1] - len * Math.sin(ang + 0.45)];
    return `<path d="M${r2(a[0])} ${r2(a[1])} L${r2(b[0])} ${r2(b[1])} M${r2(p1[0])} ${r2(p1[1])} L${r2(b[0])} ${r2(b[1])} L${r2(p2[0])} ${r2(p2[1])}" ${st}/>`;
  }
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
  if (s.tool === 'rect') return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="6" ${st}/>`;
  if (s.tool === 'ellipse') return `<ellipse cx="${r2(x + w / 2)}" cy="${r2(y + h / 2)}" rx="${r2(w / 2)}" ry="${r2(h / 2)}" ${st}/>`;
  return '';
}

// body tvaru pro gumu a ohraničení
function samplePoints(s) {
  if (s.tool === 'pen' || s.tool === 'marker') return s.points;
  const [a, b] = [s.points[0], s.points[s.points.length - 1]];
  const out = [];
  const seg = (p, q) => { for (let i = 0; i <= 20; i++) out.push([p[0] + (q[0] - p[0]) * i / 20, p[1] + (q[1] - p[1]) * i / 20]); };
  if (s.tool === 'line' || s.tool === 'arrow') seg(a, b);
  else if (s.tool === 'rect') { seg(a, [b[0], a[1]]); seg([b[0], a[1]], b); seg(b, [a[0], b[1]]); seg([a[0], b[1]], a); }
  else if (s.tool === 'ellipse') {
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2;
    for (let i = 0; i < 48; i++) out.push([cx + rx * Math.cos(i / 48 * Math.PI * 2), cy + ry * Math.sin(i / 48 * Math.PI * 2)]);
  }
  return out;
}

function patternDefs(id, bg) {
  const c = 'rgba(128,128,128,0.28)';
  if (bg === 'lines') return `<pattern id="${id}" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H32" stroke="${c}" stroke-width="1"/></pattern>`;
  if (bg === 'grid') return `<pattern id="${id}" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H32M31.5 0V32" stroke="${c}" stroke-width="1"/></pattern>`;
  if (bg === 'dots') return `<pattern id="${id}" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="1.4" fill="${c}"/></pattern>`;
  return '';
}

export function parseDrawing(svgText) {
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const meta = doc.querySelector('metadata');
    const data = meta ? JSON.parse(meta.textContent) : null;
    if (!data) return null;
    const img = doc.querySelector('image');
    if (data.image && img) data.image.href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    return data;
  } catch (e) { return null; }
}

async function toDataURL(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return { href: c.toDataURL('image/jpeg', 0.86), w: c.width, h: c.height };
}

/**
 * Otevře kreslicí plátno.
 * opts: { svg?: existující kresba, imageURL?: obrázek, do kterého se kreslí, onSave(svg), onCancel() }
 */
export async function openDrawing(opts = {}) {
  const old = opts.svg ? parseDrawing(opts.svg) : null;
  let strokes = old?.strokes || [];
  let bg = old?.bg || (opts.imageURL ? 'none' : 'grid');
  let image = old?.image || null;
  let tool = 'pen', color = 'auto', sizeIdx = 1;
  const undo = [], redo = [];
  let dirty = false;

  const ov = document.createElement('div');
  ov.id = 'draw';
  ov.innerHTML = `
    <div class="draw-bar">
      <div class="dgroup tools">${TOOLS.map(([t, title, ic]) => `<button data-tool="${t}" title="${title}">${icon(ic)}</button>`).join('')}</div>
      <div class="dsep"></div>
      <div class="dgroup colors">${COLORS.map(c => `<button data-color="${c}" class="swatch${c === 'auto' ? ' auto' : ''}" style="--sw:${c === 'auto' ? 'var(--text)' : c}" title="${c === 'auto' ? 'Automatická (černá / bílá)' : c}"></button>`).join('')}</div>
      <div class="dsep"></div>
      <div class="dgroup sizes">${[0, 1, 2].map(i => `<button data-size="${i}" title="${['Tenká', 'Střední', 'Silná'][i]}"><span style="width:${4 + i * 4}px;height:${4 + i * 4}px"></span></button>`).join('')}</div>
      <div class="dsep"></div>
      <div class="dgroup bgs">${BGS.map(([b, title, ic]) => `<button data-bg="${b}" title="Pozadí: ${title}">${icon(ic)}</button>`).join('')}</div>
      <div class="dsep"></div>
      <div class="dgroup"><button data-act="undo" title="Zpět (⌘Z)">${icon('undo')}</button><button data-act="redo" title="Znovu (⇧⌘Z)">${icon('redo')}</button><button data-act="clear" title="Smazat vše">${icon('trash')}</button></div>
      <div class="dspacer"></div>
      <button class="dbtn" data-act="cancel">Zrušit</button>
      <button class="dbtn primary" data-act="save">${icon('check', 16)} Uložit kresbu</button>
    </div>
    <div class="draw-stage"><svg class="draw-svg" xmlns="http://www.w3.org/2000/svg"><defs></defs><rect class="draw-bg" x="-5000" y="-5000" width="20000" height="20000"/><g class="draw-img"></g><g class="draw-strokes"></g><g class="draw-live"></g></svg></div>
    <div class="draw-hint">Kresli myší, trackpadem nebo perem · klávesy P M E L A R O přepínají nástroje</div>`;
  document.body.appendChild(ov);
  document.body.classList.add('drawing-open');
  const svg = ov.querySelector('.draw-svg');
  const gStrokes = ov.querySelector('.draw-strokes'), gLive = ov.querySelector('.draw-live'), gImg = ov.querySelector('.draw-img');
  const defs = ov.querySelector('defs'), bgRect = ov.querySelector('.draw-bg');

  if (opts.imageURL && !image) {
    try {
      const d = await toDataURL(opts.imageURL);
      const stageW = ov.querySelector('.draw-stage').clientWidth - 80;
      const w = Math.min(d.w, stageW), h = d.h * (w / d.w);
      image = { href: d.href, x: 40, y: 40, w, h };
    } catch (e) { console.log('obrázek', e); }
  }

  function renderBG() {
    defs.innerHTML = patternDefs('draw-pat', bg);
    bgRect.setAttribute('fill', bg === 'none' ? 'transparent' : 'url(#draw-pat)');
    gImg.innerHTML = image ? `<image href="${image.href}" x="${image.x}" y="${image.y}" width="${image.w}" height="${image.h}"/>` : '';
  }
  function renderAll() { gStrokes.innerHTML = strokes.map(strokeSVG).join(''); }
  function syncBar() {
    ov.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    ov.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === color));
    ov.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('on', +b.dataset.size === sizeIdx));
    ov.querySelectorAll('[data-bg]').forEach(b => b.classList.toggle('on', b.dataset.bg === bg));
    ov.querySelector('[data-act=undo]').disabled = !undo.length;
    ov.querySelector('[data-act=redo]').disabled = !redo.length;
    svg.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  }
  const snapshot = () => { undo.push(JSON.stringify(strokes)); redo.length = 0; dirty = true; };
  renderBG(); renderAll(); syncBar();

  // kreslení
  let cur = null, erasing = false;
  const pt = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.pointerType === 'pen' ? e.pressure : 0.5]; };
  function eraseAt(p) {
    const rad = SIZES.eraser[sizeIdx];
    const keep = strokes.filter(s => !samplePoints(s).some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < rad + s.size / 2));
    if (keep.length !== strokes.length) { strokes = keep; renderAll(); }
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    const p = pt(e);
    if (tool === 'eraser') { snapshot(); erasing = true; eraseAt(p); return; }
    const kind = tool === 'pen' || tool === 'marker' ? tool : 'shape';
    cur = { tool, color, size: SIZES[kind][sizeIdx], pressure: e.pointerType === 'pen', points: [p] };
  });
  svg.addEventListener('pointermove', (e) => {
    if (erasing) { eraseAt(pt(e)); return; }
    if (!cur) return;
    let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (!evs || !evs.length) evs = [e];
    if (cur.tool === 'pen' || cur.tool === 'marker') for (const ev of evs) cur.points.push(pt(ev));
    else cur.points[1] = pt(e);
    if (cur.tool !== 'pen' && cur.tool !== 'marker' && e.shiftKey && cur.points[1]) { // Shift = rovně / čtverec
      const [a, b] = cur.points;
      if (cur.tool === 'rect' || cur.tool === 'ellipse') { const d = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); cur.points[1] = [a[0] + Math.sign(b[0] - a[0]) * d, a[1] + Math.sign(b[1] - a[1]) * d, b[2]]; }
      else { const ang = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(b[0] - a[0], b[1] - a[1]); cur.points[1] = [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang), b[2]]; }
    }
    gLive.innerHTML = strokeSVG(cur);
  });
  const end = () => {
    if (erasing) { erasing = false; syncBar(); return; }
    if (!cur) return;
    if (cur.points.length > 1 || cur.tool === 'pen' || cur.tool === 'marker') {
      snapshot();
      cur.points = cur.points.map(p => [r2(p[0]), r2(p[1]), Math.round(p[2] * 100) / 100]);
      strokes.push(cur);
    }
    cur = null; gLive.innerHTML = ''; renderAll(); syncBar();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  function exportSVG() {
    const all = strokes.flatMap(s => samplePoints(s).map(p => [p[0], p[1], s.size]));
    if (!all.length && !image) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, sz] of all) { x0 = Math.min(x0, x - sz); y0 = Math.min(y0, y - sz); x1 = Math.max(x1, x + sz); y1 = Math.max(y1, y + sz); }
    if (image) { x0 = Math.min(x0, image.x); y0 = Math.min(y0, image.y); x1 = Math.max(x1, image.x + image.w); y1 = Math.max(y1, image.y + image.h); }
    const pad = 16; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const w = r2(x1 - x0), h = r2(y1 - y0);
    const id = 'zp' + Math.random().toString(36).slice(2, 8);
    const meta = JSON.stringify({ v: 1, bg, strokes, image: image ? { x: image.x, y: image.y, w: image.w, h: image.h } : null })
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const bgEl = bg === 'none' ? '' : `<rect x="${r2(x0)}" y="${r2(y0)}" width="${w}" height="${h}" fill="url(#${id})"/>`;
    const imgEl = image ? `<image href="${image.href}" x="${image.x}" y="${image.y}" width="${image.w}" height="${image.h}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x0)} ${r2(y0)} ${w} ${h}" width="${w}" height="${h}" class="zapisnik-kresba">` +
      `<metadata>${meta}</metadata><defs>${patternDefs(id, bg)}</defs>${bgEl}${imgEl}<g>${strokes.map(strokeSVG).join('')}</g></svg>`;
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    ov.remove();
    document.body.classList.remove('drawing-open');
  }
  function cancel() {
    if (dirty && !confirm('Zahodit změny v kresbě?')) return;
    close(); opts.onCancel?.();
  }
  function save() {
    const out = exportSVG();
    close();
    if (out) opts.onSave?.(out); else opts.onCancel?.();
  }
  function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(strokes)); strokes = JSON.parse(undo.pop()); renderAll(); syncBar(); }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(strokes)); strokes = JSON.parse(redo.pop()); renderAll(); syncBar(); }

  ov.querySelector('.draw-bar').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) tool = b.dataset.tool;
    else if (b.dataset.color) { color = b.dataset.color; if (tool === 'eraser') tool = 'pen'; }
    else if (b.dataset.size) sizeIdx = +b.dataset.size;
    else if (b.dataset.bg) { bg = b.dataset.bg; dirty = true; renderBG(); }
    else if (b.dataset.act === 'undo') doUndo();
    else if (b.dataset.act === 'redo') doRedo();
    else if (b.dataset.act === 'clear') { if (strokes.length && confirm('Smazat celou kresbu?')) { snapshot(); strokes = []; renderAll(); } }
    else if (b.dataset.act === 'cancel') return cancel();
    else if (b.dataset.act === 'save') return save();
    syncBar();
  });
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); save(); return; }
    if (!e.metaKey && !e.ctrlKey && KEYS[e.key.toLowerCase()]) { tool = KEYS[e.key.toLowerCase()]; syncBar(); e.stopPropagation(); }
  }
  document.addEventListener('keydown', onKey, true);
  return { exportSVG, close };
}
