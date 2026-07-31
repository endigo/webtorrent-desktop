/**
 * Thin wrappers around Tauri invoke + events with graceful fallback when
 * commands are missing (browser-only Vite dev, or Rust side not yet registered).
 *
 * Command names follow docs/TAURI_MIGRATION.md and src-tauri/src/commands.rs:
 *   open_torrent, open_files, open_directory, prefs_get, prefs_set, prefs_merge,
 *   torrent_add, torrent_remove, torrent_create, torrent_select_files,
 *   torrent_list, stream_start, stream_stop
 *
 * Events:
 *   app://dispatch  — shell → UI actions (legacy Electron dispatch shape)
 *   torrent://progress | torrent://metadata | torrent://done
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type OpenResult =
  | { ok: true; paths: string[] }
  | {
      ok: false;
      reason: "unavailable" | "cancelled" | "error";
      message: string;
    };

export type InvokeResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "unavailable" | "error"; message: string };

/** Prefs document shape (subset; Rust stores arbitrary JSON object). */
export interface AppPrefs {
  downloadPath?: string;
  openExternalPlayer?: boolean;
  externalPlayerPath?: string;
  startup?: boolean;
  soundNotifications?: boolean;
  highestPlaybackPriority?: boolean;
  autoAddTorrents?: boolean;
  torrentsFolderPath?: string;
  isFileHandler?: boolean;
  sortByName?: boolean;
  [key: string]: unknown;
}

/** Payload for torrent_add */
export interface TorrentAddArgs {
  /** Local .torrent path, magnet URI, or info-hash */
  id: string;
  /** Optional download path override */
  path?: string;
  /** Optional file selection indices */
  fileIndices?: number[];
}

/** Payload for torrent_create */
export interface TorrentCreateArgs {
  paths: string[];
  name: string;
  comment?: string;
  private?: boolean;
  trackers?: string[];
}

/** Payload for torrent_select_files */
export interface TorrentSelectFilesArgs {
  infoHash: string;
  fileIndices: number[];
}

/** Engine list item (flexible for W2 shape) */
export interface EngineTorrent {
  torrentKey?: number;
  infoHash: string;
  name: string;
  status?: string;
  progress?: number;
  downloadSpeed?: number;
  uploadSpeed?: number;
  numPeers?: number;
  downloaded?: number;
  uploaded?: number;
  length?: number;
  [key: string]: unknown;
}

/** Shell dispatch event payload (src-tauri/src/dispatch.rs) */
export interface DispatchPayload {
  action: string;
  args: unknown[];
}

export type DispatchHandler = (action: string, args: unknown[]) => void;

/** Progress event payload (engine → UI) */
export interface TorrentProgressEvent {
  infoHash?: string;
  torrentKey?: number;
  progress?: number;
  downloadSpeed?: number;
  uploadSpeed?: number;
  numPeers?: number;
  downloaded?: number;
  uploaded?: number;
  length?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export function isTauriAvailable(): boolean {
  return isTauriRuntime();
}

async function tryInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  if (!isTauriRuntime()) {
    return { ok: false, message: "Not running inside Tauri" };
  }
  try {
    const value = await invoke<T>(command, args);
    return { ok: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

/**
 * Try a list of command name aliases. Returns on first non-missing result.
 */
async function tryInvokeAliases<T>(
  candidates: readonly string[],
  args?: Record<string, unknown>,
): Promise<InvokeResult<T>> {
  let lastMissing = "command not available yet";
  for (const cmd of candidates) {
    const result = await tryInvoke<T>(cmd, args);
    if (result.ok) {
      return { ok: true, value: result.value };
    }
    if (!isMissingCommand(result.message)) {
      return { ok: false, reason: "error", message: result.message };
    }
    lastMissing = result.message;
  }
  return { ok: false, reason: "unavailable", message: lastMissing };
}

function normalizePaths(value: string[] | string | null | undefined): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value ? [value] : [];
  return value.filter(Boolean);
}

function isMissingCommand(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("unknown command") ||
    (lower.includes("command") && lower.includes("not")) ||
    lower.includes("not available") ||
    lower.includes("not running inside tauri")
  );
}

function toOpenResult(
  result: InvokeResult<string[] | string | null | undefined>,
  label: string,
): OpenResult {
  if (result.ok) {
    const paths = normalizePaths(result.value);
    if (paths.length === 0) {
      return { ok: false, reason: "cancelled", message: "No file selected" };
    }
    return { ok: true, paths };
  }
  if (result.reason === "unavailable") {
    return {
      ok: false,
      reason: "unavailable",
      message: `${label} command not available yet`,
    };
  }
  return { ok: false, reason: "error", message: result.message };
}

// ---------------------------------------------------------------------------
// Dialog / open commands (W1a shell)
// ---------------------------------------------------------------------------

/**
 * Open a .torrent file via native dialog.
 * Primary: open_torrent. Aliases match possible Rust registrations.
 */
export async function openTorrent(): Promise<OpenResult> {
  const result = await tryInvokeAliases<string[] | string | null>([
    "open_torrent",
    "openTorrent",
    "open_torrent_file",
  ]);
  return toOpenResult(result, "open_torrent");
}

/**
 * Open arbitrary files (create-torrent / add files).
 */
export async function openFiles(): Promise<OpenResult> {
  const result = await tryInvokeAliases<string[] | string | null>([
    "open_files",
    "openFiles",
  ]);
  return toOpenResult(result, "open_files");
}

/**
 * Open a folder (create-torrent from directory / download path).
 * Primary Rust name: `open_directory` (src-tauri/src/commands.rs).
 */
export async function openFolder(): Promise<OpenResult> {
  const result = await tryInvokeAliases<string[] | string | null>([
    "open_directory",
    "openDirectory",
    "open_folder",
    "openFolder",
    "pick_folder",
    "pick_download_path",
  ]);
  return toOpenResult(result, "open_directory");
}

// ---------------------------------------------------------------------------
// Preferences (W1a prefs module / W5)
// ---------------------------------------------------------------------------

/**
 * Load the full prefs document from Rust (`config.json`).
 */
export async function prefsGet(): Promise<InvokeResult<AppPrefs>> {
  const result = await tryInvokeAliases<AppPrefs>([
    "prefs_get",
    "prefsGet",
    "get_prefs",
  ]);
  if (result.ok && result.value && typeof result.value === "object") {
    return result;
  }
  return result;
}

/**
 * Replace the whole prefs document.
 * Rust signature: `prefs_set(prefs, value)`.
 */
export async function prefsSet(
  prefs: AppPrefs,
): Promise<InvokeResult<null>> {
  const result = await tryInvokeAliases<null>(
    ["prefs_set", "prefsSet", "set_prefs"],
    { value: prefs },
  );
  return result;
}

/**
 * Shallow-merge top-level keys into prefs and return the result.
 * Rust signature: `prefs_merge(prefs, patch)`.
 */
export async function prefsMerge(
  patch: Partial<AppPrefs>,
): Promise<InvokeResult<AppPrefs>> {
  const result = await tryInvokeAliases<AppPrefs>(
    ["prefs_merge", "prefsMerge", "merge_prefs"],
    { patch },
  );
  if (result.ok) return result;

  // Fallback: get → merge client-side → set
  const current = await prefsGet();
  if (!current.ok) {
    return {
      ok: false,
      reason: current.reason,
      message: current.message,
    };
  }
  const merged: AppPrefs = { ...current.value, ...patch };
  const setResult = await prefsSet(merged);
  if (setResult.ok) {
    return { ok: true, value: merged };
  }
  return {
    ok: false,
    reason: setResult.reason,
    message: setResult.message,
  };
}

// ---------------------------------------------------------------------------
// Torrent engine commands (W2 / W3)
// ---------------------------------------------------------------------------

export async function torrentAdd(
  args: TorrentAddArgs,
): Promise<InvokeResult<EngineTorrent | null>> {
  return tryInvokeAliases<EngineTorrent | null>(
    ["torrent_add", "torrentAdd", "add_torrent"],
    {
      id: args.id,
      path: args.path,
      fileIndices: args.fileIndices,
      // snake_case aliases some Rust handlers prefer
      file_indices: args.fileIndices,
    },
  );
}

export async function torrentRemove(
  infoHash: string,
  deleteData = false,
): Promise<InvokeResult<boolean | null>> {
  return tryInvokeAliases<boolean | null>(
    ["torrent_remove", "torrentRemove", "remove_torrent"],
    { infoHash, info_hash: infoHash, deleteData, delete_data: deleteData },
  );
}

export async function torrentCreate(
  args: TorrentCreateArgs,
): Promise<InvokeResult<EngineTorrent | { path?: string } | null>> {
  return tryInvokeAliases(["torrent_create", "torrentCreate", "create_torrent"], {
    paths: args.paths,
    name: args.name,
    comment: args.comment,
    private: args.private,
    trackers: args.trackers,
  });
}

export async function torrentSelectFiles(
  args: TorrentSelectFilesArgs,
): Promise<InvokeResult<null>> {
  return tryInvokeAliases(["torrent_select_files", "torrentSelectFiles"], {
    infoHash: args.infoHash,
    info_hash: args.infoHash,
    fileIndices: args.fileIndices,
    file_indices: args.fileIndices,
  });
}

export async function torrentList(): Promise<InvokeResult<EngineTorrent[]>> {
  const result = await tryInvokeAliases<EngineTorrent[]>([
    "torrent_list",
    "torrentList",
    "list_torrents",
  ]);
  if (result.ok && !Array.isArray(result.value)) {
    return { ok: true, value: [] };
  }
  return result;
}

export async function streamStart(
  infoHash: string,
  fileIndex = 0,
): Promise<InvokeResult<{ url?: string } | string | null>> {
  return tryInvokeAliases(["stream_start", "streamStart", "start_server"], {
    infoHash,
    info_hash: infoHash,
    fileIndex,
    file_index: fileIndex,
  });
}

export async function streamStop(
  infoHash?: string,
): Promise<InvokeResult<null>> {
  return tryInvokeAliases(["stream_stop", "streamStop", "stop_server"], {
    infoHash,
    info_hash: infoHash,
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const EVENTS = {
  dispatch: "app://dispatch",
  progress: "torrent://progress",
  metadata: "torrent://metadata",
  done: "torrent://done",
} as const;

/**
 * Listen for shell → UI dispatch events from Rust.
 * No-ops gracefully outside Tauri.
 */
export async function onDispatch(
  handler: DispatchHandler,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  try {
    return await listen<DispatchPayload>(EVENTS.dispatch, (event) => {
      const payload = event.payload;
      if (!payload || typeof payload.action !== "string") return;
      const args = Array.isArray(payload.args) ? payload.args : [];
      handler(payload.action, args);
    });
  } catch {
    return () => {};
  }
}

export async function onTorrentProgress(
  handler: (payload: TorrentProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  try {
    return await listen<TorrentProgressEvent>(EVENTS.progress, (event) => {
      handler(event.payload ?? {});
    });
  } catch {
    return () => {};
  }
}

export async function onTorrentMetadata(
  handler: (payload: Record<string, unknown>) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  try {
    return await listen<Record<string, unknown>>(EVENTS.metadata, (event) => {
      handler(event.payload ?? {});
    });
  } catch {
    return () => {};
  }
}

export async function onTorrentDone(
  handler: (payload: Record<string, unknown>) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  try {
    return await listen<Record<string, unknown>>(EVENTS.done, (event) => {
      handler(event.payload ?? {});
    });
  } catch {
    return () => {};
  }
}
