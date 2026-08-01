import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import { useAppStore } from "../store/useAppStore";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.platform);

export function Header() {
  const view = useAppStore((s) => s.view);
  const windowTitle = useAppStore((s) => s.windowTitle);
  const historyIndex = useAppStore((s) => s.historyIndex);
  const historyLength = useAppStore((s) => s.history.length);
  const back = useAppStore((s) => s.back);
  const forward = useAppStore((s) => s.forward);
  const handleOpenTorrent = useAppStore((s) => s.handleOpenTorrent);
  const navigate = useAppStore((s) => s.navigate);

  const showAdd = view === "torrent-list";
  const canBack = historyIndex > 0;
  const canForward = historyIndex < historyLength - 1;
  const isPlayer = view === "player";

  return (
    <Group
      className="app-header"
      h={38}
      px="sm"
      justify="space-between"
      wrap="nowrap"
      data-tauri-drag-region
      style={{
        flexShrink: 0,
        borderBottom: isPlayer ? "none" : "1px solid var(--mantine-color-dark-5)",
        background: isPlayer
          ? "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)"
          : "var(--mantine-color-dark-7)",
        position: isPlayer ? "absolute" : "relative",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        // Electron used hiddenInset + 78px left nav inset for traffic lights.
        ...(isMac ? { paddingLeft: 78 } : null),
      }}
    >
      <Group gap={4} wrap="nowrap" data-no-drag>
        <Tooltip label="Back">
          <ActionIcon
            variant="subtle"
            color="gray"
            disabled={!canBack}
            onClick={back}
            aria-label="Back"
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Forward">
          <ActionIcon
            variant="subtle"
            color="gray"
            disabled={!canForward}
            onClick={forward}
            aria-label="Forward"
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Text
        size="sm"
        fw={600}
        truncate
        style={{ flex: 1, textAlign: "center", pointerEvents: "none" }}
      >
        {windowTitle}
      </Text>

      <Group gap={4} wrap="nowrap" data-no-drag>
        {showAdd && (
          <Tooltip label="Add torrent">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => void handleOpenTorrent()}
              aria-label="Add torrent"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Preferences">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => navigate("preferences")}
            aria-label="Preferences"
          >
            <IconSettings size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
