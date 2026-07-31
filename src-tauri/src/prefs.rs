//! Persisted preferences.
//!
//! Electron kept a single `config.json` under the app config directory (via the
//! `application-config` package) and the renderer owned its shape. We keep that
//! contract: Rust stores whatever JSON object the UI hands it, atomically, and
//! never interprets the keys.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime};

pub const PREFS_FILE: &str = "config.json";

pub struct Prefs {
    path: PathBuf,
    doc: Mutex<Value>,
}

impl Prefs {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> Self {
        let dir = app
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let path = dir.join(PREFS_FILE);

        let doc = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| Value::Object(Map::new()));

        Self {
            path,
            doc: Mutex::new(doc),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn get(&self) -> Value {
        self.lock().clone()
    }

    /// Replace the whole document.
    pub fn set(&self, value: Value) -> Result<(), String> {
        let mut doc = self.lock();
        *doc = value;
        write_atomic(&self.path, &doc)
    }

    /// Shallow-merge top level keys and return the result.
    pub fn merge(&self, patch: Value) -> Result<Value, String> {
        let mut doc = self.lock();

        match (doc.as_object_mut(), patch.as_object()) {
            (Some(target), Some(source)) => {
                for (key, value) in source {
                    target.insert(key.clone(), value.clone());
                }
            }
            _ => *doc = patch,
        }

        write_atomic(&self.path, &doc)?;
        Ok(doc.clone())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Value> {
        // A panic while holding the lock must not make prefs unusable.
        self.doc.lock().unwrap_or_else(|err| err.into_inner())
    }
}

fn write_atomic(path: &Path, doc: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| format!("create {}: {err}", dir.display()))?;
    }

    let bytes = serde_json::to_vec_pretty(doc).map_err(|err| err.to_string())?;
    let tmp = path.with_extension("json.tmp");

    let mut file = fs::File::create(&tmp).map_err(|err| format!("create {}: {err}", tmp.display()))?;
    file.write_all(&bytes).map_err(|err| err.to_string())?;
    file.sync_all().map_err(|err| err.to_string())?;
    drop(file);

    fs::rename(&tmp, path).map_err(|err| format!("rename into {}: {err}", path.display()))
}
