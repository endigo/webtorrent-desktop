import { create } from "zustand";
import type { AppView, TorrentSummary } from "../types/torrent";
import { openFiles, openTorrent, type OpenResult } from "../lib/tauri";

const MOCK_TORRENTS: TorrentSummary[] = [
  {
    torrentKey: 1,
    infoHash: "dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c",
    name: "Big Buck Bunny",
    status: "seeding",
    progress: {
      progress: 1,
      downloadSpeed: 0,
      uploadSpeed: 42_000,
      numPeers: 3,
      downloaded: 276_134_144,
      uploaded: 12_582_912,
      length: 276_134_144,
    },
    gradient: "linear-gradient(to bottom right, #4B79A1, #283E51)",
    testID: "bbb",
  },
  {
    torrentKey: 2,
    infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10",
    name: "Sintel",
    status: "downloading",
    progress: {
      progress: 0.62,
      downloadSpeed: 1_250_000,
      uploadSpeed: 18_000,
      numPeers: 12,
      downloaded: 80_000_000,
      uploaded: 2_000_000,
      length: 129_241_752,
    },
    gradient: "linear-gradient(to bottom right, #141E30, #243B55)",
    testID: "sintel",
  },
  {
    torrentKey: 3,
    infoHash: "c9e15763f722f23e98a29decdfae341b98d53056",
    name: "Cosmos Laundromat",
    status: "paused",
    progress: {
      progress: 0.15,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
      downloaded: 32_000_000,
      uploaded: 0,
      length: 217_000_000,
    },
    gradient: "linear-gradient(to bottom right, #3a1c71, #d76d77)",
    testID: "cosmos",
  },
  {
    torrentKey: 4,
    infoHash: "209c8226b299b308beaf2b9cd3fb49212dbd13ec",
    name: "Tears of Steel",
    status: "done",
    progress: {
      progress: 1,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
      downloaded: 571_346_576,
      uploaded: 0,
      length: 571_346_576,
    },
    gradient: "linear-gradient(to bottom right, #0f2027, #203a43)",
    testID: "tears",
  },
];

interface AppState {
  view: AppView;
  history: AppView[];
  historyIndex: number;
  windowTitle: string;
  torrents: TorrentSummary[];
  selectedInfoHash: string | null;
  statusMessage: string | null;
  createTorrentPaths: string[];

  navigate: (view: AppView) => void;
  back: () => void;
  forward: () => void;
  selectTorrent: (infoHash: string | null) => void;
  setStatusMessage: (message: string | null) => void;
  handleOpenTorrent: () => Promise<void>;
  handleOpenFiles: () => Promise<void>;
  playTorrent: (infoHash: string) => void;
  removeTorrent: (infoHash: string) => void;
}

function formatOpenResult(label: string, result: OpenResult): string {
  if (result.ok) {
    return `${label}: ${result.paths.join(", ")}`;
  }
  if (result.reason === "unavailable") {
    return `${label}: ${result.message} (using mock UI)`;
  }
  if (result.reason === "cancelled") {
    return `${label}: cancelled`;
  }
  return `${label}: ${result.message}`;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "torrent-list",
  history: ["torrent-list"],
  historyIndex: 0,
  windowTitle: "WebTorrent",
  torrents: MOCK_TORRENTS,
  selectedInfoHash: null,
  statusMessage: null,
  createTorrentPaths: [],

  navigate: (view) => {
    const { history, historyIndex } = get();
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(view);
    set({
      view,
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
      windowTitle: titleForView(view),
    });
  },

  back: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const next = historyIndex - 1;
    set({
      historyIndex: next,
      view: history[next],
      windowTitle: titleForView(history[next]),
    });
  },

  forward: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const next = historyIndex + 1;
    set({
      historyIndex: next,
      view: history[next],
      windowTitle: titleForView(history[next]),
    });
  },

  selectTorrent: (infoHash) => {
    const current = get().selectedInfoHash;
    set({ selectedInfoHash: current === infoHash ? null : infoHash });
  },

  setStatusMessage: (message) => set({ statusMessage: message }),

  handleOpenTorrent: async () => {
    const result = await openTorrent();
    set({ statusMessage: formatOpenResult("Open torrent", result) });
  },

  handleOpenFiles: async () => {
    const result = await openFiles();
    if (result.ok) {
      set({
        createTorrentPaths: result.paths,
        statusMessage: formatOpenResult("Open files", result),
      });
      get().navigate("create-torrent");
      return;
    }
    // Graceful fallback: still open create-torrent shell with mock paths
    if (result.reason === "unavailable") {
      set({
        createTorrentPaths: ["/mock/path/movie.mp4"],
        statusMessage: formatOpenResult("Open files", result),
      });
      get().navigate("create-torrent");
      return;
    }
    set({ statusMessage: formatOpenResult("Open files", result) });
  },

  playTorrent: (infoHash) => {
    set({ selectedInfoHash: infoHash });
    get().navigate("player");
  },

  removeTorrent: (infoHash) => {
    set((state) => ({
      torrents: state.torrents.filter((t) => t.infoHash !== infoHash),
      selectedInfoHash:
        state.selectedInfoHash === infoHash ? null : state.selectedInfoHash,
      statusMessage: `Removed torrent ${infoHash.slice(0, 8)}…`,
    }));
  },
}));

function titleForView(view: AppView): string {
  switch (view) {
    case "torrent-list":
      return "WebTorrent";
    case "player":
      return "Player";
    case "create-torrent":
      return "Create Torrent";
    case "preferences":
      return "Preferences";
  }
}
