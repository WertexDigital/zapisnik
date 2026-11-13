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
            path_exists, rename_path, copy_file, copy_dir, trash_path, print_page, test_config, log_line
        ])
        .run(tauri::generate_context!())
        .expect("chyba při spuštění Zápisníku");
}
