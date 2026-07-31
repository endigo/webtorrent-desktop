import { create } from "zustand";
import type { AppView, TorrentSummary } from "../types/torrent";
import {
  coerceStatus,
  statusFromProgress,
} from "../types/torrent";
import { DEFAULT_PREFS, mergePrefs, type AppPrefs } from "../types/prefs";
import {
  autostartSet,
  openFiles,
  openFolder,
  openTorrent,
  prefsGet,
  prefsMerge,
  torrentAdd,
  torrentCreate,
  torrentList,
  torrentRemove,
  type EngineTorrent,
  type OpenResult,
} from "../lib/tauri";

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
    mock: true,
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
    mock: true,
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
    mock: true,
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
    mock: true,
  },
];

const GRADIENTS = [
  "linear-gradient(to bottom right, #4B79A1, #283E51)",
  "linear-gradient(to bottom right, #141E30, #243B55)",
  "linear-gradient(to bottom right, #3a1c71, #d76d77)",
  "linear-gradient(to bottom right, #0f2027, #203a43)",
  "linear-gradient(to bottom right, #232526, #414345)",
  "linear-gradient(to bottom right, #1D4350, #A43931)",
];

function gradientForHash(infoHash: string): string {
  let n = 0;
  for (let i = 0; i < infoHash.length; i++) {
    n = (n + infoHash.charCodeAt(i) * (i + 1)) % GRADIENTS.length;
  }
  return GRADIENTS[n];
}

let nextTorrentKey = 100;

export function engineTorrentToSummary(raw: EngineTorrent): TorrentSummary {
  const progressFrac =
    typeof raw.progress === "number"
      ? raw.progress > 1
        ? raw.progress / 100
        : raw.progress
      : 0;
  const downloadSpeed = Number(raw.downloadSpeed ?? 0);
  const uploadSpeed = Number(raw.uploadSpeed ?? 0);
  const length = Number(raw.length ?? 0);
  const downloaded = Number(raw.downloaded ?? progressFrac * length);
  const uploaded = Number(raw.uploaded ?? 0);
  const numPeers = Number(raw.numPeers ?? 0);
  const status = raw.status
    ? coerceStatus(raw.status)
    : statusFromProgress(progressFrac, downloadSpeed);

  return {
    torrentKey:
      typeof raw.torrentKey === "number" ? raw.torrentKey : nextTorrentKey++,
    infoHash: String(raw.infoHash),
    name: String(raw.name || raw.infoHash || "Unknown"),
    status,
    progress: {
      progress: progressFrac,
      downloadSpeed,
      uploadSpeed,
      numPeers,
      downloaded,
      uploaded,
      length,
    },
    gradient: gradientForHash(String(raw.infoHash || "x")),
    mock: false,
  };
}

interface AppState {
  view: AppView;
  history: AppView[];
  historyIndex: number;
  windowTitle: string;
  torrents: TorrentSummary[];
  /** When true, list is backed by mock data (engine not wired). */
  usingMockTorrents: boolean;
  selectedInfoHash: string | null;
  statusMessage: string | null;
  createTorrentPaths: string[];
  prefs: AppPrefs;
  prefsLoaded: boolean;
  magnetInput: string;

  navigate: (view: AppView) => void;
  back: () => void;
  forward: () => void;
  selectTorrent: (infoHash: string | null) => void;
  setStatusMessage: (message: string | null) => void;
  setMagnetInput: (value: string) => void;
  setCreateTorrentPaths: (paths: string[]) => void;
  setPrefsLocal: (patch: Partial<AppPrefs>) => void;

  handleOpenTorrent: () => Promise<void>;
  handleOpenFiles: () => Promise<void>;
  handleOpenFolder: () => Promise<void>;
  handleAddMagnet: (magnet?: string) => Promise<void>;
  handleCreateTorrent: (opts: {
    name: string;
    comment: string;
    isPrivate: boolean;
    trackers: string[];
  }) => Promise<void>;
  playTorrent: (infoHash: string) => void;
  removeTorrent: (infoHash: string) => Promise<void>;

  loadPrefs: () => Promise<void>;
  savePrefs: (patch?: Partial<AppPrefs>) => Promise<void>;
  refreshTorrents: () => Promise<void>;
  /** Handle app://dispatch actions from the Rust shell */
  handleDispatch: (action: string, args: unknown[]) => void;
  upsertTorrent: (summary: TorrentSummary) => void;
  applyProgressEvent: (payload: Record<string, unknown>) => void;
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

function looksLikeTorrentId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("magnet:")) return true;
  if (v.endsWith(".torrent")) return true;
  if (/^[a-fA-F0-9]{40}$/.test(v)) return true;
  if (/^[a-zA-Z2-7]{32}$/.test(v)) return true; // base32 infohash
  return false;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "torrent-list",
  history: ["torrent-list"],
  historyIndex: 0,
  windowTitle: "WebTorrent",
  torrents: MOCK_TORRENTS,
  usingMockTorrents: true,
  selectedInfoHash: null,
  statusMessage: null,
  createTorrentPaths: [],
  prefs: { ...DEFAULT_PREFS },
  prefsLoaded: false,
  magnetInput: "",

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
  setMagnetInput: (value) => set({ magnetInput: value }),
  setCreateTorrentPaths: (paths) => set({ createTorrentPaths: paths }),
  setPrefsLocal: (patch) =>
    set((state) => ({ prefs: { ...state.prefs, ...patch } })),

  handleOpenTorrent: async () => {
    const result = await openTorrent();
    if (result.ok) {
      set({ statusMessage: formatOpenResult("Open torrent", result) });
      for (const path of result.paths) {
        await get().handleAddMagnet(path);
      }
      return;
    }
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

  handleOpenFolder: async () => {
    const result = await openFolder();
    if (result.ok) {
      set({
        createTorrentPaths: result.paths,
        statusMessage: formatOpenResult("Open folder", result),
      });
      get().navigate("create-torrent");
      return;
    }
    if (result.reason === "unavailable") {
      set({
        createTorrentPaths: ["/mock/path/My Folder"],
        statusMessage: formatOpenResult("Open folder", result),
      });
      get().navigate("create-torrent");
      return;
    }
    set({ statusMessage: formatOpenResult("Open folder", result) });
  },

  handleAddMagnet: async (magnet) => {
    const id = (magnet ?? get().magnetInput).trim();
    if (!id) {
      set({ statusMessage: "Paste a magnet link or torrent path first" });
      return;
    }
    if (!looksLikeTorrentId(id) && !id.includes("/") && !id.includes("\\")) {
      set({
        statusMessage:
          "Doesn’t look like a magnet, info-hash, or .torrent path",
      });
      return;
    }

    const torrentKey = nextTorrentKey++;
    const downloadPath = get().prefs.downloadPath;
    const result = await torrentAdd({
      id,
      torrentKey,
      path:
        downloadPath && !downloadPath.startsWith("~/")
          ? downloadPath
          : undefined,
    });
    if (result.ok) {
      const summary = result.value
        ? engineTorrentToSummary(result.value)
        : engineTorrentToSummary({
            torrentKey,
            infoHash: id.startsWith("magnet:")
              ? id.slice(0, 48)
              : id.slice(0, 40),
            name: id.startsWith("magnet:")
              ? "Magnet torrent"
              : id.split(/[/\\]/).pop() || id,
          });
      // Prefer our assigned key if engine didn't echo one
      if (!result.value?.torrentKey) {
        summary.torrentKey = torrentKey;
      }
      get().upsertTorrent(summary);
      set({
        magnetInput: "",
        statusMessage: `Added “${summary.name}”`,
        usingMockTorrents: false,
      });
      return;
    }

    if (result.reason === "unavailable") {
      // Optimistic local mock add so UI flow is testable without engine
      const hash =
        id.match(/btih:([a-fA-F0-9]{40})/i)?.[1] ??
        (id.length >= 40 ? id.slice(0, 40) : `mock${Date.now().toString(16)}`);
      const name = id.startsWith("magnet:")
        ? decodeURIComponent(
            id.match(/dn=([^&]+)/)?.[1]?.replace(/\+/g, " ") ?? "Magnet link",
          )
        : id.split(/[/\\]/).pop() || "Torrent";
      const summary: TorrentSummary = {
        torrentKey,
        infoHash: hash.toLowerCase(),
        name,
        status: "queued",
        progress: {
          progress: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          numPeers: 0,
          downloaded: 0,
          uploaded: 0,
          length: 0,
        },
        gradient: gradientForHash(hash),
        mock: true,
      };
      get().upsertTorrent(summary);
      set({
        magnetInput: "",
        statusMessage: `Queued “${name}” (engine not available yet)`,
      });
      return;
    }

    set({ statusMessage: `Add failed: ${result.message}` });
  },

  handleCreateTorrent: async (opts) => {
    const paths = get().createTorrentPaths;
    if (paths.length === 0) {
      set({ statusMessage: "Choose files or a folder first" });
      return;
    }

    const torrentKey = nextTorrentKey++;
    const result = await torrentCreate({
      paths,
      name: opts.name,
      comment: opts.comment || undefined,
      private: opts.isPrivate,
      trackers: opts.trackers.filter(Boolean),
      torrentKey,
    });

    if (result.ok) {
      if (result.value && "infoHash" in result.value && result.value.infoHash) {
        get().upsertTorrent(engineTorrentToSummary(result.value as EngineTorrent));
      }
      set({
        statusMessage: `Created torrent “${opts.name}”`,
        createTorrentPaths: [],
      });
      get().navigate("torrent-list");
      return;
    }

    if (result.reason === "unavailable") {
      const summary: TorrentSummary = {
        torrentKey,
        infoHash: `created${Date.now().toString(16)}`.slice(0, 40),
        name: opts.name,
        status: "seeding",
        progress: {
          progress: 1,
          downloadSpeed: 0,
          uploadSpeed: 0,
          numPeers: 0,
          downloaded: 0,
          uploaded: 0,
          length: 0,
        },
        gradient: gradientForHash(opts.name),
        mock: true,
      };
      get().upsertTorrent(summary);
      set({
        statusMessage: `Created “${opts.name}” (mock — engine not wired)`,
        createTorrentPaths: [],
      });
      get().navigate("torrent-list");
      return;
    }

    set({ statusMessage: `Create failed: ${result.message}` });
  },

  playTorrent: (infoHash) => {
    set({ selectedInfoHash: infoHash });
    get().navigate("player");
  },

  removeTorrent: async (infoHash) => {
    const existing = get().torrents.find((t) => t.infoHash === infoHash);
    const result = await torrentRemove(infoHash, false, existing?.torrentKey);
    set((state) => ({
      torrents: state.torrents.filter((t) => t.infoHash !== infoHash),
      selectedInfoHash:
        state.selectedInfoHash === infoHash ? null : state.selectedInfoHash,
      statusMessage:
        result.ok || result.reason === "unavailable"
          ? `Removed torrent ${infoHash.slice(0, 8)}…`
          : `Remove failed: ${result.message}`,
    }));
  },

  loadPrefs: async () => {
    const result = await prefsGet();
    if (result.ok) {
      set({
        prefs: mergePrefs(DEFAULT_PREFS, result.value),
        prefsLoaded: true,
      });
      return;
    }
    set({ prefsLoaded: true });
  },

  savePrefs: async (patch) => {
    const prev = get().prefs;
    const next = patch ? { ...prev, ...patch } : get().prefs;
    set({ prefs: next });

    // Keep OS login item in sync when startup flag changes.
    if (patch && "startup" in patch && patch.startup !== prev.startup) {
      const auto = await autostartSet(Boolean(next.startup));
      if (!auto.ok && auto.reason === "error") {
        set({ statusMessage: `Autostart: ${auto.message}` });
      }
    }

    const result = await prefsMerge(patch ?? next);
    if (result.ok) {
      set({
        prefs: mergePrefs(DEFAULT_PREFS, result.value),
        statusMessage: "Preferences saved",
      });
      return;
    }
    if (result.reason === "unavailable") {
      set({
        statusMessage: "Preferences saved locally (prefs_set not available yet)",
      });
      return;
    }
    set({ statusMessage: `Save prefs failed: ${result.message}` });
  },

  refreshTorrents: async () => {
    const result = await torrentList();
    if (result.ok) {
      const list = result.value.map(engineTorrentToSummary);
      set({
        torrents: list,
        usingMockTorrents: false,
      });
      return;
    }
    // Keep mocks when engine list is unavailable
  },

  handleDispatch: (action, args) => {
    switch (action) {
      case "addTorrent": {
        const id = args[0];
        if (typeof id === "string") {
          void get().handleAddMagnet(id);
        }
        break;
      }
      case "onOpen": {
        const payload = args[0];
        const ids = Array.isArray(payload)
          ? payload
          : typeof payload === "string"
            ? [payload]
            : [];
        for (const id of ids) {
          if (typeof id === "string") {
            // Files to seed → create torrent; torrents/magnets → add
            if (
              !id.startsWith("magnet:") &&
              !id.endsWith(".torrent") &&
              !/^[a-fA-F0-9]{40}$/.test(id)
            ) {
              set({ createTorrentPaths: [id] });
              get().navigate("create-torrent");
            } else {
              void get().handleAddMagnet(id);
            }
          }
        }
        break;
      }
      case "showCreateTorrent": {
        const payload = args[0];
        const paths = Array.isArray(payload)
          ? payload.filter((p): p is string => typeof p === "string")
          : typeof payload === "string"
            ? [payload]
            : [];
        set({ createTorrentPaths: paths });
        get().navigate("create-torrent");
        break;
      }
      case "openTorrentAddress": {
        get().navigate("torrent-list");
        set({
          statusMessage: "Paste a magnet link below",
        });
        break;
      }
      case "backToList": {
        get().navigate("torrent-list");
        break;
      }
      case "stateSaveImmediate": {
        void get().savePrefs();
        break;
      }
      default:
        console.debug("[dispatch]", action, args);
    }
  },

  upsertTorrent: (summary) => {
    set((state) => {
      const idx = state.torrents.findIndex(
        (t) => t.infoHash === summary.infoHash,
      );
      if (idx === -1) {
        // Drop pure mocks when first real torrent arrives
        const base =
          state.usingMockTorrents && !summary.mock
            ? state.torrents.filter((t) => !t.mock)
            : state.torrents;
        return {
          torrents: [...base, summary],
          usingMockTorrents: summary.mock ? state.usingMockTorrents : false,
        };
      }
      const next = state.torrents.slice();
      next[idx] = { ...next[idx], ...summary };
      return { torrents: next };
    });
  },

  applyProgressEvent: (payload) => {
    // Engine emits either a bulk { torrents: [...] } snapshot or a single-torrent object.
    const items: Record<string, unknown>[] = Array.isArray(payload.torrents)
      ? (payload.torrents as Record<string, unknown>[])
      : payload.infoHash || payload.info_hash || payload.torrentKey != null
        ? [payload]
        : payload.info && typeof payload.info === "object"
          ? [
              {
                ...(payload.info as Record<string, unknown>),
                torrentKey: payload.torrentKey,
              },
            ]
          : [];

    if (items.length === 0) return;

    set((state) => {
      let next = state.torrents.slice();
      let changed = false;
      // Drop pure mocks once real progress arrives
      if (state.usingMockTorrents) {
        next = next.filter((t) => !t.mock);
      }

      for (const item of items) {
        const infoHash =
          typeof item.infoHash === "string"
            ? item.infoHash
            : typeof item.info_hash === "string"
              ? item.info_hash
              : null;
        const torrentKey =
          typeof item.torrentKey === "number"
            ? item.torrentKey
            : typeof item.torrent_key === "number"
              ? item.torrent_key
              : null;

        let idx = -1;
        if (infoHash) {
          idx = next.findIndex((t) => t.infoHash === infoHash);
        }
        if (idx === -1 && torrentKey != null) {
          idx = next.findIndex((t) => t.torrentKey === torrentKey);
        }

        const progressFrac =
          typeof item.progress === "number"
            ? item.progress > 1
              ? item.progress / 100
              : item.progress
            : 0;
        const downloadSpeed = Number(item.downloadSpeed ?? 0);
        const uploadSpeed = Number(item.uploadSpeed ?? 0);
        const numPeers = Number(item.numPeers ?? 0);
        const downloaded = Number(item.downloaded ?? 0);
        const uploaded = Number(item.uploaded ?? 0);
        const length = Number(item.length ?? 0);
        const name =
          typeof item.name === "string" && item.name
            ? item.name
            : infoHash
              ? infoHash.slice(0, 8)
              : "Torrent";
        const status = item.status
          ? coerceStatus(item.status)
          : statusFromProgress(progressFrac, downloadSpeed);

        const summary: TorrentSummary = {
          torrentKey: torrentKey ?? nextTorrentKey++,
          infoHash: infoHash ?? `pending-${torrentKey ?? Date.now()}`,
          name,
          status,
          progress: {
            progress: progressFrac,
            downloadSpeed,
            uploadSpeed,
            numPeers,
            downloaded,
            uploaded,
            length,
          },
          gradient: gradientForHash(infoHash ?? name),
          mock: false,
        };

        if (idx === -1) {
          next.push(summary);
        } else {
          next[idx] = {
            ...next[idx],
            ...summary,
            torrentKey: next[idx].torrentKey,
            gradient: next[idx].gradient ?? summary.gradient,
          };
        }
        changed = true;
      }

      if (!changed) return state;
      return { torrents: next, usingMockTorrents: false };
    });
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
