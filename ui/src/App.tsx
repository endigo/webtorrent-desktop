import { useEffect } from "react";
import { Header } from "./components/Header";
import { CreateTorrentPage } from "./pages/CreateTorrentPage";
import { PlayerPage } from "./pages/PlayerPage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { TorrentListPage } from "./pages/TorrentListPage";
import {
  onAppReady,
  onDispatch,
  onFileDrop,
  onTorrentDone,
  onTorrentMetadata,
  onTorrentProgress,
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
  const handleDispatch = useAppStore((s) => s.handleDispatch);
  const applyProgressEvent = useAppStore((s) => s.applyProgressEvent);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const handleAddMagnet = useAppStore((s) => s.handleAddMagnet);
  const setCreateTorrentPaths = useAppStore((s) => s.setCreateTorrentPaths);
  const navigate = useAppStore((s) => s.navigate);
  const windowTitle = useAppStore((s) => s.windowTitle);

  useEffect(() => {
    void loadPrefs();
    void refreshTorrents();

    let unsubs: Array<() => void> = [];
    let cancelled = false;

    void (async () => {
      const offs = await Promise.all([
        onAppReady(() => {
          void loadPrefs();
          void refreshTorrents();
          setStatusMessage("Shell ready");
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
        onTorrentMetadata((payload) => {
          applyProgressEvent(payload);
          if (typeof payload.name === "string") {
            setStatusMessage(`Metadata: ${payload.name}`);
          }
        }),
        onTorrentDone((payload) => {
          applyProgressEvent({ ...payload, progress: 1, status: "done" });
          const name =
            typeof payload.name === "string" ? payload.name : "Torrent";
          setStatusMessage(`Finished: ${name}`);
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

export default function App() {
  const view = useAppStore((s) => s.view);
  useShellBridge();

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
