//! Main process → renderer messaging.
//!
//! Electron used `windows.main.dispatch(action, ...args)` which forwarded a
//! `dispatch` IPC message to the renderer. The Tauri shell keeps the same shape
//! so the frontend only needs one listener:
//!
//! ```js
//! import { listen } from '@tauri-apps/api/event'
//! listen('app://dispatch', ({ payload }) => dispatch(payload.action, ...payload.args))
//! ```

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Runtime};

/// Single event channel carrying every shell → UI action.
pub const DISPATCH_EVENT: &str = "app://dispatch";

#[derive(Clone, Serialize)]
pub struct DispatchPayload {
    pub action: String,
    pub args: Vec<Value>,
}

/// Emit `app://dispatch` with the legacy `(action, ...args)` shape.
pub fn dispatch<R: Runtime>(app: &AppHandle<R>, action: &str, args: Vec<Value>) {
    let payload = DispatchPayload {
        action: action.to_string(),
        args,
    };
    if let Err(err) = app.emit(DISPATCH_EVENT, payload) {
        eprintln!("dispatch({action}) failed: {err}");
    }
}

/// Mirror of the Electron `processArgv`: turn command line arguments into
/// torrent ids, honouring the `-n` / `-o` / `-u` shortcuts used by the Windows
/// jump list and the `.desktop` entry.
pub fn process_argv<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>) {
    let mut torrent_ids = Vec::new();

    // argv[0] is the executable path.
    for arg in argv.into_iter().skip(1) {
        match arg.as_str() {
            "-n" => crate::dialogs::spawn_open_seed_directory(app),
            "-o" => crate::dialogs::spawn_open_torrent_file(app),
            "-u" => dispatch(app, "openTorrentAddress", vec![]),
            // Already handled at startup.
            "--hidden" => {}
            // Mac launchd "process serial number" argument.
            _ if arg.starts_with("-psn") => {}
            // Flags belong to the runtime, not to us.
            _ if arg.starts_with("--") => {}
            // A dev copy started next to a production one gets '.' passed in.
            "." | "data:," => {}
            _ => {
                if let Some(id) = normalize_torrent_id(&arg) {
                    torrent_ids.push(id);
                }
            }
        }
    }

    if !torrent_ids.is_empty() {
        dispatch(app, "onOpen", vec![json!(torrent_ids)]);
    }
}

/// Handle `magnet:` deep links and `.torrent` file-open events. On macOS both
/// arrive as URLs through the deep-link plugin.
pub fn process_urls<R: Runtime>(app: &AppHandle<R>, urls: Vec<String>) {
    let torrent_ids: Vec<String> = urls
        .iter()
        .filter_map(|url| normalize_torrent_id(url))
        .collect();

    if torrent_ids.is_empty() {
        return;
    }

    crate::window::show(app);
    dispatch(app, "onOpen", vec![json!(torrent_ids)]);
}

/// `file://` URLs become plain paths; everything else (magnet, http, a bare
/// path) is passed through untouched.
fn normalize_torrent_id(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    match raw.strip_prefix("file://") {
        Some(rest) => {
            let rest = rest.strip_prefix("localhost").unwrap_or(rest);
            Some(percent_decode(rest))
        }
        None => Some(raw.to_string()),
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}
