import { useAppStore } from "../store/useAppStore";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  );
}

export function PlayerPage() {
  const torrents = useAppStore((s) => s.torrents);
  const selectedInfoHash = useAppStore((s) => s.selectedInfoHash);
  const navigate = useAppStore((s) => s.navigate);

  const torrent =
    torrents.find((t) => t.infoHash === selectedInfoHash) ?? torrents[0];

  return (
    <div className="player">
      <div className="player-stage">
        <div className="placeholder">
          <h2>{torrent?.name ?? "No media selected"}</h2>
          <p>Player shell — stream URL will wire up in M4</p>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 12 }}
            onClick={() => navigate("torrent-list")}
          >
            Back to list
          </button>
        </div>
      </div>
      <div className="player-controls">
        <div className="scrubber" aria-hidden="true">
          <i style={{ width: "18%" }} />
        </div>
        <div className="control-row">
          <button type="button" title="Play" aria-label="Play">
            <PlayIcon />
          </button>
          <button type="button" title="Pause" aria-label="Pause">
            <PauseIcon />
          </button>
          <button type="button" title="Volume" aria-label="Volume">
            <VolumeIcon />
          </button>
          <span className="time">0:42 / 10:34</span>
        </div>
      </div>
    </div>
  );
}
