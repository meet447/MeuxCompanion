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
  | { status: "available"; update: AppUpdateInfo }
  | { status: "downloading"; update: AppUpdateInfo; progress: AppUpdateProgress }
  | { status: "ready"; update: AppUpdateInfo }
  | { status: "error"; message: string };

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return null;

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
  };
}

export async function downloadAndInstallAppUpdate(
  onProgress?: (progress: AppUpdateProgress) => void,
): Promise<AppUpdateInfo> {
  if (!isTauri()) {
    throw new Error("Updates are only available in the desktop app.");
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
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
}

export async function relaunchApp(): Promise<void> {
  if (!isTauri()) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
