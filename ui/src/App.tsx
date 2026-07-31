import { useEffect } from "react";
import { Header } from "./components/Header";
import { CreateTorrentPage } from "./pages/CreateTorrentPage";
import { PlayerPage } from "./pages/PlayerPage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { TorrentListPage } from "./pages/TorrentListPage";
import {
  onDispatch,
  onTorrentDone,
  onTorrentMetadata,
  onTorrentProgress,
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

/** Boot: prefs + engine list + shell/engine event subscriptions. */
function useShellBridge() {
  const loadPrefs = useAppStore((s) => s.loadPrefs);
  const refreshTorrents = useAppStore((s) => s.refreshTorrents);
  const handleDispatch = useAppStore((s) => s.handleDispatch);
  const applyProgressEvent = useAppStore((s) => s.applyProgressEvent);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  useEffect(() => {
    void loadPrefs();
    void refreshTorrents();

    let unsubs: Array<() => void> = [];
    let cancelled = false;

    void (async () => {
      const offs = await Promise.all([
        onDispatch((action, args) => handleDispatch(action, args)),
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
