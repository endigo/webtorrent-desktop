//! WebTorrent Node sidecar bridge.
//!
//! Spawns `engine/index.js` as a child process and speaks JSON-lines over
//! stdin/stdout. Frontend-facing commands (`torrent_add`, …) and events
//! (`torrent://progress`, …) live here.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Managed app state wrapping the sidecar.
pub struct Engine(pub Mutex<EngineInner>);

pub struct EngineInner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, Sender<EngineReply>>>>,
    engine_dir: PathBuf,
}

#[derive(Debug, Clone)]
struct EngineReply {
    ok: bool,
    result: Option<Value>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Outbound {
    #[serde(default)]
    id: Option<u64>,
    #[serde(default)]
    ok: Option<bool>,
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    event: Option<String>,
    #[serde(default)]
    payload: Option<Value>,
}

impl Engine {
    pub fn new(engine_dir: PathBuf) -> Self {
        Self(Mutex::new(EngineInner {
            child: None,
            stdin: None,
            next_id: AtomicU64::new(1),
            pending: Arc::new(Mutex::new(HashMap::new())),
            engine_dir,
        }))
    }
}

/// Locate the `engine/` directory (dev: next to repo root; prod: resource dir).
pub fn resolve_engine_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    if let Ok(resource) = app.path().resource_dir() {
        let candidate = resource.join("engine");
        if candidate.join("index.js").is_file() {
            return candidate;
        }
    }

    let mut candidates = Vec::new();
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        candidates.push(PathBuf::from(manifest).join("..").join("engine"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("engine"));
        candidates.push(cwd.join("..").join("engine"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("../../../engine"));
            candidates.push(parent.join("../../engine"));
            candidates.push(parent.join("../engine"));
        }
    }

    for c in candidates {
        if let Ok(canonical) = c.canonicalize() {
            if canonical.join("index.js").is_file() {
                return canonical;
            }
        } else if c.join("index.js").is_file() {
            return c;
        }
    }

    PathBuf::from("engine")
}

/// Ensure the child is running and the reader thread is attached.
pub fn ensure_started<R: Runtime>(app: &AppHandle<R>, engine: &Engine) -> Result<(), String> {
    let mut inner = engine.0.lock().map_err(|e| e.to_string())?;
    if inner.child.is_some() {
        return Ok(());
    }

    let engine_dir = if inner.engine_dir.join("index.js").is_file() {
        inner.engine_dir.clone()
    } else {
        let resolved = resolve_engine_dir(app);
        inner.engine_dir = resolved.clone();
        resolved
    };

    let script = engine_dir.join("index.js");
    if !script.is_file() {
        return Err(format!(
            "engine script not found at {} — run npm install in engine/",
            script.display()
        ));
    }

    let node = find_node();
    let mut child = Command::new(&node)
        .arg(&script)
        .current_dir(&engine_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("spawn {node} {}: {err}", script.display()))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "engine stdout missing".to_string())?;
    let stderr = child.stderr.take();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "engine stdin missing".to_string())?;

    let pending = Arc::clone(&inner.pending);
    let app_handle = app.clone();

    thread::Builder::new()
        .name("wt-engine-stdout".into())
        .spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<Outbound>(&line) {
                    Ok(msg) => handle_outbound(&app_handle, &pending, msg),
                    Err(err) => {
                        eprintln!("engine: bad line ({err}): {line}");
                    }
                }
            }
            eprintln!("engine: stdout closed");
        })
        .map_err(|e| e.to_string())?;

    if let Some(stderr) = stderr {
        thread::Builder::new()
            .name("wt-engine-stderr".into())
            .spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    eprintln!("[engine] {line}");
                }
            })
            .ok();
    }

    inner.stdin = Some(stdin);
    inner.child = Some(child);
    Ok(())
}

fn handle_outbound<R: Runtime>(
    app: &AppHandle<R>,
    pending: &Arc<Mutex<HashMap<u64, Sender<EngineReply>>>>,
    msg: Outbound,
) {
    if let Some(id) = msg.id {
        let reply = EngineReply {
            ok: msg.ok.unwrap_or(false),
            result: msg.result,
            error: msg.error,
        };
        if let Ok(mut map) = pending.lock() {
            if let Some(tx) = map.remove(&id) {
                let _ = tx.send(reply);
            }
        }
        return;
    }

    if let Some(event) = msg.event {
        let payload = msg.payload.unwrap_or(Value::Null);
        if let Err(err) = app.emit(&event, payload) {
            eprintln!("engine emit {event} failed: {err}");
        }
    }
}

fn find_node() -> String {
    if let Ok(node) = std::env::var("WEBTORRENT_NODE") {
        return node;
    }
    for candidate in [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ] {
        if PathBuf::from(candidate).is_file() {
            return candidate.to_string();
        }
    }
    "node".to_string()
}

/// Send a JSON-RPC-ish request and wait for the matching response.
pub fn call<R: Runtime>(
    app: &AppHandle<R>,
    engine: &Engine,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    ensure_started(app, engine)?;

    let (id, rx) = {
        let inner = engine.0.lock().map_err(|e| e.to_string())?;
        let id = inner.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel::<EngineReply>();
        inner
            .pending
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id, tx);
        (id, rx)
    };

    {
        let mut inner = engine.0.lock().map_err(|e| e.to_string())?;
        let req = json!({ "id": id, "method": method, "params": params });
        let mut line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        line.push('\n');
        let stdin = inner
            .stdin
            .as_mut()
            .ok_or_else(|| "engine stdin unavailable".to_string())?;
        stdin
            .write_all(line.as_bytes())
            .map_err(|e| format!("engine write: {e}"))?;
        stdin.flush().map_err(|e| format!("engine flush: {e}"))?;
    }

    let reply = rx
        .recv_timeout(Duration::from_secs(120))
        .map_err(|_| "engine response timeout".to_string())?;

    if reply.ok {
        Ok(reply.result.unwrap_or(Value::Null))
    } else {
        Err(reply
            .error
            .unwrap_or_else(|| "unknown engine error".into()))
    }
}

async fn call_async(
    app: AppHandle,
    method: &'static str,
    params: Value,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let eng = app
            .try_state::<Engine>()
            .ok_or_else(|| "engine state missing".to_string())?;
        call(&app, eng.inner(), method, params)
    })
    .await
    .map_err(|e| format!("engine task join: {e}"))?
}

// ---- Tauri commands --------------------------------------------------------

#[tauri::command]
pub async fn torrent_add(
    app: AppHandle,
    torrent_key: Value,
    torrent_id: String,
    path: Option<String>,
    selections: Option<Vec<bool>>,
) -> Result<Value, String> {
    call_async(
        app,
        "torrent_add",
        json!({
            "torrentKey": torrent_key,
            "torrentId": torrent_id,
            "path": path,
            "selections": selections,
        }),
    )
    .await
}

#[tauri::command]
pub async fn torrent_remove(
    app: AppHandle,
    info_hash: Option<String>,
    torrent_key: Option<Value>,
) -> Result<Value, String> {
    call_async(
        app,
        "torrent_remove",
        json!({
            "infoHash": info_hash,
            "torrentKey": torrent_key,
        }),
    )
    .await
}

#[tauri::command]
pub async fn torrent_create(
    app: AppHandle,
    torrent_key: Value,
    files: Vec<Value>,
    options: Option<Value>,
) -> Result<Value, String> {
    call_async(
        app,
        "torrent_create",
        json!({
            "torrentKey": torrent_key,
            "files": files,
            "options": options.unwrap_or(json!({})),
        }),
    )
    .await
}

#[tauri::command]
pub async fn torrent_select_files(
    app: AppHandle,
    info_hash: Option<String>,
    torrent_key: Option<Value>,
    selections: Vec<bool>,
) -> Result<Value, String> {
    call_async(
        app,
        "torrent_select_files",
        json!({
            "infoHash": info_hash,
            "torrentKey": torrent_key,
            "selections": selections,
        }),
    )
    .await
}

#[tauri::command]
pub async fn stream_start(
    app: AppHandle,
    info_hash: Option<String>,
    torrent_key: Option<Value>,
) -> Result<Value, String> {
    call_async(
        app,
        "stream_start",
        json!({
            "infoHash": info_hash,
            "torrentKey": torrent_key,
        }),
    )
    .await
}

#[tauri::command]
pub async fn stream_stop(app: AppHandle) -> Result<Value, String> {
    call_async(app, "stream_stop", json!({})).await
}

#[tauri::command]
pub async fn engine_ping(app: AppHandle) -> Result<Value, String> {
    call_async(app, "ping", json!({})).await
}

/// Shut down the child process (called on app exit).
#[allow(dead_code)]
pub fn shutdown(engine: &Engine) {
    if let Ok(mut inner) = engine.0.lock() {
        if let Some(mut child) = inner.child.take() {
            drop(inner.stdin.take());
            let _ = wait_timeout_or_kill(&mut child, Duration::from_secs(2));
        }
    }
}

fn wait_timeout_or_kill(child: &mut Child, timeout: Duration) -> std::io::Result<()> {
    let start = std::time::Instant::now();
    loop {
        match child.try_wait()? {
            Some(_) => return Ok(()),
            None if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(());
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    }
}

