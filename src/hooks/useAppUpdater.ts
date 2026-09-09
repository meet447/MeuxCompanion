import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AppUpdateInfo,
  type AppUpdateProgress,
  type AppUpdateState,
  APP_VERSION,
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  relaunchApp,
  updateErrorMessage,
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
        setState({ status: "up-to-date" });
        return null;
      }
      setState({ status: "available", update });
      return update;
    } catch (err) {
      const message = updateErrorMessage(err, "Could not check for updates.");
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
        const message = updateErrorMessage(err, "Could not check for updates.");
        setState({ status: "error", message });
        return;
      }
      if (!updateInfo) {
        setState({ status: "up-to-date" });
        return;
      }
    }

    setState({ status: "downloading", update: updateInfo, progress: { downloaded: 0, total: null } });

    try {
      const installedUpdate = await downloadAndInstallAppUpdate((progress: AppUpdateProgress) => {
        setState({ status: "downloading", update: updateInfo!, progress });
      });
      setState({ status: "ready", update: installedUpdate });
    } catch (err) {
      const message = updateErrorMessage(err, "Update failed.");
      setState({ status: "error", message });
    }
  }, [state]);

  const restart = useCallback(async () => {
    try {
      await relaunchApp();
    } catch (err) {
      setState({ status: "error", message: updateErrorMessage(err, "Could not restart Meuxe. Please close and reopen the app.") });
    }
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
