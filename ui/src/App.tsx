import { useEffect } from "react";
import { Header } from "./components/Header";
import { CreateTorrentPage } from "./pages/CreateTorrentPage";
import { PlayerPage } from "./pages/PlayerPage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { TorrentListPage } from "./pages/TorrentListPage";
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

export default function App() {
  const view = useAppStore((s) => s.view);

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
