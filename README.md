# Zápisník

Jednoduchý sešit na poznámky pro **Mac a Windows**. Poznámky jsou obyčejné soubory `.md` ve složce *Dokumenty › Poznámky*, takže o nic nepřijdeš a otevřeš je i v Obsidianu nebo jiném editoru.

## Stažení

Nejnovější verze je v [Releases](https://github.com/WertexDigital/zapisnik/releases/latest):

- **Mac:** `Zapisnik_…_universal.dmg` – otevři a přetáhni Zápisník do Aplikací.
  Aplikace není podepsaná u Applu, takže při prvním spuštění: *Nastavení systému › Soukromí a zabezpečení › Přesto otevřít*.
- **Windows:** `Zapisnik_…_x64-setup.exe` – při varování SmartScreen klikni *Další informace › Přesto spustit*.

Nainstalovaná aplikace **se aktualizuje sama**: při spuštění zkontroluje GitHub a nabídne novou verzi.

## Co umí

- **Číst / Psát** (⌘E / Ctrl+E) – při psaní text vypadá hotově, značky Markdownu se ukážou jen na řádku s kurzorem
- lišta formátování, nabídka **/**, barvy textu a zvýraznění, rámečky (tip, pozor, otázka se skrytou odpovědí…), tabulky, vzorce, kód, diagramy
- odkazy `[[poznámka]]` s našeptáváním, zpětné odkazy a obsah v pravém panelu, přejmenování opraví odkazy všude
- **kreslení** do poznámek i do obrázků (pero, zvýrazňovač, guma, tvary, barvy, mřížka) – kresby jsou SVG a dají se znovu upravit
- **zkoušení** z otázek v poznámce s zápisem výsledku, oblíbené, nedávné, deník, rychlé otevření, tisk / PDF, režim soustředění
- nastavení vzhledu: písmo, velikost, řádkování, šířka, motiv (světlý, tmavý, sépie), barva

## Vývoj

Potřebuješ Node.js a Rust.

```bash
npm install
npm run dev      # spustí aplikaci s živými změnami
npm run build    # sestaví instalačku pro tento systém
```

Struktura:

- `ui/` – rozhraní (`shell.js` okno a soubory, `core.js` index poznámek, `app.js` čtení, `style.css`, `shell.css`)
- `editor-src/` – editor (CodeMirror 6: `livepreview.js` živý náhled, `drawing.js` kreslení) → `ui/editor.bundle.js`
- `src-tauri/` – jádro v Rustu (soubory, koš, tisk, protokol `zapisnik://` pro obrázky, aktualizace)

## Vydání nové verze

```bash
./scripts/release.sh 2.0.1
```

Skript zvýší verzi, vytvoří značku `v2.0.1` a pošle ji na GitHub. GitHub Actions sestaví Mac i Windows verzi,
podepíše aktualizace klíčem `TAURI_SIGNING_PRIVATE_KEY` (tajemství repozitáře) a vydá je. Aplikace si je pak samy stáhnou.

Soukromý klíč k podepisování aktualizací je jen u autora (`~/.tauri/zapisnik.key`) a v tajemstvích repozitáře – bez něj nejde vydat aktualizaci.
