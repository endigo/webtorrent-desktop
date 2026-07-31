//! Application menu — the Rust half of `src/main/menu.js`.
//!
//! Builds a File / Edit / View / Playback / Transfers / Help menu (plus the
//! macOS app menu) and keeps a few checkable items in managed state so the
//! window helpers can sync them after programmatic toggles.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::json;
use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder,
    PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Manager, Runtime, Wry};

use crate::dispatch::dispatch;

const APP_NAME: &str = "WebTorrent";
const HOME_PAGE_URL: &str = "https://webtorrent.io";
const GITHUB_URL: &str = "https://github.com/webtorrent/webtorrent-desktop";
const GITHUB_URL_ISSUES: &str = "https://github.com/webtorrent/webtorrent-desktop/issues";
const GITHUB_URL_RELEASES: &str =
    "https://github.com/webtorrent/webtorrent-desktop/releases";
const TWITTER_PAGE_URL: &str = "https://twitter.com/WebTorrentApp";

/// Menu ids handled by [`handle_event`].
pub mod id {
    pub const CREATE_TORRENT: &str = "menu.create_torrent";
    pub const CREATE_TORRENT_FILE: &str = "menu.create_torrent_file";
    pub const OPEN_TORRENT: &str = "menu.open_torrent";
    pub const OPEN_ADDRESS: &str = "menu.open_address";
    pub const PREFERENCES: &str = "menu.preferences";
    pub const FULL_SCREEN: &str = "menu.full_screen";
    pub const FLOAT_ON_TOP: &str = "menu.float_on_top";
    pub const GO_BACK: &str = "menu.go_back";
    pub const DEVTOOLS: &str = "menu.devtools";
    pub const PLAY_PAUSE: &str = "menu.play_pause";
    pub const SKIP_NEXT: &str = "menu.skip_next";
    pub const SKIP_PREV: &str = "menu.skip_prev";
    pub const VOL_UP: &str = "menu.vol_up";
    pub const VOL_DOWN: &str = "menu.vol_down";
    pub const STEP_FWD: &str = "menu.step_fwd";
    pub const STEP_BACK: &str = "menu.step_back";
    pub const SPEED_UP: &str = "menu.speed_up";
    pub const SPEED_DOWN: &str = "menu.speed_down";
    pub const ADD_SUBTITLES: &str = "menu.add_subtitles";
    pub const PAUSE_ALL: &str = "menu.pause_all";
    pub const RESUME_ALL: &str = "menu.resume_all";
    pub const REMOVE_ALL_LIST: &str = "menu.remove_all_list";
    pub const REMOVE_ALL_DATA: &str = "menu.remove_all_data";
    pub const HELP_HOME: &str = "menu.help_home";
    pub const HELP_RELEASES: &str = "menu.help_releases";
    pub const HELP_CONTRIBUTE: &str = "menu.help_contribute";
    pub const HELP_ISSUE: &str = "menu.help_issue";
    pub const HELP_TWITTER: &str = "menu.help_twitter";
    pub const QUIT: &str = "menu.quit";
}

pub struct MenuState {
    full_screen: Mutex<Option<CheckMenuItem<Wry>>>,
    float_on_top: Mutex<Option<CheckMenuItem<Wry>>>,
    float_on_top_flag: AtomicBool,
}

impl Default for MenuState {
    fn default() -> Self {
        Self {
            full_screen: Mutex::new(None),
            float_on_top: Mutex::new(None),
            float_on_top_flag: AtomicBool::new(false),
        }
    }
}

impl MenuState {
    fn set_full_screen_item(&self, item: CheckMenuItem<Wry>) {
        *self.full_screen.lock().unwrap_or_else(|e| e.into_inner()) = Some(item);
    }

    fn set_float_item(&self, item: CheckMenuItem<Wry>) {
        *self.float_on_top.lock().unwrap_or_else(|e| e.into_inner()) = Some(item);
    }
}

/// Build the application menu and install it on the app.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<MenuState>();

    let fullscreen_accel = if cfg!(target_os = "macos") {
        "Ctrl+Cmd+F"
    } else {
        "F11"
    };

    let full_screen = CheckMenuItemBuilder::with_id(id::FULL_SCREEN, "Full Screen")
        .checked(false)
        .accelerator(fullscreen_accel)
        .build(app)?;
    let float_on_top = CheckMenuItemBuilder::with_id(id::FLOAT_ON_TOP, "Float on Top")
        .checked(false)
        .build(app)?;
    state.set_full_screen_item(full_screen.clone());
    state.set_float_item(float_on_top.clone());

    // --- File ---
    let mut file = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id(
                id::CREATE_TORRENT,
                if cfg!(target_os = "macos") {
                    "Create New Torrent..."
                } else {
                    "Create New Torrent from Folder..."
                },
            )
            .accelerator("CmdOrCtrl+N")
            .build(app)?,
        );

    if !cfg!(target_os = "macos") {
        file = file.item(
            &MenuItemBuilder::with_id(id::CREATE_TORRENT_FILE, "Create New Torrent from File...")
                .build(app)?,
        );
    }

    file = file
        .item(
            &MenuItemBuilder::with_id(id::OPEN_TORRENT, "Open Torrent File...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(id::OPEN_ADDRESS, "Open Torrent Address...")
                .accelerator("CmdOrCtrl+U")
                .build(app)?,
        )
        .separator()
        .close_window();

    #[cfg(target_os = "linux")]
    {
        file = file
            .separator()
            .item(&MenuItemBuilder::with_id(id::QUIT, "Quit").build(app)?);
    }

    let file = file.build()?;

    // --- Edit ---
    let mut edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste_with_text("Paste Torrent Address")
        .separator()
        .select_all();

    if !cfg!(target_os = "macos") {
        edit = edit.separator().item(
            &MenuItemBuilder::with_id(id::PREFERENCES, "Preferences")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        );
    }

    let edit = edit.build()?;

    // --- View ---
    let view = SubmenuBuilder::new(app, "View")
        .item(&full_screen)
        .item(&float_on_top)
        .separator()
        .item(
            &MenuItemBuilder::with_id(id::GO_BACK, "Go Back")
                .accelerator("Escape")
                .build(app)?,
        )
        .separator()
        .item(
            &SubmenuBuilder::new(app, "Developer")
                .item(
                    &MenuItemBuilder::with_id(id::DEVTOOLS, "Developer Tools")
                        .accelerator(if cfg!(target_os = "macos") {
                            "Alt+Cmd+I"
                        } else {
                            "Ctrl+Shift+I"
                        })
                        .build(app)?,
                )
                .build()?,
        )
        .build()?;

    // --- Playback (disabled until a file is playing) ---
    let playback = SubmenuBuilder::new(app, "Playback")
        .item(
            &MenuItemBuilder::with_id(id::PLAY_PAUSE, "Play/Pause")
                .accelerator("Space")
                .enabled(false)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(id::SKIP_NEXT, "Skip Next")
                .accelerator("N")
                .enabled(false)
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(id::SKIP_PREV, "Skip Previous")
                .accelerator("P")
                .enabled(false)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(id::VOL_UP, "Increase Volume")
                .accelerator("CmdOrCtrl+Up")
                .enabled(false)
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(id::VOL_DOWN, "Decrease Volume")
                .accelerator("CmdOrCtrl+Down")
                .enabled(false)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(id::STEP_FWD, "Step Forward")
                .accelerator(if cfg!(target_os = "macos") {
                    "CmdOrCtrl+Alt+Right"
                } else {
                    "Alt+Right"
                })
                .enabled(false)
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(id::STEP_BACK, "Step Backward")
                .accelerator(if cfg!(target_os = "macos") {
                    "CmdOrCtrl+Alt+Left"
                } else {
                    "Alt+Left"
                })
                .enabled(false)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(id::SPEED_UP, "Increase Speed")
                .accelerator("CmdOrCtrl+Equal")
                .enabled(false)
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(id::SPEED_DOWN, "Decrease Speed")
                .accelerator("CmdOrCtrl+Minus")
                .enabled(false)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(id::ADD_SUBTITLES, "Add Subtitles File...")
                .enabled(false)
                .build(app)?,
        )
        .build()?;

    // --- Transfers ---
    let transfers = SubmenuBuilder::new(app, "Transfers")
        .item(&MenuItemBuilder::with_id(id::PAUSE_ALL, "Pause All").build(app)?)
        .item(&MenuItemBuilder::with_id(id::RESUME_ALL, "Resume All").build(app)?)
        .item(
            &MenuItemBuilder::with_id(id::REMOVE_ALL_LIST, "Remove All From List").build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(id::REMOVE_ALL_DATA, "Remove All Data Files").build(app)?,
        )
        .build()?;

    // --- Help ---
    let help = SubmenuBuilder::new(app, "Help")
        .item(
            &MenuItemBuilder::with_id(id::HELP_HOME, format!("Learn more about {APP_NAME}"))
                .build(app)?,
        )
        .item(&MenuItemBuilder::with_id(id::HELP_RELEASES, "Release Notes").build(app)?)
        .item(
            &MenuItemBuilder::with_id(id::HELP_CONTRIBUTE, "Contribute on GitHub").build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(id::HELP_ISSUE, "Report an Issue...").build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(id::HELP_TWITTER, "Follow us on Twitter").build(app)?,
        )
        .build()?;

    let mut menu = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, APP_NAME)
            .about(Some(AboutMetadata {
                name: Some(APP_NAME.into()),
                ..Default::default()
            }))
            .separator()
            .item(
                &MenuItemBuilder::with_id(id::PREFERENCES, "Preferences")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?,
            )
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        menu = menu.item(&app_menu);
    }

    menu = menu
        .item(&file)
        .item(&edit)
        .item(&view)
        .item(&playback)
        .item(&transfers);

    #[cfg(target_os = "macos")]
    {
        let window = SubmenuBuilder::new(app, "Window")
            .minimize()
            .separator()
            .item(&PredefinedMenuItem::bring_all_to_front(app, None)?)
            .build()?;
        menu = menu.item(&window);
    }

    let menu = menu.item(&help).build()?;
    app.set_menu(menu)?;

    Ok(())
}

pub fn is_float_on_top<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<MenuState>()
        .map(|s| s.float_on_top_flag.load(Ordering::Relaxed))
        .unwrap_or(false)
}

pub fn sync_full_screen<R: Runtime>(app: &AppHandle<R>, checked: bool) {
    if let Some(state) = app.try_state::<MenuState>() {
        if let Some(item) = state
            .full_screen
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
        {
            let _ = item.set_checked(checked);
        }
    }
}

pub fn sync_float_on_top<R: Runtime>(app: &AppHandle<R>, checked: bool) {
    if let Some(state) = app.try_state::<MenuState>() {
        state.float_on_top_flag.store(checked, Ordering::Relaxed);
        if let Some(item) = state
            .float_on_top
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
        {
            let _ = item.set_checked(checked);
        }
    }
}

/// Route a menu click to the matching shell action / UI dispatch.
pub fn handle_event(app: &AppHandle, id: &str) {
    match id {
        id::CREATE_TORRENT => crate::dialogs::spawn_open_seed_directory(app),
        id::CREATE_TORRENT_FILE => crate::dialogs::spawn_open_seed_file(app),
        id::OPEN_TORRENT => crate::dialogs::spawn_open_torrent_file(app),
        id::OPEN_ADDRESS => dispatch(app, "openTorrentAddress", vec![]),
        id::PREFERENCES => dispatch(app, "preferences", vec![]),
        id::FULL_SCREEN => {
            let _ = crate::window::toggle_full_screen(app, None);
        }
        id::FLOAT_ON_TOP => {
            let _ = crate::window::toggle_always_on_top(app, None);
        }
        id::GO_BACK => dispatch(app, "escapeBack", vec![]),
        id::DEVTOOLS => {
            #[cfg(debug_assertions)]
            if let Some(window) = crate::window::main_window(app) {
                window.open_devtools();
            }
        }
        id::PLAY_PAUSE => dispatch(app, "playPause", vec![]),
        id::SKIP_NEXT => dispatch(app, "nextTrack", vec![]),
        id::SKIP_PREV => dispatch(app, "previousTrack", vec![]),
        id::VOL_UP => dispatch(app, "changeVolume", vec![json!(0.1)]),
        id::VOL_DOWN => dispatch(app, "changeVolume", vec![json!(-0.1)]),
        id::STEP_FWD => dispatch(app, "skip", vec![json!(10)]),
        id::STEP_BACK => dispatch(app, "skip", vec![json!(-10)]),
        id::SPEED_UP => dispatch(app, "changePlaybackRate", vec![json!(1)]),
        id::SPEED_DOWN => dispatch(app, "changePlaybackRate", vec![json!(-1)]),
        id::ADD_SUBTITLES => dispatch(app, "openSubtitles", vec![]),
        id::PAUSE_ALL => dispatch(app, "pauseAllTorrents", vec![]),
        id::RESUME_ALL => dispatch(app, "resumeAllTorrents", vec![]),
        id::REMOVE_ALL_LIST => dispatch(app, "confirmDeleteAllTorrents", vec![json!(false)]),
        id::REMOVE_ALL_DATA => dispatch(app, "confirmDeleteAllTorrents", vec![json!(true)]),
        id::HELP_HOME => open_url(app, HOME_PAGE_URL),
        id::HELP_RELEASES => open_url(app, GITHUB_URL_RELEASES),
        id::HELP_CONTRIBUTE => open_url(app, GITHUB_URL),
        id::HELP_ISSUE => open_url(app, GITHUB_URL_ISSUES),
        id::HELP_TWITTER => open_url(app, TWITTER_PAGE_URL),
        id::QUIT => crate::window::quit(app),
        _ => {}
    }
}

fn open_url(app: &AppHandle, url: &str) {
    use tauri_plugin_opener::OpenerExt;
    if let Err(err) = app.opener().open_url(url, None::<&str>) {
        eprintln!("open_url({url}) failed: {err}");
    }
}

// Silence unused import warning when Menu is only used via builders on some builds.
#[allow(dead_code)]
fn _menu_type_anchor() -> Option<Menu<Wry>> {
    None
}
