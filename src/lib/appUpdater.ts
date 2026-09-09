import { isTauri } from "./isTauri";

export type AppUpdateInfo = {
  version: string;
  notes: string | null;
  date: string | null;
};

export type AppUpdateProgress = {
  downloaded: number;
  total: number | null;
};

export type AppUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; update: AppUpdateInfo }
  | { status: "downloading"; update: AppUpdateInfo; progress: AppUpdateProgress }
  | { status: "ready"; update: AppUpdateInfo }
  | { status: "error"; message: string };

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

// Bound the entire HTTP request, including GitHub's release-asset redirects.
export const UPDATE_CHECK_TIMEOUT_MS = 30_000;

export function updateErrorMessage(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/timed? out|timeout/i.test(detail)) {
    return "The update check timed out. Check your connection and try again, or download from View releases.";
  }
  return detail ? `${fallback} ${detail}` : fallback;
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return null;

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
  if (!update) return null;

  try {
    return {
      version: update.version,
      notes: update.body ?? null,
      date: update.date ?? null,
    };
  } finally {
    await update.close();
  }
}

export async function downloadAndInstallAppUpdate(
  onProgress?: (progress: AppUpdateProgress) => void,
): Promise<AppUpdateInfo> {
  if (!isTauri()) {
    throw new Error("Updates are only available in the desktop app.");
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
  if (!update) {
    throw new Error("No update is available.");
  }

  const info: AppUpdateInfo = {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
  };

  let downloaded = 0;
  let total: number | null = null;

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress?.({ downloaded, total });
        return;
      }

      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        return;
      }

      if (event.event === "Finished") {
        onProgress?.({ downloaded, total });
      }
    });
    return info;
  } finally {
    await update.close();
  }
}

export async function relaunchApp(): Promise<void> {
  if (!isTauri()) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
