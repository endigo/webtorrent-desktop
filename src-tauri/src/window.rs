//! Main window lifecycle — the Rust half of `src/main/windows/main.js`.

use tauri::window::{ProgressBarState, ProgressBarStatus};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::dispatch::dispatch;

pub const MAIN_WINDOW: &str = "main";

/// Grace period between asking the UI to flush its state and actually exiting.
const QUIT_GRACE_MS: u64 = 400;

pub fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(MAIN_WINDOW)
}

pub fn show<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = main_window(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    crate::tray::refresh(app);
}

/// Electron hid the window instead of destroying it, so the torrent engine kept
/// running. Same here: closing returns to the list and hides.
pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    dispatch(app, "backToList", vec![]);
    if let Some(window) = main_window(app) {
        let _ = window.hide();
    }
    crate::tray::refresh(app);
}

pub fn is_visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    main_window(app)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

/// Ask the UI to persist its state, then exit. Mirrors the `before-quit`
/// handler, with a shorter fuse than Electron's 4s because prefs are written
/// synchronously by the Rust side.
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    dispatch(app, "stateSaveImmediate", vec![]);

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(QUIT_GRACE_MS));
        handle.exit(0);
    });
}

pub fn set_title<R: Runtime>(app: &AppHandle<R>, title: &str) {
    if let Some(window) = main_window(app) {
        let _ = window.set_title(title);
    }
}

/// Set the taskbar/dock progress bar. Matches Electron's `setProgressBar`:
/// `< 0` removes it, `> 1` makes it indeterminate.
pub fn set_progress<R: Runtime>(app: &AppHandle<R>, progress: f64) {
    let Some(window) = main_window(app) else {
        return;
    };

    let state = if progress < 0.0 {
        ProgressBarState {
            status: Some(ProgressBarStatus::None),
            progress: Some(0),
        }
    } else if progress > 1.0 {
        ProgressBarState {
            status: Some(ProgressBarStatus::Indeterminate),
            progress: None,
        }
    } else {
        ProgressBarState {
            status: Some(ProgressBarStatus::Normal),
            progress: Some((progress * 100.0).round() as u64),
        }
    };

    let _ = window.set_progress_bar(state);
}

/// Dock badge (macOS) / launcher count (Linux). `0` clears it.
pub fn set_badge<R: Runtime>(app: &AppHandle<R>, count: i64) {
    if let Some(window) = main_window(app) {
        let _ = window.set_badge_count(if count > 0 { Some(count) } else { None });
    }
}

pub fn is_full_screen<R: Runtime>(app: &AppHandle<R>) -> bool {
    main_window(app)
        .and_then(|window| window.is_fullscreen().ok())
        .unwrap_or(false)
}

pub fn toggle_full_screen<R: Runtime>(app: &AppHandle<R>, flag: Option<bool>) -> bool {
    let Some(window) = main_window(app) else {
        return false;
    };
    if !window.is_visible().unwrap_or(false) {
        return false;
    }

    let target = flag.unwrap_or_else(|| !window.is_fullscreen().unwrap_or(false));
    let _ = window.set_fullscreen(target);
    crate::menu::sync_full_screen(app, target);
    dispatch(app, "fullscreenChanged", vec![serde_json::json!(target)]);
    target
}

pub fn toggle_always_on_top<R: Runtime>(app: &AppHandle<R>, flag: Option<bool>) -> bool {
    let Some(window) = main_window(app) else {
        return false;
    };

    // Tauri has no `is_always_on_top`, so the menu check state is the source of
    // truth when no explicit flag is given.
    let target = flag.unwrap_or_else(|| !crate::menu::is_float_on_top(app));
    let _ = window.set_always_on_top(target);
    crate::menu::sync_float_on_top(app, target);
    target
}
