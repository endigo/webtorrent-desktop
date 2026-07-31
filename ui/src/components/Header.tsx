import { useAppStore } from "../store/useAppStore";

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.5.39 1.04.71 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.23 1.13-.55 1.63-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
    </svg>
  );
}

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

  return (
    <header className="header" role="navigation">
      <div className="title ellipsis">{windowTitle}</div>
      <div className="nav left">
        <button
          type="button"
          className="nav-btn back"
          title="Back"
          aria-label="Back"
          disabled={!canBack}
          onClick={back}
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="nav-btn forward"
          title="Forward"
          aria-label="Forward"
          disabled={!canForward}
          onClick={forward}
        >
          <ChevronRight />
        </button>
      </div>
      <div className="nav right">
        {showAdd && (
          <button
            type="button"
            className="nav-btn add"
            title="Add torrent"
            aria-label="Add torrent"
            onClick={() => void handleOpenTorrent()}
          >
            <AddIcon />
          </button>
        )}
        <button
          type="button"
          className="nav-btn"
          title="Preferences"
          aria-label="Preferences"
          onClick={() => navigate("preferences")}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
