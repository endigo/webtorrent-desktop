//! System tray — the Rust half of `src/main/tray.js`.
//!
//! Electron only showed a tray on Windows/Linux (macOS apps typically use the
//! dock). We keep that policy: create a tray with Show/Hide + Quit on those
//! platforms. On macOS this module is a no-op.

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, Wry};

const TRAY_ID: &str = "webtorrent-tray";
const TOGGLE_ID: &str = "tray.toggle";
const QUIT_ID: &str = "tray.quit";

pub struct TrayState {
    icon: Mutex<Option<TrayIcon<Wry>>>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            icon: Mutex::new(None),
        }
    }
}

/// Create the tray icon when the platform supports it.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    // Match Electron: tray is Windows + Linux only.
    if cfg!(target_os = "macos") {
        return Ok(());
    }

    let toggle = MenuItemBuilder::with_id(TOGGLE_ID, toggle_label(app)).build(app)?;
    let quit = MenuItemBuilder::with_id(QUIT_ID, "Quit").build(app)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .tooltip("WebTorrent")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TOGGLE_ID => {
                if crate::window::is_visible(app) {
                    crate::window::hide(app);
                } else {
                    crate::window::show(app);
                }
            }
            QUIT_ID => crate::window::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::window::show(tray.app_handle());
            }
        })
        .build(app)?;

    if let Some(state) = app.try_state::<TrayState>() {
        *state.icon.lock().unwrap_or_else(|e| e.into_inner()) = Some(tray);
    }

    Ok(())
}

/// Rebuild the tray context menu so the Show/Hide label stays accurate.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    // Only meaningful where we created a tray.
    if cfg!(target_os = "macos") {
        return;
    }

    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    let guard = state.icon.lock().unwrap_or_else(|e| e.into_inner());
    let Some(tray) = guard.as_ref() else {
        return;
    };

    // Rebuild menu with current visibility.
    // TrayIcon is typed to Wry in state; cast via AppHandle of the concrete runtime.
    let app_wry = tray.app_handle();
    if let (Ok(toggle), Ok(quit)) = (
        MenuItemBuilder::with_id(TOGGLE_ID, toggle_label(app_wry)).build(app_wry),
        MenuItemBuilder::with_id(QUIT_ID, "Quit").build(app_wry),
    ) {
        if let Ok(menu) = Menu::with_items(app_wry, &[&toggle, &quit]) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn toggle_label<R: Runtime>(app: &AppHandle<R>) -> &'static str {
    if crate::window::is_visible(app) {
        "Hide to tray"
    } else {
        "Show WebTorrent"
    }
}
