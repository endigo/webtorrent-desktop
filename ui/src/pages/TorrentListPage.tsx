import { useCallback, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { TorrentSummary } from "../types/torrent";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatSpeed(n: number): string {
  return `${formatBytes(n)}/s`;
}

function statusLabel(t: TorrentSummary): string {
  switch (t.status) {
    case "downloading":
      return "Downloading";
    case "seeding":
      return "Seeding";
    case "paused":
      return "Paused";
    case "done":
      return "Done";
    case "queued":
      return "Queued";
    case "error":
      return t.errorMessage ? `Error: ${t.errorMessage}` : "Error";
  }
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

function TorrentRow({ torrent }: { torrent: TorrentSummary }) {
  const selectedInfoHash = useAppStore((s) => s.selectedInfoHash);
  const selectTorrent = useAppStore((s) => s.selectTorrent);
  const playTorrent = useAppStore((s) => s.playTorrent);
  const removeTorrent = useAppStore((s) => s.removeTorrent);

  const selected = selectedInfoHash === torrent.infoHash;
  const prog = torrent.progress;
  const pct = prog ? Math.floor(prog.progress * 100) : 0;

  return (
    <div
      id={torrent.testID ? `torrent-${torrent.testID}` : undefined}
      className={`torrent${selected ? " selected" : ""}`}
      style={torrent.gradient ? { background: torrent.gradient } : undefined}
      onClick={() => selectTorrent(torrent.infoHash)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTorrent(torrent.infoHash);
        }
      }}
    >
      <div className="metadata">
        <div className="name ellipsis">{torrent.name}</div>
        <div className="meta-line ellipsis">
          <span>{statusLabel(torrent)}</span>
          {prog && torrent.status === "downloading" && (
            <>
              <span className="progress-bar" aria-hidden="true">
                <i style={{ width: `${pct}%` }} />
              </span>
              <span>{pct}%</span>
              <span>
                {formatBytes(prog.downloaded)} / {formatBytes(prog.length)}
              </span>
              <span>{prog.numPeers} peers</span>
              <span>↓ {formatSpeed(prog.downloadSpeed)}</span>
              <span>↑ {formatSpeed(prog.uploadSpeed)}</span>
            </>
          )}
          {prog && torrent.status === "seeding" && (
            <>
              <span>{formatBytes(prog.length)}</span>
              <span>{prog.numPeers} peers</span>
              <span>↑ {formatSpeed(prog.uploadSpeed)}</span>
            </>
          )}
          {prog &&
            (torrent.status === "paused" ||
              torrent.status === "done" ||
              torrent.status === "queued") && (
              <>
                <span>
                  {pct}% · {formatBytes(prog.length)}
                </span>
              </>
            )}
        </div>
      </div>
      <div className="torrent-controls">
        <button
          type="button"
          className="control-btn play"
          title="Play"
          aria-label={`Play ${torrent.name}`}
          onClick={(e) => {
            e.stopPropagation();
            playTorrent(torrent.infoHash);
          }}
        >
          <PlayIcon />
        </button>
        <button
          type="button"
          className="control-btn"
          title="Remove"
          aria-label={`Remove ${torrent.name}`}
          onClick={(e) => {
            e.stopPropagation();
            void removeTorrent(torrent.infoHash);
          }}
        >
          <DeleteIcon />
        </button>
      </div>
    </div>
  );
}

export function TorrentListPage() {
  const torrents = useAppStore((s) => s.torrents);
  const usingMockTorrents = useAppStore((s) => s.usingMockTorrents);
  const magnetInput = useAppStore((s) => s.magnetInput);
  const setMagnetInput = useAppStore((s) => s.setMagnetInput);
  const handleOpenTorrent = useAppStore((s) => s.handleOpenTorrent);
  const handleOpenFiles = useAppStore((s) => s.handleOpenFiles);
  const handleAddMagnet = useAppStore((s) => s.handleAddMagnet);
  const navigate = useAppStore((s) => s.navigate);
  const [dragOver, setDragOver] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    // Tauri onDragDropEvent handles real paths; HTML5 drop is a visual affordance
    // and may only yield file names in the webview. Prefer magnet text drops.
    const text = e.dataTransfer.getData("text/plain")?.trim();
    if (text?.startsWith("magnet:")) {
      void useAppStore.getState().handleAddMagnet(text);
    }
  }, []);

  return (
    <div
      className={`torrent-list${dragOver ? " is-dragover" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {torrents.map((t) => (
        <TorrentRow key={t.torrentKey} torrent={t} />
      ))}

      <div className={`torrent-placeholder${dragOver ? " active" : ""}`}>
        <span className="ellipsis">
          {dragOver
            ? "Drop to add torrent or create from files"
            : "Drop a torrent file here or paste a magnet link"}
        </span>
      </div>

      <div className="page-shell list-actions">
        <div className="field magnet-field">
          <label htmlFor="magnet-input">Magnet link or torrent path</label>
          <div className="magnet-row">
            <input
              id="magnet-input"
              type="text"
              value={magnetInput}
              placeholder="magnet:?xt=urn:btih:…"
              onChange={(e) => setMagnetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddMagnet();
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text.trim().startsWith("magnet:")) {
                  // Allow paste then auto-add on next tick
                  window.setTimeout(() => {
                    void useAppStore.getState().handleAddMagnet(text.trim());
                  }, 0);
                }
              }}
            />
            <button
              type="button"
              className="btn primary"
              onClick={() => void handleAddMagnet()}
            >
              Add
            </button>
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => void handleOpenTorrent()}
          >
            Open torrent
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void handleOpenFiles()}
          >
            Create torrent…
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => navigate("preferences")}
          >
            Preferences
          </button>
        </div>

        {usingMockTorrents && (
          <p className="hint-muted">
            Showing sample torrents — engine commands will replace this list
            when W2 is ready.
          </p>
        )}
      </div>
    </div>
  );
}
