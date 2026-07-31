//! Native file dialogs — the Rust half of `src/main/dialog.js`.
//!
//! Every picker exists in two flavours:
//!   * `pick_*` — async, returns the selected paths to the caller (commands)
//!   * `spawn_*` — fire and forget, results reach the UI via `app://dispatch`
//!     (menu items, jump list arguments)
//!
//! Deviation from Electron: macOS open panels could select files *and* folders
//! in one dialog. `rfd` (and therefore `tauri-plugin-dialog`) cannot, so the
//! "create torrent" flow is split into an explicit file picker and folder
//! picker on every platform.

use serde_json::json;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

use crate::dispatch::dispatch;

const TITLE_TORRENT_FILE: &str = "Select a .torrent file.";
pub const TITLE_ADD_FILES: &str = "Select a file to add.";
pub const TITLE_SEED_FILE: &str = "Select a file for the torrent.";
pub const TITLE_SEED_DIRECTORY: &str = "Select a folder for the torrent.";

/// Turn the plugin's `Option<Vec<FilePath>>` callback argument into plain
/// strings and hand them to a `std::sync::mpsc` sender.
macro_rules! send_paths {
    ($tx:expr) => {
        move |selection| {
            let paths: Vec<String> = selection
                .unwrap_or_default()
                .into_iter()
                .filter_map(|entry| entry.into_path().ok())
                .map(|path: std::path::PathBuf| path.to_string_lossy().into_owned())
                .collect();
            let _ = $tx.send(paths);
        }
    };
}

fn file_builder<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    let builder = app.dialog().file().set_title(title);

    match crate::window::main_window(app) {
        Some(window) => builder.set_parent(&window),
        None => builder,
    }
}

/// The dialog callbacks fire on the main thread, so the receiver has to wait on
/// a blocking pool thread rather than in the async task itself.
async fn await_paths(rx: std::sync::mpsc::Receiver<Vec<String>>) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || rx.recv().unwrap_or_default())
        .await
        .unwrap_or_default()
}

pub async fn pick_torrent_files<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    file_builder(app, TITLE_TORRENT_FILE)
        .add_filter("Torrent Files", &["torrent"])
        .pick_files(send_paths!(tx));
    await_paths(rx).await
}

pub async fn pick_files<R: Runtime>(app: &AppHandle<R>, title: &str) -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    file_builder(app, title).pick_files(send_paths!(tx));
    await_paths(rx).await
}

pub async fn pick_folders<R: Runtime>(app: &AppHandle<R>, title: &str) -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    file_builder(app, title).pick_folders(send_paths!(tx));
    await_paths(rx).await
}

pub async fn pick_save_path<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    file_name: Option<String>,
) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut builder = file_builder(app, title);
    if let Some(name) = file_name {
        builder = builder.set_file_name(name);
    }
    builder.save_file(move |selection| {
        let path = selection
            .and_then(|entry| entry.into_path().ok())
            .map(|path: std::path::PathBuf| path.to_string_lossy().into_owned());
        let _ = tx.send(path.into_iter().collect::<Vec<String>>());
    });
    await_paths(rx).await.into_iter().next()
}

/// Show the `.torrent` picker and add every selection, like the File menu did.
pub fn spawn_open_torrent_file<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for path in pick_torrent_files(&app).await {
            dispatch(&app, "addTorrent", vec![json!(path)]);
        }
    });
}

pub fn spawn_open_files<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let paths = pick_files(&app, TITLE_ADD_FILES).await;
        if !paths.is_empty() {
            dispatch(&app, "onOpen", vec![json!(paths)]);
        }
    });
}

pub fn spawn_open_seed_file<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let paths = pick_files(&app, TITLE_SEED_FILE).await;
        if !paths.is_empty() {
            dispatch(&app, "showCreateTorrent", vec![json!(paths)]);
        }
    });
}

pub fn spawn_open_seed_directory<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let paths = pick_folders(&app, TITLE_SEED_DIRECTORY).await;
        if !paths.is_empty() {
            dispatch(&app, "showCreateTorrent", vec![json!(paths)]);
        }
    });
}

pub mod titles {
    pub use super::{TITLE_ADD_FILES, TITLE_SEED_DIRECTORY};
}
