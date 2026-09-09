import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";

const SHORTCUT_TOGGLE = "CommandOrControl+Shift+E";
const SHORTCUT_TEXT = "CommandOrControl+Shift+Space";
const SHORTCUT_MIC = "CommandOrControl+Shift+M";
// Serializes global-shortcut (un)registration across effect runs.
let shortcutQueue: Promise<void> = Promise.resolve();

export function useGlobalShortcuts({ isMiniMode, selectedCharId, toggleMini, onMicToggle }: {
  isMiniMode: boolean;
  selectedCharId: string;
  toggleMini: (characterId?: string) => void;
  onMicToggle: () => void;
}) {
  // Trigger to open mini composer from global shortcut
  const [miniComposerTrigger, setMiniComposerTrigger] = useState(0);
  // Ref for focus chat input in full mode
  const fullChatInputRef = useRef<HTMLInputElement>(null);
  // Ref for mic toggle
  const handleMicToggleRef = useRef<() => void>(() => {});

  handleMicToggleRef.current = onMicToggle;
  const selectedCharIdRef = useRef(selectedCharId);
  selectedCharIdRef.current = selectedCharId;

  // Global shortcuts: registered once from main window, work in all modes
  // Actions are dispatched via Tauri events so both windows can respond
  const toggleMiniRef = useRef(toggleMini);
  toggleMiniRef.current = toggleMini;
  useEffect(() => {
    if (isMiniMode) return;

    let cancelled = false;
    const broadcast = (event: string) => invoke("broadcast_event", { event }).catch(() => {});
    const handlers: Array<[string, () => void]> = [
      [SHORTCUT_TOGGLE, () => toggleMiniRef.current(selectedCharIdRef.current || undefined)],
      [SHORTCUT_TEXT, () => broadcast("shortcut:text")],
      [SHORTCUT_MIC, () => broadcast("shortcut:mic")],
    ];

    // Register/unregister are async and must be serialized: a remount (StrictMode
    // in dev, or a real one) would otherwise race a fresh register() against the
    // previous effect's still-pending unregister() and fail with "already registered".
    shortcutQueue = shortcutQueue.then(async () => {
      if (cancelled) return;
      for (const [combo, run] of handlers) {
        try {
          await unregister(combo).catch(() => {});
          await register(combo, (event) => {
            if (event.state === "Pressed") run();
          });
        } catch (err) {
          console.error(`Failed to register shortcut ${combo}:`, err);
        }
      }
    });

    return () => {
      cancelled = true;
      shortcutQueue = shortcutQueue.then(async () => {
        for (const [combo] of handlers) {
          await unregister(combo).catch(() => {});
        }
      });
    };
  }, [isMiniMode]);

  // Listen for shortcut events (both windows listen, only the active one acts)
  useEffect(() => {
    const unlistenText = listen("shortcut:text", () => {
      if (isMiniMode) {
        setMiniComposerTrigger((n) => n + 1);
      } else {
        fullChatInputRef.current?.focus();
      }
    });
    const unlistenMic = listen("shortcut:mic", () => {
      handleMicToggleRef.current();
    });
    return () => {
      unlistenText.then((fn) => fn());
      unlistenMic.then((fn) => fn());
    };
  }, [isMiniMode]);

  return { miniComposerTrigger, fullChatInputRef };
}
