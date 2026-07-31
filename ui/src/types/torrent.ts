export type TorrentStatus = "downloading" | "seeding" | "paused" | "done";

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
  testID?: string;
}

export type AppView =
  | "torrent-list"
  | "player"
  | "create-torrent"
  | "preferences";
