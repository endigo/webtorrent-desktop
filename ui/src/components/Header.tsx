import {
  ActionIcon,
  Box,
  Group,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { useAppStore } from "../store/useAppStore";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

/** Space reserved for macOS traffic lights under Overlay title bar */
const MAC_TRAFFIC_LIGHTS_WIDTH = 78;

export function Header() {
  const view = useAppStore((s) => s.view);
  const windowTitle = useAppStore((s) => s.windowTitle);
  const historyIndex = useAppStore((s) => s.historyIndex);
  const historyLength = useAppStore((s) => s.history.length);
  const back = useAppStore((s) => s.back);
  const forward = useAppStore((s) => s.forward);
  const handleOpenTorrent = useAppStore((s) => s.handleOpenTorrent);
  const navigate = useAppStore((s) => s.navigate);
  const savePrefs = useAppStore((s) => s.savePrefs);

  const { setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme("dark");

  const showAdd = view === "torrent-list";
  const canBack = historyIndex > 0;
  const canForward = historyIndex < historyLength - 1;
  const isPlayer = view === "player";
  const isDark = computedScheme === "dark";

  const toggleColorScheme = () => {
    const next = isDark ? "light" : "dark";
    setColorScheme(next);
    // Silent: theme toggles should not stack "Preferences saved" toasts
    void savePrefs({ colorScheme: next }, { silent: true });
  };

  return (
    <Group
      className={`app-header${isPlayer ? " is-player" : ""}`}
      h={38}
      pl={isMac ? 0 : "sm"}
      pr="sm"
      justify="space-between"
      wrap="nowrap"
      gap={0}
      data-tauri-drag-region
      style={{
        flexShrink: 0,
        position: isPlayer ? "absolute" : "relative",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
      }}
    >
      {/* Fixed gutter so nav never sits under red/yellow/green lights */}
      {isMac && (
        <Box
          w={MAC_TRAFFIC_LIGHTS_WIDTH}
          h="100%"
          style={{ flexShrink: 0 }}
          aria-hidden
        />
      )}

      <Group gap={4} wrap="nowrap" data-no-drag style={{ flexShrink: 0 }}>
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
        c={isPlayer ? "white" : undefined}
        style={{ flex: 1, textAlign: "center", pointerEvents: "none", minWidth: 0 }}
      >
        {windowTitle}
      </Text>

      <Group gap={4} wrap="nowrap" data-no-drag style={{ flexShrink: 0 }}>
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
        <Tooltip label={isDark ? "Light mode" : "Dark mode"}>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={toggleColorScheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Tooltip>
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
