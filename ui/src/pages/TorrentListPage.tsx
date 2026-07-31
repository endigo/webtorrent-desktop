import { useAppStore } from "../store/useAppStore";
import type { TorrentSummary } from "../types/torrent";

function formatBytes(n: number): string {
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
          {prog && (torrent.status === "paused" || torrent.status === "done") && (
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
            removeTorrent(torrent.infoHash);
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
  const handleOpenTorrent = useAppStore((s) => s.handleOpenTorrent);
  const handleOpenFiles = useAppStore((s) => s.handleOpenFiles);
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div className="torrent-list" onContextMenu={(e) => e.preventDefault()}>
      {torrents.map((t) => (
        <TorrentRow key={t.torrentKey} torrent={t} />
      ))}
      <div className="torrent-placeholder">
        <span className="ellipsis">
          Drop a torrent file here or paste a magnet link
        </span>
      </div>
      <div className="page-shell" style={{ maxWidth: "none", paddingTop: 8 }}>
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
      </div>
    </div>
  );
}
