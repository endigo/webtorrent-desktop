import { create } from "zustand";
import type { AppView, SavedTorrent, TorrentSummary } from "../types/torrent";
import {
  coerceStatus,
  statusFromProgress,
  toSavedTorrent,
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
  enginePing,
  torrentList,
  torrentRemove,
  type EngineTorrent,
  type OpenResult,
} from "../lib/tauri";

/** Debounce timer for writing torrent list to disk */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_MS = 750;
/** Avoid re-entry while restoring saved torrents on boot */
let isRestoring = false;

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

/** Derive a display name from a magnet / path / info-hash string. */
export function displayNameFromTorrentId(id: string): string {
  if (id.startsWith("magnet:")) {
    const dn = id.match(/[?&]dn=([^&]+)/i)?.[1];
    if (dn) {
      try {
        return decodeURIComponent(dn.replace(/\+/g, " "));
      } catch {
        return dn;
      }
    }
    const btih = id.match(/btih:([a-zA-Z0-9]+)/i)?.[1];
    return btih ? `Magnet ${btih.slice(0, 8)}…` : "Magnet torrent";
  }
  const base = id.split(/[/\\]/).pop() || id;
  return base.replace(/\.torrent$/i, "") || base;
}

export function engineTorrentToSummary(
  raw: EngineTorrent & { torrentId?: string },
): TorrentSummary {
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
  const ready =
    typeof (raw as { ready?: boolean }).ready === "boolean"
      ? (raw as { ready?: boolean }).ready
      : undefined;
  const status = raw.status
    ? coerceStatus(raw.status)
    : statusFromProgress(progressFrac, downloadSpeed, { ready, numPeers });

  const torrentId =
    typeof raw.torrentId === "string"
      ? raw.torrentId
      : typeof (raw as { torrent_id?: string }).torrent_id === "string"
        ? (raw as { torrent_id?: string }).torrent_id!
        : "";

  const infoHashRaw = raw.infoHash ?? (raw as { info_hash?: string }).info_hash;
  const infoHash =
    typeof infoHashRaw === "string" &&
    infoHashRaw &&
    infoHashRaw !== "undefined"
      ? infoHashRaw
      : torrentId.startsWith("magnet:")
        ? (torrentId.match(/btih:([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase() ??
          `pending-${raw.torrentKey ?? Date.now()}`)
        : torrentId
          ? `pending-${raw.torrentKey ?? Date.now()}`
          : `pending-${Date.now()}`;

  const nameRaw = raw.name;
  const name =
    typeof nameRaw === "string" && nameRaw && nameRaw !== "undefined"
      ? nameRaw
      : torrentId
        ? displayNameFromTorrentId(torrentId)
        : infoHash.startsWith("pending-")
          ? "Fetching metadata…"
          : infoHash.slice(0, 10);

  return {
    torrentKey:
      typeof raw.torrentKey === "number"
        ? raw.torrentKey
        : typeof raw.torrentKey === "string" && /^\d+$/.test(raw.torrentKey)
          ? Number(raw.torrentKey)
          : nextTorrentKey++,
    infoHash,
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
    gradient: gradientForHash(infoHash),
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
  /** Probe engine_ping; clear mock list when sidecar is live. */
  probeEngine: () => Promise<boolean>;
  /** Handle app://dispatch actions from the Rust shell */
  handleDispatch: (action: string, args: unknown[]) => void;
  upsertTorrent: (summary: TorrentSummary) => void;
  applyProgressEvent: (payload: Record<string, unknown>) => void;
  /** Set or update poster image for a torrent (data URL). */
  setTorrentPoster: (
    match: { infoHash?: string; torrentKey?: number },
    posterUrl: string,
  ) => void;
  /** Write current torrent list to config.json (debounced). */
  schedulePersistTorrents: () => void;
  /** Flush torrent list to disk immediately. */
  persistTorrentsNow: () => Promise<void>;
  /** Re-add torrents from the last session after the engine is up. */
  restoreSavedTorrents: () => Promise<void>;
}

function schedulePersistFromState(get: () => AppState) {
  if (isRestoring) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void get().persistTorrentsNow();
  }, PERSIST_MS);
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
    // Pass path as configured (incl. ~/…); engine expands and creates the dir.
    // Same absolute path on restore → WebTorrent verifies existing bytes and resumes.
    const downloadPath = get().prefs.downloadPath || "~/Downloads";
    const result = await torrentAdd({
      id,
      torrentKey,
      path: downloadPath,
    });
    if (result.ok) {
      // Engine add returns { torrentKey, torrentId, path? } — not full metadata.
      // Build a provisional row from the request; metadata/progress events fill in.
      const enginePath =
        result.value &&
        typeof (result.value as { path?: string }).path === "string"
          ? (result.value as { path: string }).path
          : undefined;
      const summary = engineTorrentToSummary({
        ...(result.value ?? {}),
        torrentKey,
        torrentId: id,
        infoHash:
          typeof result.value?.infoHash === "string"
            ? result.value.infoHash
            : undefined,
        name:
          typeof result.value?.name === "string"
            ? result.value.name
            : displayNameFromTorrentId(id),
      });
      summary.torrentKey = torrentKey;
      summary.status = "queued";
      summary.torrentId = id;
      summary.magnetURI = id.startsWith("magnet:") ? id : undefined;
      summary.downloadPath = enginePath || downloadPath;
      get().upsertTorrent(summary);
      set({
        magnetInput: "",
        statusMessage: `Added “${summary.name}”`,
        usingMockTorrents: false,
      });
      get().schedulePersistTorrents();
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
    get().schedulePersistTorrents();
  },

  loadPrefs: async () => {
    const result = await prefsGet();
    if (result.ok) {
      const merged = mergePrefs(DEFAULT_PREFS, result.value);
      // Keep savedTorrents array from disk if present
      const raw = result.value as AppPrefs & { savedTorrents?: SavedTorrent[] };
      if (Array.isArray(raw.savedTorrents)) {
        merged.savedTorrents = raw.savedTorrents;
      }
      set({
        prefs: merged,
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

  probeEngine: async () => {
    const result = await enginePing();
    if (result.ok) {
      set((state) => ({
        usingMockTorrents: false,
        // Clear sample rows once the real engine is reachable
        torrents: state.usingMockTorrents
          ? state.torrents.filter((t) => !t.mock)
          : state.torrents,
        statusMessage:
          state.usingMockTorrents
            ? "Engine connected"
            : state.statusMessage,
      }));
      // Resume last session once engine is up
      void get().restoreSavedTorrents();
      return true;
    }
    return false;
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
      let idx = state.torrents.findIndex(
        (t) => t.infoHash === summary.infoHash,
      );
      if (idx === -1) {
        idx = state.torrents.findIndex(
          (t) => t.torrentKey === summary.torrentKey,
        );
      }
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
      const prev = next[idx];
      next[idx] = {
        ...prev,
        ...summary,
        // Keep a real name if the update is provisional
        name:
          summary.name &&
          summary.name !== "Unknown" &&
          summary.name !== "Fetching metadata…"
            ? summary.name
            : prev.name,
        torrentKey: prev.torrentKey || summary.torrentKey,
        gradient: prev.gradient ?? summary.gradient,
        // Never clobber an existing poster with empty
        posterUrl: summary.posterUrl || prev.posterUrl,
        magnetURI: summary.magnetURI || prev.magnetURI,
        torrentId: summary.torrentId || prev.torrentId,
        downloadPath: summary.downloadPath || prev.downloadPath,
      };
      return { torrents: next };
    });
    get().schedulePersistTorrents();
  },

  setTorrentPoster: (match, posterUrl) => {
    if (!posterUrl) return;
    set((state) => {
      const idx = state.torrents.findIndex((t) => {
        if (match.infoHash && t.infoHash === match.infoHash) return true;
        if (
          match.torrentKey != null &&
          t.torrentKey === match.torrentKey
        ) {
          return true;
        }
        return false;
      });
      if (idx === -1) return state;
      if (state.torrents[idx].posterUrl === posterUrl) return state;
      const next = state.torrents.slice();
      next[idx] = { ...next[idx], posterUrl };
      return { torrents: next };
    });
    // Posters are session-only (data URLs can be huge); list structure still persists
  },

  schedulePersistTorrents: () => {
    schedulePersistFromState(get);
  },

  persistTorrentsNow: async () => {
    if (isRestoring) return;
    const saved = get()
      .torrents.map(toSavedTorrent)
      .filter((t): t is SavedTorrent => t != null);
    // Keep prefs in sync document
    set((state) => ({
      prefs: { ...state.prefs, savedTorrents: saved },
    }));
    const result = await prefsMerge({ savedTorrents: saved });
    if (!result.ok && result.reason === "error") {
      console.warn("persist torrents failed", result.message);
    }
  },

  restoreSavedTorrents: async () => {
    if (isRestoring) return;
    // Ensure prefs (incl. savedTorrents) are loaded
    if (!get().prefsLoaded) {
      await get().loadPrefs();
    }
    const saved = get().prefs.savedTorrents ?? [];
    if (saved.length === 0) return;

    // Skip if we already have real torrents matching saved hashes
    const existing = new Set(
      get()
        .torrents.filter((t) => !t.mock)
        .map((t) => t.infoHash),
    );
    const toRestore = saved.filter(
      (s) => s.infoHash && !existing.has(s.infoHash),
    );
    if (toRestore.length === 0) return;

    isRestoring = true;
    set({
      usingMockTorrents: false,
      torrents: get().torrents.filter((t) => !t.mock),
      statusMessage: `Restoring ${toRestore.length} torrent(s)…`,
    });

    const downloadDefault = get().prefs.downloadPath || "~/Downloads";
    let restored = 0;
    for (const s of toRestore) {
      const id = (s.magnetURI || s.torrentId || "").trim();
      if (!id) continue;
      const torrentKey = nextTorrentKey++;
      // Prefer the path used last time so piece files on disk are found and resumed
      const resumePath = s.downloadPath || downloadDefault;

      const result = await torrentAdd({ id, torrentKey, path: resumePath });
      if (!result.ok) {
        console.warn("restore failed", s.name, result.message);
        // Still show a row so the user sees it (can re-add manually)
        get().upsertTorrent({
          torrentKey,
          infoHash: s.infoHash,
          name: s.name,
          status: "error",
          progress: null,
          magnetURI: s.magnetURI,
          torrentId: id,
          downloadPath: resumePath,
          errorMessage: result.message,
          gradient: gradientForHash(s.infoHash),
          mock: false,
        });
        continue;
      }

      const enginePath =
        result.value &&
        typeof (result.value as { path?: string }).path === "string"
          ? (result.value as { path: string }).path
          : resumePath;

      const summary = engineTorrentToSummary({
        torrentKey,
        torrentId: id,
        infoHash: s.infoHash,
        name: s.name,
      });
      summary.torrentKey = torrentKey;
      summary.name = s.name || summary.name;
      summary.infoHash = s.infoHash || summary.infoHash;
      summary.magnetURI =
        s.magnetURI || (id.startsWith("magnet:") ? id : undefined);
      summary.torrentId = id;
      summary.downloadPath = enginePath;
      // Engine will report real progress after verifying existing files
      summary.status = "queued";
      get().upsertTorrent(summary);
      restored += 1;
    }

    isRestoring = false;
    set({
      statusMessage:
        restored > 0
          ? `Restored ${restored} torrent(s) from last session`
          : get().statusMessage,
    });
    // Re-save in case some failed / keys reassigned
    void get().persistTorrentsNow();
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

    let shouldPersist = false;

    set((state) => {
      let next = state.torrents.slice();
      let changed = false;
      // Drop pure mocks once real progress arrives
      if (state.usingMockTorrents) {
        next = next.filter((t) => !t.mock);
      }

      for (const item of items) {
        const infoHashRaw =
          typeof item.infoHash === "string"
            ? item.infoHash
            : typeof item.info_hash === "string"
              ? item.info_hash
              : null;
        const infoHash =
          infoHashRaw && infoHashRaw !== "undefined" ? infoHashRaw : null;
        const magnetURI =
          typeof item.magnetURI === "string"
            ? item.magnetURI
            : typeof item.magnetUri === "string"
              ? item.magnetUri
              : null;
        const diskPath =
          typeof item.path === "string"
            ? item.path
            : typeof item.downloadPath === "string"
              ? item.downloadPath
              : null;

        // Coerce key — JSON/serde may deliver number or numeric string
        const rawKey = item.torrentKey ?? item.torrent_key;
        const torrentKey =
          typeof rawKey === "number" && Number.isFinite(rawKey)
            ? rawKey
            : typeof rawKey === "string" && /^\d+$/.test(rawKey)
              ? Number(rawKey)
              : null;

        let idx = -1;
        if (torrentKey != null) {
          idx = next.findIndex((t) => t.torrentKey === torrentKey);
        }
        if (idx === -1 && infoHash) {
          idx = next.findIndex((t) => t.infoHash === infoHash);
        }
        // Match provisional pending-* rows by torrentKey only (already tried)

        const progressFrac =
          typeof item.progress === "number"
            ? item.progress > 1
              ? item.progress / 100
              : item.progress
            : idx >= 0
              ? (next[idx].progress?.progress ?? 0)
              : 0;
        const downloadSpeed = Number(
          item.downloadSpeed ?? item.download_speed ?? 0,
        );
        const uploadSpeed = Number(item.uploadSpeed ?? item.upload_speed ?? 0);
        const numPeers = Number(item.numPeers ?? item.num_peers ?? 0);
        const downloaded = Number(item.downloaded ?? 0);
        const uploaded = Number(item.uploaded ?? 0);
        const length = Number(
          item.length ?? (idx >= 0 ? next[idx].progress?.length : 0) ?? 0,
        );
        const ready =
          typeof item.ready === "boolean" ? item.ready : undefined;
        const incomingName =
          typeof item.name === "string" && item.name ? item.name : null;
        const prevName = idx >= 0 ? next[idx].name : null;
        const name =
          incomingName ||
          (prevName &&
          prevName !== "Unknown" &&
          prevName !== "Fetching metadata…"
            ? prevName
            : null) ||
          (infoHash ? infoHash.slice(0, 10) : "Torrent");
        const status = item.status
          ? coerceStatus(item.status)
          : statusFromProgress(progressFrac, downloadSpeed, {
              ready,
              numPeers,
            });

        const summary: TorrentSummary = {
          torrentKey:
            torrentKey ??
            (idx >= 0 ? next[idx].torrentKey : nextTorrentKey++),
          infoHash:
            infoHash ??
            (idx >= 0 ? next[idx].infoHash : `pending-${torrentKey ?? Date.now()}`),
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
          gradient: gradientForHash(
            infoHash ?? (idx >= 0 ? next[idx].infoHash : name),
          ),
          magnetURI:
            magnetURI || (idx >= 0 ? next[idx].magnetURI : undefined),
          torrentId: idx >= 0 ? next[idx].torrentId : undefined,
          downloadPath:
            diskPath || (idx >= 0 ? next[idx].downloadPath : undefined),
          posterUrl: idx >= 0 ? next[idx].posterUrl : undefined,
          mock: false,
        };

        if (idx === -1) {
          next.push(summary);
          shouldPersist = true;
        } else {
          const prev = next[idx];
          // Identity / path fields changing → rewrite disk state for resume
          if (
            (infoHash && prev.infoHash !== infoHash) ||
            (magnetURI && prev.magnetURI !== magnetURI) ||
            (incomingName && prev.name !== incomingName) ||
            (diskPath && prev.downloadPath !== diskPath)
          ) {
            shouldPersist = true;
          }
          next[idx] = {
            ...prev,
            ...summary,
            torrentKey: prev.torrentKey,
            gradient: prev.gradient ?? summary.gradient,
            magnetURI: summary.magnetURI || prev.magnetURI,
            torrentId: prev.torrentId || summary.torrentId,
            downloadPath: diskPath || prev.downloadPath || summary.downloadPath,
            posterUrl: prev.posterUrl || summary.posterUrl,
          };
        }
        changed = true;
      }

      if (!changed) return state;
      return { torrents: next, usingMockTorrents: false };
    });

    if (shouldPersist) {
      get().schedulePersistTorrents();
    }
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
