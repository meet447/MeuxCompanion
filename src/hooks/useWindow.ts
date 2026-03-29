import { useState, useEffect, useCallback } from "react";
import { toggleMiniMode, expandWindow } from "../api/tauri";

export function useWindow() {
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [miniCharacterId, setMiniCharacterId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsMiniMode(params.get("mode") === "mini");
    setMiniCharacterId(params.get("character"));
  }, []);

  const toggleMini = useCallback(async (selectedCharacterId?: string) => {
    await toggleMiniMode(selectedCharacterId);
  }, []);

  const expand = useCallback(async () => {
    await expandWindow();
  }, []);

  return { isMiniMode, miniCharacterId, toggleMini, expand };
}
