import { useState } from "react";
import { useAppStore } from "../store/useAppStore";

export function CreateTorrentPage() {
  const paths = useAppStore((s) => s.createTorrentPaths);
  const navigate = useAppStore((s) => s.navigate);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const handleOpenFiles = useAppStore((s) => s.handleOpenFiles);

  const defaultName =
    paths.length > 0
      ? paths[0].split(/[/\\]/).filter(Boolean).pop() ?? "untitled"
      : "untitled";

  const [name, setName] = useState(defaultName);
  const [comment, setComment] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [trackers, setTrackers] = useState(
    "udp://tracker.opentrackr.org:1337/announce\nudp://open.tracker.cl:1337/announce",
  );

  return (
    <div className="page-shell create-torrent">
      <h1>Create Torrent</h1>
      <p>
        Choose files or a folder, then create a <code>.torrent</code> metadata
        file. Engine wiring lands in a later milestone.
      </p>

      <div className="field torrent-attribute">
        <label htmlFor="ct-files">Files</label>
        {paths.length === 0 ? (
          <p className="path-value">No files selected</p>
        ) : (
          <ul className="path-value" style={{ margin: 0, paddingLeft: 18 }}>
            {paths.map((p) => (
              <li key={p}>{p}</li>
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
          onClick={() => {
            setStatusMessage(
              `Create torrent “${name}” not wired yet (mock shell)`,
            );
            navigate("torrent-list");
          }}
        >
          Create torrent
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
