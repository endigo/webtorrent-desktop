import { useCallback, useState, type CSSProperties } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Progress,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPlayerPlay, IconTrash } from "@tabler/icons-react";
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

function metaParts(torrent: TorrentSummary): string[] {
  const prog = torrent.progress;
  const pct = prog ? Math.floor(prog.progress * 100) : 0;
  const parts = [statusLabel(torrent)];
  if (!prog) return parts;

  if (torrent.status === "downloading") {
    parts.push(`${pct}%`);
    parts.push(`${formatBytes(prog.downloaded)} / ${formatBytes(prog.length)}`);
    parts.push(`${prog.numPeers} peers`);
    parts.push(`↓ ${formatSpeed(prog.downloadSpeed)}`);
    parts.push(`↑ ${formatSpeed(prog.uploadSpeed)}`);
  } else if (torrent.status === "seeding") {
    parts.push(formatBytes(prog.length));
    parts.push(`${prog.numPeers} peers`);
    parts.push(`↑ ${formatSpeed(prog.uploadSpeed)}`);
  } else if (
    torrent.status === "paused" ||
    torrent.status === "done" ||
    torrent.status === "queued"
  ) {
    parts.push(`${pct}% · ${formatBytes(prog.length)}`);
  }
  return parts;
}

function TorrentRow({ torrent }: { torrent: TorrentSummary }) {
  const selectedInfoHash = useAppStore((s) => s.selectedInfoHash);
  const selectTorrent = useAppStore((s) => s.selectTorrent);
  const playTorrent = useAppStore((s) => s.playTorrent);
  const removeTorrent = useAppStore((s) => s.removeTorrent);

  const selected = selectedInfoHash === torrent.infoHash;
  const prog = torrent.progress;
  const pct = prog ? Math.floor(prog.progress * 100) : 0;

  const rowStyle: CSSProperties = torrent.posterUrl
    ? {
        backgroundImage: [
          "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.6) 100%)",
          `url(${JSON.stringify(torrent.posterUrl)})`,
        ].join(", "),
      }
    : {
        background:
          torrent.gradient ||
          "linear-gradient(to bottom right, #4b79a1, #283e51)",
      };

  return (
    <Box
      id={torrent.testID ? `torrent-${torrent.testID}` : undefined}
      className={`torrent-row-poster${selected ? " selected" : ""}`}
      style={{
        ...rowStyle,
        height: 100,
        position: "relative",
        borderBottom: "1px solid var(--mantine-color-dark-7)",
        outline: selected ? "1px solid rgba(255,255,255,0.15)" : undefined,
        cursor: "default",
      }}
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
      <Stack
        gap={6}
        justify="center"
        style={{
          position: "absolute",
          inset: "16px 100px 16px 16px",
          textShadow: "0 0 4px rgba(0,0,0,0.6)",
        }}
      >
        <Text fw={700} size="lg" c="white" lineClamp={1}>
          {torrent.name}
        </Text>
        <Group gap="xs" wrap="nowrap" align="center">
          {prog && torrent.status === "downloading" && (
            <Progress
              value={pct}
              size={6}
              w={80}
              color="gray.0"
              bg="rgba(0,0,0,0.35)"
              style={{ flexShrink: 0 }}
            />
          )}
          <Text size="sm" c="gray.2" lineClamp={1} style={{ flex: 1 }}>
            {metaParts(torrent).join(" · ")}
          </Text>
        </Group>
      </Stack>

      <Group
        gap={4}
        style={{
          position: "absolute",
          top: "50%",
          right: 12,
          transform: "translateY(-50%)",
          opacity: 0,
          transition: "opacity 0.12s ease",
        }}
        className="torrent-actions"
      >
        <Tooltip label="Play">
          <ActionIcon
            variant="transparent"
            color="gray.0"
            size="lg"
            aria-label={`Play ${torrent.name}`}
            onClick={(e) => {
              e.stopPropagation();
              playTorrent(torrent.infoHash);
            }}
          >
            <IconPlayerPlay size={28} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Remove">
          <ActionIcon
            variant="transparent"
            color="gray.0"
            size="lg"
            aria-label={`Remove ${torrent.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void removeTorrent(torrent.infoHash);
            }}
          >
            <IconTrash size={22} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <style>{`
        .torrent-row-poster:hover .torrent-actions { opacity: 1 !important; }
      `}</style>
    </Box>
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
    const text = e.dataTransfer.getData("text/plain")?.trim();
    if (text?.startsWith("magnet:")) {
      void useAppStore.getState().handleAddMagnet(text);
    }
  }, []);

  return (
    <Box
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ minHeight: "100%" }}
    >
      {torrents.map((t) => (
        <TorrentRow key={t.torrentKey} torrent={t} />
      ))}

      <Box p={10} h={100}>
        <Box
          h="100%"
          style={{
            border: `5px dashed ${dragOver ? "var(--mantine-color-wtBlue-5)" : "#444"}`,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: dragOver ? "var(--mantine-color-wtBlue-2)" : "#666",
            background: dragOver
              ? "rgba(75, 121, 161, 0.12)"
              : "transparent",
            transition: "border-color 0.15s, color 0.15s, background 0.15s",
          }}
        >
          <Text size="md" c="inherit">
            {dragOver
              ? "Drop to add torrent or create from files"
              : "Drop a torrent file here or paste a magnet link"}
          </Text>
        </Box>
      </Box>

      <Stack p="md" maw={720} gap="md">
        <TextInput
          label="Magnet link or torrent path"
          placeholder="magnet:?xt=urn:btih:…"
          value={magnetInput}
          onChange={(e) => setMagnetInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAddMagnet();
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.trim().startsWith("magnet:")) {
              window.setTimeout(() => {
                void useAppStore.getState().handleAddMagnet(text.trim());
              }, 0);
            }
          }}
          rightSectionWidth={72}
          rightSection={
            <Button size="compact-sm" onClick={() => void handleAddMagnet()}>
              Add
            </Button>
          }
        />

        <Group gap="sm">
          <Button onClick={() => void handleOpenTorrent()}>Open torrent</Button>
          <Button variant="default" onClick={() => void handleOpenFiles()}>
            Create torrent…
          </Button>
          <Button variant="subtle" onClick={() => navigate("preferences")}>
            Preferences
          </Button>
        </Group>

        {usingMockTorrents && (
          <Text size="sm" c="dimmed">
            Showing sample torrents — engine will replace this list when
            connected.
          </Text>
        )}
      </Stack>
    </Box>
  );
}
