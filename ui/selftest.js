// Automatický test (běží jen s ZAPISNIK_SELFTEST=1 nad testovací složkou ZAPISNIK_ROOT).
window.ZSelfTest = async () => {
  const T = window.__TAURI__, A = window.ZApp;
  const out = [];
  const log = (ok, name) => out.push((ok ? 'OK   ' : 'FAIL ') + name);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const read = (rel) => T.core.invoke('read_text', { path: A.LIB.abs(rel) }).catch(() => '');
  try {
    log(A.LIB.notes.length > 100, `index načten (${A.LIB.notes.length} poznámek)`);
    log(document.querySelectorAll('#sb-list .row').length > 5, 'postranní panel se strom');
    // poznámka s nejvíc rámečky a diagramem
    const rich = A.LIB.notes.filter((r) => /```mermaid/.test(A.LIB.texts[r])).sort((a, b) => (A.LIB.texts[b].match(/\[!/g) || []).length - (A.LIB.texts[a].match(/\[!/g) || []).length)[0] || A.LIB.notes[0];
    await A.open(rich);
    await wait(1200);
    log(document.querySelectorAll('#doc .callout').length > 0 && document.querySelectorAll('#doc .mermaid svg').length > 0, 'čtení: rámečky a diagramy');
    log(document.querySelectorAll('#insp-body .toc').length > 0, 'pravý panel: obsah');
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(0); const imgRel = A.LIB.all.find((r) => /\.(jpe?g|png)$/i.test(r)) || ''; i.src = window.LOCAL_BASE + imgRel.split('/').map(encodeURIComponent).join('/'); });
    log(img > 0, `obrázky přes zapisnik:// (${img}px)`);
    const rel = await A.newNote('', 'Test A', '# Test A\n\n- [ ] úkol\n\n[[Test B]]\n\n> [!question]- Kolik je 2+2?\n> 4\n');
    await A.newNote('', 'Test B', '# Test B\n');
    await A.open('Test A.md');
    await wait(800);
    log(A.S.mode === 'edit' && document.querySelectorAll('.cm-link-widget').length >= 1, 'editor: nová poznámka a živý náhled');
    window.ZE.insertText('\nNapsáno v testu'); window.ZE.flush();
    await wait(1200); await A.saveNow();
    log((await read('Test A.md')).includes('Napsáno v testu'), 'uložení do souboru');
    await A.rename('Test B.md', 'Test C', false);
    await wait(300);
    log((await read('Test A.md')).includes('[[Test C]]'), 'přejmenování opraví odkazy');
    log(A.LIB.backlinks('Test C.md').includes('Test A.md'), 'zpětné odkazy');
    await A.saveDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><metadata>{"v":1,"strokes":[],"bg":"none"}</metadata></svg>', null, true, null);
    await wait(500); window.ZE.flush(); await wait(500); await A.saveNow();
    log((await read('Test A.md')).includes('![[Kresba'), 'kresba vložena');
    await A.setMode('read'); await wait(800);
    window.startQuiz(); await wait(200);
    document.querySelector('#quiz [data-a=show]')?.click(); document.querySelector('#quiz [data-a=good]')?.click();
    log(/100 %/.test(document.querySelector('#quiz .quiz-score')?.textContent || ''), 'zkoušení');
    document.querySelector('#quiz [data-a=close]')?.click();
    A.toggleFavorite('Test A.md');
    log(document.querySelector('#sb-list .ric.fav') != null, 'oblíbené');
  } catch (e) { out.push('FAIL výjimka: ' + e); }
  for (const l of out) await T.core.invoke('log_line', { msg: l });
  await T.process.exit(0);
};
