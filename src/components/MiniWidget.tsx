import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useWindow } from "../hooks/useWindow";
import { MicButton } from "./MicButton";

interface MiniWidgetProps {
  avatarComponent: ReactNode;
  listening: boolean;
  speaking: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onMicToggle: () => void;
}

const MINI_WINDOW_PRESETS = [
  { label: "S", width: 240, height: 380 },
  { label: "M", width: 280, height: 420 },
  { label: "L", width: 320, height: 500 },
  { label: "XL", width: 360, height: 580 },
] as const;

export function MiniWidget({
  avatarComponent,
  listening,
  speaking,
  isStreaming,
  onSend,
  onMicToggle,
}: MiniWidgetProps) {
  const { expand } = useWindow();
  const pointerStateRef = useRef<{ x: number; y: number; dragged: boolean; active: boolean }>({
    x: 0,
    y: 0,
    dragged: false,
    active: false,
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [dockVisible, setDockVisible] = useState(false);
  const [input, setInput] = useState("");
  const [sizePresetIndex, setSizePresetIndex] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (composerOpen) {
      inputRef.current?.focus();
    }
  }, [composerOpen]);

  useEffect(() => {
    const syncPresetWithWindow = async () => {
      try {
        const size = await getCurrentWindow().innerSize();
        const matchedIndex = MINI_WINDOW_PRESETS.findIndex(
          (preset) =>
            Math.abs(preset.width - size.width) <= 20 &&
            Math.abs(preset.height - size.height) <= 20,
        );
        if (matchedIndex >= 0) {
          setSizePresetIndex(matchedIndex);
        }
      } catch (err) {
        console.error("Mini window size detection failed:", err);
      }
    };

    void syncPresetWithWindow();
  }, []);

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element && target.closest("[data-mini-interactive='true']");

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) {
      pointerStateRef.current.active = false;
      return;
    }

    pointerStateRef.current = {
      x: event.clientX,
      y: event.clientY,
      dragged: false,
      active: true,
    };
  };

  const handlePointerMoveCapture = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (!state.active || state.dragged) return;

    const distance = Math.hypot(event.clientX - state.x, event.clientY - state.y);
    if (distance < 6) return;

    state.dragged = true;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Mini drag failed:", err);
    }
  };

  const handlePointerUpCapture = () => {
    pointerStateRef.current = {
      x: 0,
      y: 0,
      dragged: false,
      active: false,
    };
  };

  const applyWindowPreset = async (nextIndex: number) => {
    const preset = MINI_WINDOW_PRESETS[nextIndex];
    setSizePresetIndex(nextIndex);
    try {
      await getCurrentWindow().setSize(new LogicalSize(preset.width, preset.height));
    } catch (err) {
      console.error("Mini resize failed:", err);
    }
  };

  const cycleWindowSize = () => {
    const nextIndex = (sizePresetIndex + 1) % MINI_WINDOW_PRESETS.length;
    void applyWindowPreset(nextIndex);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setInput("");
    setComposerOpen(false);
  };

  const showDock = dockVisible || composerOpen || listening || isStreaming;

  const handleExpand = async () => {
    await expand();
  };

  const toggleComposer = () => {
    if (!composerOpen && sizePresetIndex === 0) {
      void applyWindowPreset(1);
    }
    setComposerOpen((prev) => {
      const next = !prev;
      if (!next) {
        setInput("");
      }
      return next;
    });
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setInput("");
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      closeComposer();
    }
  };

  return (
    <div
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={handlePointerUpCapture}
      onMouseEnter={() => setDockVisible(true)}
      onMouseLeave={() => setDockVisible(false)}
      onFocus={() => setDockVisible(true)}
      onBlur={() => setDockVisible(false)}
      onKeyDown={handleRootKeyDown}
      tabIndex={-1}
      className="relative"
      style={{
        width: "100vw",
        height: "100vh",
        cursor: "default",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {avatarComponent}

      {composerOpen && (
        <form
          data-mini-interactive="true"
          onSubmit={handleSubmit}
          className="absolute bottom-20 left-1/2 z-30 flex w-[min(88vw,320px)] -translate-x-1/2 items-center gap-2 rounded-[1.75rem] border border-white/90 bg-white/92 p-2 shadow-[0_20px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Send a quick message..."
            className="min-w-0 flex-1 rounded-full bg-slate-50 px-4 py-3 text-[14px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:bg-white"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-md shadow-blue-500/25 transition-all hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400"
            title="Send message"
          >
            <svg className="ml-0.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      )}

      <div
        className={`absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/80 bg-white/62 px-2 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl transition-all duration-300 ${
          showDock ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        data-mini-interactive="true"
      >
        <button
          type="button"
          onClick={cycleWindowSize}
          className="rounded-full bg-white/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition-all hover:bg-white hover:text-slate-800"
          title="Cycle mini window size"
        >
          {MINI_WINDOW_PRESETS[sizePresetIndex].label}
        </button>

        <button
          type="button"
          onClick={toggleComposer}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
            isStreaming
              ? "bg-blue-500 text-white shadow-md shadow-blue-500/30"
              : composerOpen
              ? "bg-blue-500 text-white shadow-md shadow-blue-500/30"
              : "bg-white/80 text-slate-600 hover:bg-white hover:text-slate-800"
          }`}
          title={isStreaming ? "Waiting for reply" : "Text chat"}
        >
          {isStreaming ? (
            <span className="h-4 w-4 rounded-full border-2 border-white/35 border-t-white animate-spin" />
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 6l2.4-3.2A8.96 8.96 0 013 11a9 9 0 1118 0 9 9 0 01-9 9 8.96 8.96 0 01-4.6-1.2L3 20z" />
            </svg>
          )}
        </button>

        <div className="rounded-full bg-white/80">
          <MicButton listening={listening} onToggle={onMicToggle} />
        </div>

        <button
          type="button"
          onClick={handleExpand}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-600 transition-all hover:bg-white hover:text-slate-800"
          title="Open full app"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 3H5a2 2 0 00-2 2v3m16 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M5 16v3a2 2 0 002 2h3" />
          </svg>
        </button>
      </div>

      {(speaking || listening) && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/80 bg-white/88 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm backdrop-blur-md">
          <span className={`h-2 w-2 rounded-full ${listening ? "bg-red-500 mic-pulse-ring" : "bg-blue-400 animate-ping"}`} />
          <span>{listening ? "Listening" : "Speaking"}</span>
        </div>
      )}
    </div>
  );
}
