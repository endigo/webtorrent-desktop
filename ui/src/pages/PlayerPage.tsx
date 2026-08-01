import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Slider,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconVolume,
} from "@tabler/icons-react";
import { streamStart, streamStop } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

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
  const setTorrentPoster = useAppStore((s) => s.setTorrentPoster);

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

      const url = `${extracted.base.replace(/\/$/, "")}/${extracted.fileIndex}`;
      setStreamUrl(url);
      setStatus(
        extracted.fileName
          ? `Streaming ${extracted.fileName}`
          : "Streaming while downloading",
      );
    }

    void start();

    return () => {
      cancelled = true;
      void streamStop();
    };
  }, [torrent?.infoHash, torrent?.torrentKey, torrent?.mock]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    video.volume = volume;
    const id = window.setTimeout(() => {
      void video
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }, 50);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || !torrent) return;
    if (torrent.posterUrl) return;

    let captured = false;
    const capture = () => {
      if (captured) return;
      if (video.videoWidth < 16 || video.videoHeight < 16) return;
      try {
        const maxW = 640;
        const scale = Math.min(1, maxW / video.videoWidth);
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        if (dataUrl.length < 100) return;
        captured = true;
        setTorrentPoster(
          { infoHash: torrent.infoHash, torrentKey: torrent.torrentKey },
          dataUrl,
        );
      } catch (err) {
        console.warn("poster capture failed", err);
      }
    };

    const onSeeked = () => {
      capture();
      video.removeEventListener("seeked", onSeeked);
    };

    const onReady = () => {
      try {
        const t = Math.min(Math.max((video.duration || 60) * 0.03, 1), 30);
        if (Number.isFinite(t) && t > 0) {
          video.addEventListener("seeked", onSeeked);
          video.currentTime = t;
        } else {
          capture();
        }
      } catch {
        capture();
      }
    };

    video.addEventListener("loadeddata", onReady, { once: true });
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [
    streamUrl,
    torrent?.infoHash,
    torrent?.torrentKey,
    torrent?.posterUrl,
    setTorrentPoster,
  ]);

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

  const scrubPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Box className="player-root">
      <Box className="player-stage">
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
                    ? "Network error loading stream"
                    : "Playback error — wait for more data or try again";
              setStatus(msg);
              setPlaying(false);
            }}
            onClick={togglePlay}
          />
        ) : (
          <Stack align="center" gap="sm" p="xl">
            <Text size="lg" c="gray.3">
              {torrent?.name ?? "No media selected"}
            </Text>
            <Text size="sm" c="dimmed">
              {status || "Player"}
            </Text>
            <Button
              variant="light"
              mt="sm"
              onClick={() => navigate("torrent-list")}
            >
              Back to list
            </Button>
          </Stack>
        )}
      </Box>

      <Box
        px="md"
        py="sm"
        style={{
          flexShrink: 0,
          background: "rgba(26, 27, 30, 0.95)",
          borderTop: "1px solid var(--mantine-color-dark-5)",
        }}
      >
        <Slider
          value={scrubPct}
          onChange={(v) => {
            const video = videoRef.current;
            if (!video || !duration) return;
            const next = (v / 100) * duration;
            video.currentTime = next;
            setCurrentTime(next);
          }}
          min={0}
          max={100}
          step={0.1}
          disabled={!streamUrl || !duration}
          size="xs"
          color="gray.2"
          mb="sm"
          label={null}
        />

        <Box
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            minHeight: 36,
          }}
        >
          <Group gap="xs" wrap="nowrap" justify="flex-start">
            <Tooltip label={playing ? "Pause" : "Play"}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                disabled={!streamUrl}
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <IconPlayerPause size={22} />
                ) : (
                  <IconPlayerPlay size={22} />
                )}
              </ActionIcon>
            </Tooltip>
            <IconVolume size={18} style={{ opacity: 0.7 }} />
            <Slider
              value={volume * 100}
              onChange={(v) => {
                const next = v / 100;
                setVolume(next);
                if (videoRef.current) videoRef.current.volume = next;
              }}
              min={0}
              max={100}
              w={80}
              size="xs"
              color="gray.2"
              disabled={!streamUrl}
              label={null}
            />
          </Group>

          <Text size="sm" c="dimmed" ff="monospace" style={{ whiteSpace: "nowrap" }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>

          <Group gap="sm" wrap="nowrap" justify="flex-end">
            {status ? (
              <Text size="xs" c="dimmed" lineClamp={1} maw={160} title={status}>
                {status}
              </Text>
            ) : null}
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => navigate("torrent-list")}
            >
              Back
            </Button>
          </Group>
        </Box>
      </Box>
    </Box>
  );
}
