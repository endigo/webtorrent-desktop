//! WebTorrent Desktop — Tauri 2 shell.
//!
//! Wires plugins, application menu, tray, single-instance, deep links, prefs,
//! and the shell command surface used by the React UI.

mod commands;
mod dialogs;
mod dispatch;
mod engine;
mod menu;
mod prefs;
mod tray;
mod window;

use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be registered first so deep-link argv from a second
    // process is delivered here instead of spawning another window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            crate::window::show(app);
            crate::dispatch::process_argv(app, argv);
        }));
    }

    builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ));
    }

    builder
        .manage(menu::MenuState::default())
        .manage(tray::TrayState::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_torrent,
            commands::open_files,
            commands::open_directory,
            commands::show_item_in_folder,
            commands::open_path,
            commands::move_to_trash,
            commands::set_window_title,
            commands::set_progress,
            commands::set_badge,
            commands::toggle_fullscreen,
            commands::toggle_always_on_top,
            commands::show_window,
            commands::hide_window,
            commands::quit_app,
            commands::prefs_get,
            commands::prefs_set,
            commands::prefs_merge,
            commands::prefs_path,
            engine::torrent_add,
            engine::torrent_remove,
            engine::torrent_create,
            engine::torrent_select_files,
            engine::stream_start,
            engine::stream_stop,
            engine::engine_ping,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Prefs must load after the path resolver is ready.
            handle.manage(prefs::Prefs::load(&handle));

            // WebTorrent Node sidecar (lazy-spawn on first command; pre-resolve path).
            let engine_dir = engine::resolve_engine_dir(&handle);
            handle.manage(engine::Engine::new(engine_dir.clone()));
            if engine_dir.join("index.js").is_file() {
                if let Some(eng) = handle.try_state::<engine::Engine>() {
                    if let Err(err) = engine::ensure_started(&handle, eng.inner()) {
                        eprintln!("engine warm-start skipped: {err}");
                    }
                }
            } else {
                eprintln!(
                    "engine not found at {} — torrent commands will fail until engine/ is installed",
                    engine_dir.display()
                );
            }

            menu::init(&handle)?;
            if let Err(err) = tray::init(&handle) {
                // Tray is best-effort (missing icon assets, no libappindicator, etc.).
                eprintln!("tray init skipped: {err}");
            }

            // Deep links (magnet:) and file associations (.torrent).
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                if let Ok(Some(urls)) = handle.deep_link().get_current() {
                    let urls: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
                    crate::dispatch::process_urls(&handle, urls);
                }

                let handle_for_links = handle.clone();
                handle.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                    crate::dispatch::process_urls(&handle_for_links, urls);
                });

                // Linux / Windows dev builds: register schemes at runtime.
                #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
                {
                    if let Err(err) = handle.deep_link().register_all() {
                        eprintln!("deep-link register_all: {err}");
                    }
                }
            }

            // Process argv from the first launch (jump list, .desktop, open-with).
            let argv: Vec<String> = std::env::args().collect();
            crate::dispatch::process_argv(&handle, argv);

            // Show the main window (created as visible:false so we control timing).
            crate::window::show(&handle);

            // Tell the UI the shell is ready.
            let _ = handle.emit("app://ready", ());

            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_event(app, event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if window.label() != window::MAIN_WINDOW {
                return;
            }
            match event {
                // Electron hid the window on close so the torrent engine kept running.
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    crate::window::hide(window.app_handle());
                }
                WindowEvent::Focused(focused) => {
                    if *focused {
                        crate::tray::refresh(window.app_handle());
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running WebTorrent Desktop");
}
