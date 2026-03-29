import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWindow } from "../hooks/useWindow";

interface MiniWidgetProps {
  avatarComponent: ReactNode;
}

export function MiniWidget({ avatarComponent }: MiniWidgetProps) {
  const { expand } = useWindow();
  const pointerStateRef = useRef<{ x: number; y: number; dragged: boolean }>({
    x: 0,
    y: 0,
    dragged: false,
  });

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStateRef.current = {
      x: event.clientX,
      y: event.clientY,
      dragged: false,
    };
  };

  const handlePointerMoveCapture = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (state.dragged) return;

    const distance = Math.hypot(event.clientX - state.x, event.clientY - state.y);
    if (distance < 6) return;

    state.dragged = true;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Mini drag failed:", err);
    }
  };

  const handleClick = async () => {
    if (pointerStateRef.current.dragged) {
      pointerStateRef.current.dragged = false;
      return;
    }
    await expand();
  };

  return (
    <div
      onClick={handleClick}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      style={{
        width: "100vw",
        height: "100vh",
        cursor: "pointer",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {avatarComponent}
    </div>
  );
}
