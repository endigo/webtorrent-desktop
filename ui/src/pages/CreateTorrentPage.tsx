import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";

const DEFAULT_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
].join("\n");

export function CreateTorrentPage() {
  const paths = useAppStore((s) => s.createTorrentPaths);
  const navigate = useAppStore((s) => s.navigate);
  const handleOpenFiles = useAppStore((s) => s.handleOpenFiles);
  const handleOpenFolder = useAppStore((s) => s.handleOpenFolder);
  const handleCreateTorrent = useAppStore((s) => s.handleCreateTorrent);

  const defaultName =
    paths.length > 0
      ? (paths[0].split(/[/\\]/).filter(Boolean).pop() ?? "untitled")
      : "untitled";

  const [name, setName] = useState(defaultName);
  const [comment, setComment] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [trackers, setTrackers] = useState(DEFAULT_TRACKERS);
  const [submitting, setSubmitting] = useState(false);

  // Keep name in sync when paths change (e.g. re-pick files)
  useEffect(() => {
    if (paths.length > 0) {
      const base = paths[0].split(/[/\\]/).filter(Boolean).pop();
      if (base) setName(base);
    }
  }, [paths]);

  return (
    <div className="page-shell create-torrent">
      <h1>Create Torrent</h1>
      <p>
        Choose files or a folder, then create a <code>.torrent</code> metadata
        file. Wired to <code>torrent_create</code> when the engine is available.
      </p>

      <div className="field torrent-attribute">
        <label htmlFor="ct-files">Files / folder</label>
        {paths.length === 0 ? (
          <p className="path-value">No files selected</p>
        ) : (
          <ul className="path-list">
            {paths.map((p) => (
              <li key={p} className="path-value">
                {p}
              </li>
            ))}
          </ul>
        )}
        <div className="actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void handleOpenFiles()}
          >
            Choose files…
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void handleOpenFolder()}
          >
            Choose folder…
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ct-name">Torrent name</label>
        <input
          id="ct-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ct-comment">Comment</label>
        <input
          id="ct-comment"
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="field">
        <label htmlFor="ct-trackers">Trackers</label>
        <textarea
          id="ct-trackers"
          rows={4}
          value={trackers}
          onChange={(e) => setTrackers(e.target.value)}
        />
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        Private torrent
      </label>

      <div className="actions">
        <button
          type="button"
          className="btn primary"
          disabled={submitting || !name.trim()}
          onClick={() => {
            setSubmitting(true);
            void handleCreateTorrent({
              name: name.trim() || "untitled",
              comment: comment.trim(),
              isPrivate,
              trackers: trackers
                .split(/\r?\n/)
                .map((t) => t.trim())
                .filter(Boolean),
            }).finally(() => setSubmitting(false));
          }}
        >
          {submitting ? "Creating…" : "Create torrent"}
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
