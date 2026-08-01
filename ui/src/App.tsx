import { useEffect } from "react";
import { Box, useMantineColorScheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Header } from "./components/Header";
import { CreateTorrentPage } from "./pages/CreateTorrentPage";
import { PlayerPage } from "./pages/PlayerPage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { TorrentListPage } from "./pages/TorrentListPage";
import {
  onAppReady,
  onDispatch,
  onEngineReady,
  onFileDrop,
  onTorrentDone,
  onTorrentError,
  onTorrentMetadata,
  onTorrentParsed,
  onTorrentPoster,
  onTorrentProgress,
  onTorrentReady,
  setWindowTitle,
} from "./lib/tauri";
import { useAppStore } from "./store/useAppStore";
import { isColorSchemePref } from "./types/prefs";

function ViewRouter() {
  const view = useAppStore((s) => s.view);

  switch (view) {
    case "torrent-list":
      return <TorrentListPage />;
    case "player":
      return <PlayerPage />;
    case "create-torrent":
      return <CreateTorrentPage />;
    case "preferences":
      return <PreferencesPage />;
  }
}

/** Tracker/DNS noise that should not become toasts. */
function isNoisyTorrentMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("enotfound") ||
    m.includes("getaddrinfo") ||
    m.includes("eai_again") ||
    m.includes("etimedout") ||
    m.includes("econnrefused") ||
    m.includes("unsupported tracker") ||
    m.includes("no nodes to query") ||
    m.includes("tracker") && (m.includes("announce") || m.includes("udp://") || m.includes("wss://"))
  );
}

function useStatusNotifications() {
  const statusMessage = useAppStore((s) => s.statusMessage);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  useEffect(() => {
    if (!statusMessage) return;
    // Consume the message either way so it does not re-fire
    const msg = statusMessage;
    setStatusMessage(null);
    if (isNoisyTorrentMessage(msg)) return;
    // Skip low-value lifecycle chatter
    if (
      msg === "Shell ready" ||
      msg === "Engine ready" ||
      msg.startsWith("Metadata:")
    ) {
      return;
    }
    // Stable id for identical messages so rapid repeats update one toast
    // instead of stacking five "Preferences saved" cards.
    notifications.show({
      id: `status:${msg.slice(0, 80)}`,
      message: msg,
      color: "dark",
      autoClose: 3500,
    });
  }, [statusMessage, setStatusMessage]);
}

function classifyDroppedPaths(paths: string[]): {
  torrents: string[];
  seeds: string[];
} {
  const torrents: string[] = [];
  const seeds: string[] = [];
  for (const p of paths) {
    const lower = p.toLowerCase();
    if (lower.endsWith(".torrent") || lower.startsWith("magnet:")) {
      torrents.push(p);
    } else {
      seeds.push(p);
    }
  }
  return { torrents, seeds };
}

/** Boot: prefs + engine list + shell/engine event subscriptions. */
function useShellBridge() {
  const loadPrefs = useAppStore((s) => s.loadPrefs);
  const refreshTorrents = useAppStore((s) => s.refreshTorrents);
  const probeEngine = useAppStore((s) => s.probeEngine);
  const handleDispatch = useAppStore((s) => s.handleDispatch);
  const applyProgressEvent = useAppStore((s) => s.applyProgressEvent);
  const setTorrentPoster = useAppStore((s) => s.setTorrentPoster);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const handleAddMagnet = useAppStore((s) => s.handleAddMagnet);
  const setCreateTorrentPaths = useAppStore((s) => s.setCreateTorrentPaths);
  const navigate = useAppStore((s) => s.navigate);
  const windowTitle = useAppStore((s) => s.windowTitle);

  useEffect(() => {
    void loadPrefs();
    void refreshTorrents();
    void probeEngine();

    let unsubs: Array<() => void> = [];
    let cancelled = false;

    void (async () => {
      const offs = await Promise.all([
        onAppReady(() => {
          void loadPrefs();
          void refreshTorrents();
          void probeEngine();
          setStatusMessage("Shell ready");
        }),
        onEngineReady(() => {
          void probeEngine();
          setStatusMessage("Engine ready");
        }),
        onDispatch((action, args) => handleDispatch(action, args)),
        onFileDrop((paths) => {
          const { torrents, seeds } = classifyDroppedPaths(paths);
          for (const t of torrents) {
            void handleAddMagnet(t);
          }
          if (seeds.length > 0) {
            setCreateTorrentPaths(seeds);
            navigate("create-torrent");
            setStatusMessage(`Create torrent from ${seeds.length} path(s)`);
          }
        }),
        onTorrentProgress((payload) => applyProgressEvent(payload)),
        onTorrentPoster((payload) => {
          if (typeof payload.dataUrl !== "string" || !payload.dataUrl) return;
          const torrentKey =
            typeof payload.torrentKey === "number"
              ? payload.torrentKey
              : typeof payload.torrentKey === "string" &&
                  /^\d+$/.test(payload.torrentKey)
                ? Number(payload.torrentKey)
                : undefined;
          setTorrentPoster(
            {
              infoHash:
                typeof payload.infoHash === "string"
                  ? payload.infoHash
                  : undefined,
              torrentKey,
            },
            payload.dataUrl,
          );
        }),
        onTorrentParsed((payload) => {
          applyProgressEvent({
            torrentKey: payload.torrentKey,
            infoHash: payload.infoHash,
            magnetURI: payload.magnetURI,
            name:
              typeof payload.magnetURI === "string"
                ? undefined
                : payload.name,
          });
        }),
        onTorrentMetadata((payload) => {
          const info =
            payload.info && typeof payload.info === "object"
              ? (payload.info as Record<string, unknown>)
              : payload;
          applyProgressEvent({
            ...info,
            torrentKey: payload.torrentKey ?? info.torrentKey,
            magnetURI: info.magnetURI ?? payload.magnetURI,
            ready: false,
          });
          const name =
            typeof info.name === "string"
              ? info.name
              : typeof payload.name === "string"
                ? payload.name
                : null;
          if (name) setStatusMessage(`Metadata: ${name}`);
        }),
        onTorrentReady((payload) => {
          const info =
            payload.info && typeof payload.info === "object"
              ? (payload.info as Record<string, unknown>)
              : payload;
          applyProgressEvent({
            ...info,
            torrentKey: payload.torrentKey ?? info.torrentKey,
            magnetURI: info.magnetURI ?? payload.magnetURI,
            ready: true,
          });
        }),
        onTorrentDone((payload) => {
          const info =
            payload.info && typeof payload.info === "object"
              ? (payload.info as Record<string, unknown>)
              : payload;
          applyProgressEvent({
            ...info,
            torrentKey: payload.torrentKey ?? info.torrentKey,
            progress: 1,
            status: "done",
          });
          const name =
            typeof info.name === "string"
              ? info.name
              : typeof payload.name === "string"
                ? payload.name
                : "Torrent";
          setStatusMessage(`Finished: ${name}`);
        }),
        onTorrentError((payload) => {
          const msg =
            typeof payload.message === "string"
              ? payload.message
              : "Torrent error";
          const level =
            typeof payload.level === "string" ? payload.level : "error";
          // Tracker DNS / warning noise — log only, do not toast
          if (level === "warning" || isNoisyTorrentMessage(msg)) {
            console.debug("[torrent]", level, msg);
            return;
          }
          setStatusMessage(msg);
        }),
      ]);
      if (cancelled) {
        offs.forEach((off) => off());
        return;
      }
      unsubs = offs;
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void setWindowTitle(windowTitle);
  }, [windowTitle]);
}

/** Apply saved appearance pref to Mantine once prefs load / change. */
function useColorSchemeSync() {
  const prefsLoaded = useAppStore((s) => s.prefsLoaded);
  const colorScheme = useAppStore((s) => s.prefs.colorScheme);
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (!prefsLoaded) return;
    if (!isColorSchemePref(colorScheme)) return;
    setColorScheme(colorScheme);
  }, [prefsLoaded, colorScheme, setColorScheme]);
}

function useKeyboardShortcuts() {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const view = useAppStore((s) => s.view);
  const handleOpenTorrent = useAppStore((s) => s.handleOpenTorrent);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape" && view !== "torrent-list" && !typing) {
        e.preventDefault();
        back();
        return;
      }
      if (meta && e.key === ",") {
        e.preventDefault();
        navigate("preferences");
        return;
      }
      if (meta && e.key.toLowerCase() === "o" && !e.shiftKey) {
        e.preventDefault();
        void handleOpenTorrent();
        return;
      }
      if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("create-torrent");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, navigate, view, handleOpenTorrent]);
}

export default function App() {
  const view = useAppStore((s) => s.view);
  useShellBridge();
  useColorSchemeSync();
  useKeyboardShortcuts();
  useStatusNotifications();

  return (
    <Box className={`app-shell view-${view}`}>
      <Header />
      <Box
        className="app-content"
        component="main"
        pt={view === "player" ? 0 : 0}
        style={{
          // Header is in-flow except player overlay
          marginTop: view === "player" ? 0 : 0,
        }}
      >
        <ViewRouter />
      </Box>
    </Box>
  );
}
