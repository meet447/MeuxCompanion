import { useState, useEffect, useCallback } from "react";
import { toggleMiniMode, expandWindow } from "../api/tauri";

export function useWindow() {
  const [isMiniMode, setIsMiniMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsMiniMode(params.get("mode") === "mini");
  }, []);

  const toggleMini = useCallback(async () => {
    await toggleMiniMode();
  }, []);

  const expand = useCallback(async () => {
    await expandWindow();
  }, []);

  return { isMiniMode, toggleMini, expand };
}
