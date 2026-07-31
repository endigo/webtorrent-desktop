//! Tauri commands exposed to the frontend (`invoke`).
//!
//! Names match `docs/TAURI_MIGRATION.md` and the fallbacks in `ui/src/lib/tauri.ts`.

use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::prefs::Prefs;

/// Open a native `.torrent` file picker and return selected paths.
#[tauri::command]
pub async fn open_torrent(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(crate::dialogs::pick_torrent_files(&app).await)
}

/// Open a native multi-file picker (create-torrent / add files).
#[tauri::command]
pub async fn open_files(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(crate::dialogs::pick_files(&app, crate::dialogs::titles::TITLE_ADD_FILES).await)
}

/// Open a folder picker (seed directory / download path).
#[tauri::command]
pub async fn open_directory(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(
        crate::dialogs::pick_folders(&app, crate::dialogs::titles::TITLE_SEED_DIRECTORY)
            .await,
    )
}

/// Reveal `path` in the platform file manager (Finder / Explorer).
#[tauri::command]
pub fn show_item_in_folder(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|err| err.to_string())
}

/// Open `path` with the default application.
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|err| err.to_string())
}

/// Move `path` to the trash.
#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|err| err.to_string())
}

/// Set the main window title.
#[tauri::command]
pub fn set_window_title(app: AppHandle, title: String) {
    crate::window::set_title(&app, &title);
}

/// Set the taskbar/dock progress bar (`< 0` clears, `> 1` indeterminate).
#[tauri::command]
pub fn set_progress(app: AppHandle, progress: f64) {
    crate::window::set_progress(&app, progress);
}

/// Set the dock/launcher badge count (`0` clears).
#[tauri::command]
pub fn set_badge(app: AppHandle, count: i64) {
    crate::window::set_badge(&app, count);
}

/// Toggle (or force) fullscreen on the main window. Returns the new state.
#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle, flag: Option<bool>) -> bool {
    crate::window::toggle_full_screen(&app, flag)
}

/// Toggle (or force) always-on-top. Returns the new state.
#[tauri::command]
pub fn toggle_always_on_top(app: AppHandle, flag: Option<bool>) -> bool {
    crate::window::toggle_always_on_top(&app, flag)
}

/// Show the main window.
#[tauri::command]
pub fn show_window(app: AppHandle) {
    crate::window::show(&app);
}

/// Hide the main window (engine keeps running).
#[tauri::command]
pub fn hide_window(app: AppHandle) {
    crate::window::hide(&app);
}

/// Ask UI to flush state, then exit.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::window::quit(&app);
}

/// Return the full prefs document.
#[tauri::command]
pub fn prefs_get(prefs: State<'_, Prefs>) -> Value {
    prefs.get()
}

/// Replace the full prefs document.
#[tauri::command]
pub fn prefs_set(prefs: State<'_, Prefs>, value: Value) -> Result<(), String> {
    prefs.set(value)
}

/// Shallow-merge top-level keys into prefs and return the result.
#[tauri::command]
pub fn prefs_merge(prefs: State<'_, Prefs>, patch: Value) -> Result<Value, String> {
    prefs.merge(patch)
}

/// Absolute path of the on-disk prefs file (debug / diagnostics).
#[tauri::command]
pub fn prefs_path(prefs: State<'_, Prefs>) -> String {
    prefs.path().to_string_lossy().into_owned()
}
