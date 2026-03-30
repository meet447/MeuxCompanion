import { useEffect, useState, useRef } from "react";
import type { ChatMessage } from "../types";

interface Props {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
}

interface VisibleMessage {
  key: string;
  role: "user" | "assistant";
  text: string;
  fading: boolean;
}

const FADE_AFTER_MS = 8000;
const MAX_VISIBLE = 3;

export function MiniFloatingMessages({ messages, streamingText, isStreaming }: Props) {
  const [visible, setVisible] = useState<VisibleMessage[]>([]);
  const fadeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastCountRef = useRef(0);

  // When new messages arrive, show them and set up fade timers
  useEffect(() => {
    const count = messages.length;
    if (count <= lastCountRef.current && count > 0) {
      lastCountRef.current = count;
      return;
    }
    lastCountRef.current = count;

    const recent = messages.slice(-MAX_VISIBLE);
    const newVisible: VisibleMessage[] = recent.map((msg, i) => ({
      key: `msg-${count - recent.length + i}`,
      role: msg.role,
      text: msg.text,
      fading: false,
    }));

    setVisible(newVisible);

    // Clear old timers
    for (const timer of fadeTimers.current.values()) {
      clearTimeout(timer);
    }
    fadeTimers.current.clear();

    // Set fade timers for each message
    for (const msg of newVisible) {
      const timer = setTimeout(() => {
        setVisible((prev) =>
          prev.map((m) => (m.key === msg.key ? { ...m, fading: true } : m)),
        );
        // Remove after fade animation completes
        setTimeout(() => {
          setVisible((prev) => prev.filter((m) => m.key !== msg.key));
        }, 500);
      }, FADE_AFTER_MS);
      fadeTimers.current.set(msg.key, timer);
    }

    return () => {
      for (const timer of fadeTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, [messages.length]);

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "..." : text;

  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-1.5 pointer-events-none">
      {visible.map((msg) => (
        <div
          key={msg.key}
          className={`transition-all duration-500 ${
            msg.fading ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"
          } ${msg.role === "user" ? "self-end" : "self-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[11px] leading-relaxed backdrop-blur-xl shadow-sm ${
              msg.role === "user"
                ? "bg-blue-500/80 text-white/95 rounded-tr-sm"
                : "bg-white/75 text-slate-700 border border-white/40 rounded-tl-sm"
            }`}
          >
            {truncate(msg.text, 100)}
          </div>
        </div>
      ))}

      {/* Streaming preview */}
      {isStreaming && streamingText && (
        <div className="self-start transition-all duration-200 opacity-90">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-1.5 text-[11px] leading-relaxed bg-white/75 text-slate-700 border border-white/40 backdrop-blur-xl shadow-sm">
            {truncate(streamingText, 80)}
            <span className="inline-flex gap-0.5 ml-1 align-middle">
              <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
              <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:0.15s]" />
              <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:0.3s]" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
