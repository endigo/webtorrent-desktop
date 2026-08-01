export type TorrentStatus =
  | "downloading"
  | "seeding"
  | "paused"
  | "done"
  | "queued"
  | "error";

export interface TorrentProgress {
  /** 0–1 fraction complete */
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  downloaded: number;
  uploaded: number;
  length: number;
}

export interface TorrentSummary {
  torrentKey: number;
  infoHash: string;
  name: string;
  status: TorrentStatus;
  progress: TorrentProgress | null;
  /** Optional gradient / poster style hint for list cards */
  gradient?: string;
  /** data: URL or http URL for poster / cover / captured frame */
  posterUrl?: string;
  testID?: string;
  /** True when this row came from mock seed data, not the engine */
  mock?: boolean;
  errorMessage?: string;
}

export type AppView =
  | "torrent-list"
  | "player"
  | "create-torrent"
  | "preferences";

/** Normalize loose engine payloads into TorrentSummary fields. */
export function coerceStatus(raw: unknown): TorrentStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "downloading" || s === "download") return "downloading";
  if (s === "seeding" || s === "seed" || s === "uploading") return "seeding";
  if (s === "paused" || s === "stopped" || s === "idle") return "paused";
  if (s === "done" || s === "completed" || s === "complete") return "done";
  if (s === "queued" || s === "pending") return "queued";
  if (s === "error" || s === "failed") return "error";
  // Heuristic from progress
  return "downloading";
}

export function statusFromProgress(
  progress: number | null | undefined,
  downloadSpeed = 0,
  opts?: { ready?: boolean; numPeers?: number },
): TorrentStatus {
  if (progress != null && progress >= 1) {
    return downloadSpeed > 0 ? "seeding" : "done";
  }
  // Actively transferring (or have peers) → downloading even at 0%
  if (downloadSpeed > 0 || (opts?.numPeers ?? 0) > 0) {
    return "downloading";
  }
  // Local add before metadata / first bytes — not "paused"
  if (progress == null || progress === 0) {
    return opts?.ready === false || opts?.ready == null ? "queued" : "paused";
  }
  return "downloading";
}
