/**
 * Thin wrappers around Tauri invoke with graceful fallback when commands
 * are missing (browser-only Vite dev, or Rust side not yet registered).
 */

import { invoke } from "@tauri-apps/api/core";

export type OpenResult =
  | { ok: true; paths: string[] }
  | { ok: false; reason: "unavailable" | "cancelled" | "error"; message: string };

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
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
 * Open a .torrent file (or magnet) via native dialog.
 * Tries several command names the Rust shell may register.
 */
export async function openTorrent(): Promise<OpenResult> {
  const candidates = ["open_torrent", "openTorrent", "open_torrent_file"] as const;

  for (const cmd of candidates) {
    const result = await tryInvoke<string[] | string | null>(cmd);
    if (result.ok) {
      const paths = normalizePaths(result.value);
      if (paths.length === 0) {
        return { ok: false, reason: "cancelled", message: "No file selected" };
      }
      return { ok: true, paths };
    }
    // If command exists but failed for another reason, stop trying aliases
    if (!isMissingCommand(result.message)) {
      return { ok: false, reason: "error", message: result.message };
    }
  }

  return {
    ok: false,
    reason: "unavailable",
    message: "open_torrent command not available yet",
  };
}

/**
 * Open arbitrary files (for create-torrent / add files).
 */
export async function openFiles(): Promise<OpenResult> {
  const candidates = ["open_files", "openFiles"] as const;

  for (const cmd of candidates) {
    const result = await tryInvoke<string[] | string | null>(cmd);
    if (result.ok) {
      const paths = normalizePaths(result.value);
      if (paths.length === 0) {
        return { ok: false, reason: "cancelled", message: "No file selected" };
      }
      return { ok: true, paths };
    }
    if (!isMissingCommand(result.message)) {
      return { ok: false, reason: "error", message: result.message };
    }
  }

  return {
    ok: false,
    reason: "unavailable",
    message: "open_files command not available yet",
  };
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
