import { useEffect, useState } from "react";
import { openFolder } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";
import type { AppPrefs } from "../types/prefs";

export function PreferencesPage() {
  const navigate = useAppStore((s) => s.navigate);
  const prefs = useAppStore((s) => s.prefs);
  const prefsLoaded = useAppStore((s) => s.prefsLoaded);
  const loadPrefs = useAppStore((s) => s.loadPrefs);
  const savePrefs = useAppStore((s) => s.savePrefs);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [draft, setDraft] = useState<AppPrefs>(prefs);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prefsLoaded) {
      void loadPrefs();
    }
  }, [prefsLoaded, loadPrefs]);

  useEffect(() => {
    setDraft(prefs);
  }, [prefs]);

  const patch = <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const browseDownloadPath = async () => {
    const result = await openFolder();
    if (result.ok) {
      if (result.paths[0]) patch("downloadPath", result.paths[0]);
      return;
    }
    if (result.reason === "unavailable") {
      setStatusMessage(
        "Folder picker not available yet — edit the path manually",
      );
      return;
    }
    if (result.reason === "error") {
      setStatusMessage(result.message);
    }
  };

  const onDone = async () => {
    setSaving(true);
    try {
      await savePrefs(draft);
      navigate("torrent-list");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <h1>Preferences</h1>

      <section className="prefs-section">
        <h2>Downloads</h2>
        <div className="field">
          <label htmlFor="pref-download">Download location</label>
          <div className="path-row">
            <input
              id="pref-download"
              type="text"
              value={draft.downloadPath}
              onChange={(e) => patch("downloadPath", e.target.value)}
            />
            <button
              type="button"
              className="btn"
              onClick={() => void browseDownloadPath()}
            >
              Browse…
            </button>
          </div>
          <p className="hint-muted" style={{ marginTop: 6 }}>
            Uses <code>open_directory</code> / dialog plugin when available
          </p>
        </div>
      </section>

      <section className="prefs-section">
        <h2>Playback</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={!draft.openExternalPlayer}
            onChange={(e) => patch("openExternalPlayer", !e.target.checked)}
          />
          Play torrent media files using WebTorrent
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.highestPlaybackPriority}
            onChange={(e) =>
              patch("highestPlaybackPriority", e.target.checked)
            }
          />
          Highest playback priority
        </label>
      </section>

      <section className="prefs-section">
        <h2>System</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.startup}
            onChange={(e) => patch("startup", e.target.checked)}
          />
          Open WebTorrent on startup
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.soundNotifications}
            onChange={(e) => patch("soundNotifications", e.target.checked)}
          />
          Enable sounds
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.isFileHandler}
            onChange={(e) => patch("isFileHandler", e.target.checked)}
          />
          Handle <code>.torrent</code> files and magnet links
        </label>
      </section>

      <div className="actions">
        <button
          type="button"
          className="btn primary"
          disabled={saving}
          onClick={() => void onDone()}
        >
          {saving ? "Saving…" : "Done"}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigate("torrent-list")}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
