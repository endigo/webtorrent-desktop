import { useEffect } from "react";
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
import "./styles/global.css";

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

function StatusBar() {
  const statusMessage = useAppStore((s) => s.statusMessage);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  useEffect(() => {
    if (!statusMessage) return;
    const id = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(id);
  }, [statusMessage, setStatusMessage]);

  if (!statusMessage) return null;
  return (
    <div className="status-bar" role="status">
      {statusMessage}
    </div>
  );
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
          // Early: { torrentKey, infoHash, magnetURI }
          applyProgressEvent({
            torrentKey: payload.torrentKey,
            infoHash: payload.infoHash,
            name:
              typeof payload.magnetURI === "string"
                ? undefined
                : payload.name,
          });
        }),
        onTorrentMetadata((payload) => {
          // Engine: { torrentKey, info: { name, infoHash, ... } }
          const info =
            payload.info && typeof payload.info === "object"
              ? (payload.info as Record<string, unknown>)
              : payload;
          applyProgressEvent({
            ...info,
            torrentKey: payload.torrentKey ?? info.torrentKey,
            // Keep progress fields if this event has none
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
    // Store actions are stable zustand refs; mount-once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep native window title in sync with chrome title.
  useEffect(() => {
    void setWindowTitle(windowTitle);
  }, [windowTitle]);
}

/** Global keyboard shortcuts (Electron chrome parity lite). */
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
  useKeyboardShortcuts();

  return (
    <div className={`app is-focused view-${view}`}>
      <Header />
      <main className="content">
        <ViewRouter />
      </main>
      <StatusBar />
    </div>
  );
}
