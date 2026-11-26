//! Zápisník – jádro aplikace: práce se soubory poznámek, koš, tisk a protokol zapisnik:// pro obrázky.
use base64::Engine;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{http, Manager};

/// Složka s poznámkami – z ní protokol zapisnik:// čte obrázky a přílohy.
struct Root(Mutex<PathBuf>);

#[derive(Serialize)]
struct Entry {
    rel: String,
    dir: bool,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn walk(base: &Path, dir: &Path, out: &mut Vec<Entry>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // .obsidian, .trash, .git, .DS_Store…
        }
        let path = e.path();
        let Ok(rel) = path.strip_prefix(base) else { continue };
        let rel = rel.to_string_lossy().replace('\\', "/");
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(Entry { rel, dir: is_dir });
        if is_dir {
            walk(base, &path, out);
        }
    }
}

#[tauri::command]
fn default_root() -> String {
    dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Poznámky")
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn set_root(state: tauri::State<Root>, root: String) -> Result<(), String> {
    fs::create_dir_all(&root).map_err(err)?;
    *state.0.lock().unwrap() = PathBuf::from(root);
    Ok(())
}

#[tauri::command]
fn scan(root: String) -> Vec<Entry> {
    let mut out = Vec::new();
    let base = PathBuf::from(&root);
    walk(&base, &base, &mut out);
    out
}

#[tauri::command]
fn read_many(root: String, rels: Vec<String>) -> HashMap<String, String> {
    let base = PathBuf::from(root);
    rels.into_iter()
        .filter_map(|r| fs::read_to_string(base.join(&r)).ok().map(|t| (r, t)))
        .collect()
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(err)
}

/// Bezpečný zápis: nejdřív do dočasného souboru, pak přejmenování (nepřijdeš o text při pádu).
#[tauri::command]
fn write_text(path: String, text: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = PathBuf::from(format!("{path}.zapisnik-tmp"));
    fs::write(&tmp, text.as_bytes()).map_err(err)?;
    fs::rename(&tmp, &p).map_err(err)
}

#[tauri::command]
fn write_base64(path: String, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(err)?;
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(p, bytes).map_err(err)
}

#[tauri::command]
fn make_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(path).map_err(err)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    let same_ignoring_case = from.to_lowercase() == to.to_lowercase();
    if Path::new(&to).exists() && !same_ignoring_case {
        return Err("Soubor s tímto názvem už existuje.".into());
    }
    fs::rename(from, to).map_err(err)
}

#[tauri::command]
fn copy_file(from: String, to: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&to).parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::copy(from, to).map(|_| ()).map_err(err)
}

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)?.flatten() {
        let name = e.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let src = e.path();
        let dst = to.join(&name);
        if e.file_type()?.is_dir() {
            copy_tree(&src, &dst)?;
        } else {
            fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn copy_dir(from: String, to: String) -> Result<(), String> {
    copy_tree(Path::new(&from), Path::new(&to)).map_err(err)
}

type AnyErr = Box<dyn std::error::Error + Send + Sync>;

/// Už zkomprimované soubory se do ZIPu jen uloží (rychlejší, menší by stejně nebyly).
fn already_compressed(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "heic" | "pdf" | "zip" | "mp4" | "mov" | "mp3" | "m4a")
    )
}

/// Zabalí složku do ZIPu; uvnitř je všechno ve složce se stejným názvem (po rozbalení vznikne jedna složka).
fn zip_dir(dir: &Path, dest: &Path) -> Result<usize, AnyErr> {
    use zip::{write::SimpleFileOptions, CompressionMethod};
    let top = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Poznámky".into());
    let mut entries = Vec::new();
    walk(dir, dir, &mut entries);
    let tmp = PathBuf::from(format!("{}.zapisnik-tmp", dest.to_string_lossy()));
    let mut w = zip::ZipWriter::new(fs::File::create(&tmp)?);
    let deflate = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let store = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let mut count = 0;
    let mut add_all = || -> Result<(), AnyErr> {
        for e in &entries {
            let name = format!("{top}/{}", e.rel);
            if e.dir {
                w.add_directory(name, deflate)?;
                continue;
            }
            let src = dir.join(&e.rel);
            if src == tmp || src == dest {
                continue; // ZIP ukládaný přímo do sešitu nebalíme sám do sebe
            }
            w.start_file(name, if already_compressed(&src) { store } else { deflate })?;
            std::io::copy(&mut fs::File::open(&src)?, &mut w)?;
            count += 1;
        }
        Ok(())
    };
    let finished = add_all().and_then(|_| w.finish().map(|_| ()).map_err(AnyErr::from));
    if let Err(e) = finished {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    fs::rename(&tmp, dest)?;
    Ok(count)
}

/// Rozbalí ZIP do složky `dest`. Nikdy nezapíše mimo ni; vynechá __MACOSX a skryté soubory.
/// Když je v ZIPu všechno v jedné složce (ZIP z Finderu nebo ze Zápisníku), tu jednu úroveň přeskočí.
fn unzip_to(zip_path: &Path, dest: &Path) -> Result<usize, AnyErr> {
    let mut a = zip::ZipArchive::new(fs::File::open(zip_path)?)?;
    let mut files: Vec<(usize, PathBuf)> = Vec::new();
    for i in 0..a.len() {
        let f = a.by_index(i)?;
        if f.is_dir() {
            continue;
        }
        let Some(p) = f.enclosed_name() else { continue };
        let hidden = p.components().any(|c| {
            let s = c.as_os_str().to_string_lossy();
            s.starts_with('.') || s == "__MACOSX"
        });
        if !hidden {
            files.push((i, p.to_path_buf()));
        }
    }
    if files.is_empty() {
        return Err("V ZIPu nejsou žádné poznámky ani soubory.".into());
    }
    let first = files[0].1.components().next().map(|c| c.as_os_str().to_owned());
    let strip = files
        .iter()
        .all(|(_, p)| p.components().count() > 1 && p.components().next().map(|c| c.as_os_str().to_owned()) == first);
    fs::create_dir_all(dest)?;
    for (i, p) in &files {
        let rel: PathBuf = if strip { p.components().skip(1).collect() } else { p.clone() };
        let out = dest.join(rel);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut f = a.by_index(*i)?;
        std::io::copy(&mut f, &mut fs::File::create(&out)?)?;
    }
    Ok(files.len())
}

/// Export sešitu nebo složky do ZIPu (běží mimo hlavní vlákno, okno nezamrzne). Vrací počet souborů.
#[tauri::command]
async fn export_zip(dir: String, dest: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || zip_dir(Path::new(&dir), Path::new(&dest)).map_err(err))
        .await
        .map_err(err)?
}

/// Import ZIPu do nové složky. Vrací počet rozbalených souborů.
#[tauri::command]
async fn import_zip(zip: String, dest: String) -> Result<usize, String> {
    if Path::new(&dest).exists() {
        return Err("Složka pro import už existuje.".into());
    }
    tauri::async_runtime::spawn_blocking(move || unzip_to(Path::new(&zip), Path::new(&dest)).map_err(err))
        .await
        .map_err(err)?
}

/// Smazání = přesun do Koše (dá se vrátit).
#[tauri::command]
fn trash_path(path: String) -> Result<(), String> {
    trash::delete(path).map_err(err)
}

/// Jen pro automatické testy: složka a přepínač testu z proměnných prostředí.
#[tauri::command]
fn test_config() -> HashMap<String, String> {
    ["ZAPISNIK_ROOT", "ZAPISNIK_SELFTEST"]
        .iter()
        .filter_map(|k| std::env::var(k).ok().map(|v| (k.to_string(), v)))
        .collect()
}

#[tauri::command]
fn log_line(msg: String) {
    println!("{msg}");
}

#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(err)
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("heic") => "image/heic",
        Some("bmp") => "image/bmp",
        Some("tif") | Some("tiff") => "image/tiff",
        Some("pdf") => "application/pdf",
        Some("md") | Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn not_found() -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(404)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Root(Mutex::new(PathBuf::from(default_root()))))
        // zapisnik://localhost/<cesta v poznámkách> (na Windows http://zapisnik.localhost/…)
        .register_uri_scheme_protocol("zapisnik", |ctx, req| {
            let root = ctx.app_handle().state::<Root>().0.lock().unwrap().clone();
            let raw = req.uri().path().trim_start_matches('/');
            let rel = percent_encoding::percent_decode_str(raw).decode_utf8_lossy().to_string();
            let file = root.join(&rel);
            match (fs::canonicalize(&file), fs::canonicalize(&root)) {
                (Ok(f), Ok(r)) if f.starts_with(&r) => match fs::read(&f) {
                    Ok(bytes) => http::Response::builder()
                        .header("Content-Type", mime_for(&f))
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Cache-Control", "no-cache")
                        .body(bytes)
                        .unwrap(),
                    Err(_) => not_found(),
                },
                _ => not_found(),
            }
        })
        .setup(|app| {
            // automatické testy běží bez viditelného okna
            if std::env::var("ZAPISNIK_SELFTEST").is_ok() {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_position(tauri::PhysicalPosition::new(-20000, -20000));
                    let _ = w.set_skip_taskbar(true);
                }
                #[cfg(target_os = "macos")]
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            default_root, set_root, scan, read_many, read_text, write_text, write_base64, make_dir,
            path_exists, rename_path, copy_file, copy_dir, trash_path, export_zip, import_zip, print_page, test_config, log_line
        ])
        .run(tauri::generate_context!())
        .expect("chyba při spuštění Zápisníku");
}
