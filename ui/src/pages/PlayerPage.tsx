import { useCallback, useEffect, useRef, useState } from "react";
import { streamStart, streamStop } from "../lib/tauri";
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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Normalize stream_start payload into a playable base URL. */
function extractStreamBase(
  value: { url?: string; localURL?: string; localUrl?: string } | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  return value.localURL ?? value.localUrl ?? value.url ?? null;
}

export function PlayerPage() {
  const torrents = useAppStore((s) => s.torrents);
  const selectedInfoHash = useAppStore((s) => s.selectedInfoHash);
  const navigate = useAppStore((s) => s.navigate);

  const torrent =
    torrents.find((t) => t.infoHash === selectedInfoHash) ??
    torrents.find((t) => !t.mock) ??
    torrents[0];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Start HTTP stream when a real (non-mock) torrent is selected.
  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!torrent || torrent.mock || !torrent.infoHash) {
        setStreamUrl(null);
        setStatus(
          torrent?.mock
            ? "Mock torrent — add a real magnet/.torrent to stream"
            : "No media selected",
        );
        return;
      }

      setStatus("Starting stream…");
      const result = await streamStart(torrent.infoHash, torrent.torrentKey);
      if (cancelled) return;

      if (!result.ok) {
        setStreamUrl(null);
        setStatus(result.message || "stream_start unavailable");
        return;
      }

      const base = extractStreamBase(result.value as { localURL?: string });
      if (!base) {
        setStreamUrl(null);
        setStatus("stream_start returned no URL");
        return;
      }

      // WebTorrent createServer serves file index N at /N
      const fileIndex = 0;
      const url = `${base.replace(/\/$/, "")}/${fileIndex}`;
      setStreamUrl(url);
      setStatus("");
    }

    void start();

    return () => {
      cancelled = true;
      void streamStop();
    };
  }, [torrent?.infoHash, torrent?.torrentKey, torrent?.mock]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
    }
  }, [streamUrl]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (Number.isFinite(video.duration)) setDuration(video.duration);
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const next = (Number(e.target.value) / 100) * duration;
    video.currentTime = next;
    setCurrentTime(next);
  };

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value) / 100;
    setVolume(next);
    if (videoRef.current) videoRef.current.volume = next;
  };

  const scrubPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="player">
      <div className="player-stage">
        {streamUrl ? (
          <video
            ref={videoRef}
            className="player-video"
            src={streamUrl}
            playsInline
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onClick={togglePlay}
          />
        ) : (
          <div className="placeholder">
            <h2>{torrent?.name ?? "No media selected"}</h2>
            <p>{status || "Player — stream URL wires via stream_start"}</p>
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 12 }}
              onClick={() => navigate("torrent-list")}
            >
              Back to list
            </button>
          </div>
        )}
      </div>
      <div className="player-controls">
        <div className="scrubber">
          <input
            type="range"
            className="scrubber-input"
            min={0}
            max={100}
            step={0.1}
            value={scrubPct}
            onChange={onSeek}
            disabled={!streamUrl || !duration}
            aria-label="Seek"
          />
        </div>
        <div className="control-row">
          <div className="control-left">
            <button
              type="button"
              className="icon-btn"
              title={playing ? "Pause" : "Play"}
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              disabled={!streamUrl}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Volume"
              aria-label="Volume"
              disabled={!streamUrl}
            >
              <VolumeIcon />
            </button>
            <input
              type="range"
              className="volume-slider"
              min={0}
              max={100}
              value={volume * 100}
              onChange={onVolume}
              disabled={!streamUrl}
              aria-label="Volume"
            />
          </div>

          <span className="time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="control-right">
            {status ? (
              <span className="stream-status" title={status}>
                {status}
              </span>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate("torrent-list")}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
