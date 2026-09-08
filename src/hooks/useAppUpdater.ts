import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AppUpdateInfo,
  type AppUpdateProgress,
  type AppUpdateState,
  APP_VERSION,
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  relaunchApp,
} from "../lib/appUpdater";
import { isTauri } from "../lib/isTauri";

type UseAppUpdaterOptions = {
  /** Check once on mount (desktop only). */
  autoCheck?: boolean;
};

export function useAppUpdater({ autoCheck = false }: UseAppUpdaterOptions = {}) {
  const [state, setState] = useState<AppUpdateState>({ status: "idle" });
  const checkedOnMount = useRef(false);

  const check = useCallback(async () => {
    if (!isTauri()) {
      setState({ status: "idle" });
      return null;
    }

    setState({ status: "checking" });
    try {
      const update = await checkForAppUpdate();
      if (!update) {
        setState({ status: "idle" });
        return null;
      }
      setState({ status: "available", update });
      return update;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not check for updates.";
      setState({ status: "error", message });
      return null;
    }
  }, []);

  const install = useCallback(async () => {
    let updateInfo: AppUpdateInfo | null =
      state.status === "available" || state.status === "downloading" || state.status === "ready"
        ? state.update
        : null;

    if (!updateInfo) {
      setState({ status: "checking" });
      try {
        updateInfo = await checkForAppUpdate();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not check for updates.";
        setState({ status: "error", message });
        return;
      }
      if (!updateInfo) {
        setState({ status: "idle" });
        return;
      }
    }

    setState({ status: "downloading", update: updateInfo, progress: { downloaded: 0, total: null } });

    try {
      await downloadAndInstallAppUpdate((progress: AppUpdateProgress) => {
        setState({ status: "downloading", update: updateInfo!, progress });
      });
      setState({ status: "ready", update: updateInfo });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      setState({ status: "error", message });
    }
  }, [state]);

  const restart = useCallback(async () => {
    await relaunchApp();
  }, []);

  useEffect(() => {
    if (!autoCheck || !isTauri() || checkedOnMount.current) return;
    checkedOnMount.current = true;
    void check();
  }, [autoCheck, check]);

  return {
    appVersion: APP_VERSION,
    enabled: isTauri(),
    state,
    check,
    install,
    restart,
  };
}
