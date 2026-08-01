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

/** Normalize stream_start payload into a playable base URL + file index. */
function extractStream(
  value:
    | {
        url?: string;
        localURL?: string;
        localUrl?: string;
        fileIndex?: number;
        fileName?: string;
      }
    | string
    | null
    | undefined,
): { base: string; fileIndex: number; fileName?: string } | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return value ? { base: value, fileIndex: 0 } : null;
  }
  const base = value.localURL ?? value.localUrl ?? value.url ?? null;
  if (!base) return null;
  const fileIndex =
    typeof value.fileIndex === "number" && value.fileIndex >= 0
      ? value.fileIndex
      : 0;
  return { base, fileIndex, fileName: value.fileName };
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
  // Works while still downloading — WebTorrent serve range-requests.
  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!torrent || torrent.mock) {
        setStreamUrl(null);
        setStatus(
          torrent?.mock
            ? "Mock torrent — add a real magnet/.torrent to stream"
            : "No media selected",
        );
        return;
      }

      // Prefer torrentKey; infoHash may still be pending-* before metadata
      const canResolve =
        torrent.torrentKey != null ||
        (torrent.infoHash && !torrent.infoHash.startsWith("pending-"));
      if (!canResolve) {
        setStreamUrl(null);
        setStatus("Waiting for torrent metadata…");
        return;
      }

      setStatus("Starting stream…");
      setStreamUrl(null);
      setCurrentTime(0);
      setDuration(0);
      setPlaying(false);

      const result = await streamStart(
        torrent.infoHash?.startsWith("pending-")
          ? ""
          : torrent.infoHash || "",
        torrent.torrentKey,
      );
      if (cancelled) return;

      if (!result.ok) {
        setStreamUrl(null);
        setStatus(result.message || "stream_start unavailable");
        return;
      }

      const extracted = extractStream(
        result.value as {
          localURL?: string;
          fileIndex?: number;
          fileName?: string;
        },
      );
      if (!extracted) {
        setStreamUrl(null);
        setStatus("stream_start returned no URL");
        return;
      }

      // WebTorrent createServer serves file index N at /N — stream while downloading
      const url = `${extracted.base.replace(/\/$/, "")}/${extracted.fileIndex}`;
      setStreamUrl(url);
      setStatus(
        extracted.fileName
          ? `Streaming ${extracted.fileName} (while downloading)`
          : "Streaming while downloading",
      );
    }

    void start();

    return () => {
      cancelled = true;
      void streamStop();
    };
  }, [torrent?.infoHash, torrent?.torrentKey, torrent?.mock]);

  // Autoplay when the stream URL is ready (user already clicked Play on the list)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    video.volume = volume;
    const tryPlay = () => {
      void video
        .play()
        .then(() => setPlaying(true))
        .catch((err) => {
          setPlaying(false);
          // Autoplay blocked or media not ready yet — user can press play
          console.warn("autoplay failed", err);
        });
    };
    // Small delay so the element mounts with src
    const id = window.setTimeout(tryPlay, 50);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-autoplay when URL changes
  }, [streamUrl]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    if (video.paused) {
      void video
        .play()
        .then(() => {
          setPlaying(true);
          setStatus("");
        })
        .catch((err) => {
          setPlaying(false);
          setStatus(
            err instanceof Error ? err.message : "Playback failed — try again",
          );
        });
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
            preload="auto"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onTimeUpdate}
            onCanPlay={() => {
              // Media has enough data to start — clear "starting" status
              setStatus((s) =>
                s.startsWith("Starting") || s.startsWith("Streaming")
                  ? ""
                  : s,
              );
            }}
            onWaiting={() => setStatus("Buffering…")}
            onPlaying={() => {
              setPlaying(true);
              setStatus("");
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => {
              const mediaError = videoRef.current?.error;
              const code = mediaError?.code;
              const msg =
                code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                  ? "Format not supported or stream not ready yet"
                  : code === MediaError.MEDIA_ERR_NETWORK
                    ? "Network error loading stream (is the engine running?)"
                    : "Playback error — wait for more data or try again";
              setStatus(msg);
              setPlaying(false);
            }}
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
