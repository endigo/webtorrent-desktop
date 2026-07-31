/**
 * Preferences document shape (mirrors Electron state.saved.prefs subset).
 * Rust prefs module stores arbitrary JSON; this is the UI contract.
 */

export interface AppPrefs {
  downloadPath: string;
  openExternalPlayer: boolean;
  externalPlayerPath: string;
  startup: boolean;
  soundNotifications: boolean;
  highestPlaybackPriority: boolean;
  autoAddTorrents: boolean;
  torrentsFolderPath: string;
  isFileHandler: boolean;
  sortByName: boolean;
}

export const DEFAULT_PREFS: AppPrefs = {
  downloadPath: "~/Downloads/WebTorrent",
  openExternalPlayer: false,
  externalPlayerPath: "",
  startup: false,
  soundNotifications: true,
  highestPlaybackPriority: false,
  autoAddTorrents: false,
  torrentsFolderPath: "",
  isFileHandler: false,
  sortByName: false,
};

export function mergePrefs(
  base: AppPrefs,
  patch: Partial<AppPrefs> | Record<string, unknown> | null | undefined,
): AppPrefs {
  if (!patch || typeof patch !== "object") return base;
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch).filter(
        ([, v]) => v !== undefined && v !== null,
      ),
    ),
  } as AppPrefs;
}
