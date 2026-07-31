import { useState } from "react";
import { useAppStore } from "../store/useAppStore";

export function PreferencesPage() {
  const navigate = useAppStore((s) => s.navigate);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [downloadPath, setDownloadPath] = useState(
    "~/Downloads/WebTorrent",
  );
  const [openExternalPlayer, setOpenExternalPlayer] = useState(false);
  const [startup, setStartup] = useState(false);
  const [soundNotifications, setSoundNotifications] = useState(true);

  return (
    <div className="page-shell">
      <h1>Preferences</h1>

      <section className="prefs-section">
        <h2>Downloads</h2>
        <div className="field">
          <label htmlFor="pref-download">Download location</label>
          <input
            id="pref-download"
            type="text"
            value={downloadPath}
            onChange={(e) => setDownloadPath(e.target.value)}
          />
          <p className="path-value" style={{ marginTop: 6 }}>
            Path picker will use Tauri dialog plugin when available
          </p>
        </div>
      </section>

      <section className="prefs-section">
        <h2>Playback</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={!openExternalPlayer}
            onChange={(e) => setOpenExternalPlayer(!e.target.checked)}
          />
          Play torrent media files using WebTorrent
        </label>
      </section>

      <section className="prefs-section">
        <h2>System</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={startup}
            onChange={(e) => setStartup(e.target.checked)}
          />
          Open WebTorrent on startup
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={soundNotifications}
            onChange={(e) => setSoundNotifications(e.target.checked)}
          />
          Enable sounds
        </label>
      </section>

      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setStatusMessage("Preferences saved locally (mock — not persisted)");
            navigate("torrent-list");
          }}
        >
          Done
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
