import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../types";
import { MicButton } from "./MicButton";
import { TypingIndicator } from "./LoadingOverlay";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  streamingText: string;
  characterName: string;
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  listening: boolean;
  onMicToggle: () => void;
  ttsLoading?: boolean;
  speaking?: boolean;
}

export function ChatPanel({
  messages,
  loading,
  streamingText,
  characterName,
  onSend,
  onTypingChange,
  listening,
  onMicToggle,
  ttsLoading = false,
  speaking = false,
}: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, typingTimeoutRef]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    onTypingChange(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onTypingChange(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    onSend(input.trim());
    setInput("");
  };

  const isProcessing = loading || ttsLoading;

  return (
    <div className="flex-1 flex flex-col bg-transparent relative h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {messages.length === 0 && !streamingText && (
          <div className="text-slate-400 text-center mt-12 flex flex-col items-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-300 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium">Say hello to {characterName}!</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {msg.role === "user" && <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 px-2">You</span>}
            <div
              className={`max-w-[85%] rounded-3xl px-5 py-3 shadow-sm ${
                msg.role === "user"
                  ? "bg-slate-100/80 text-slate-800 rounded-tr-md border border-slate-200/50"
                  : "bg-white text-slate-700 rounded-tl-md border border-blue-50/80 shadow-blue-900/5"
              }`}
            >
              {msg.role === "assistant" && (
                <span className="text-[11px] text-blue-500 font-semibold tracking-wide uppercase block mb-1">
                  {characterName}
                  {msg.expression && (
                    <span className="ml-1 text-slate-400 font-normal capitalize">({msg.expression})</span>
                  )}
                </span>
              )}
              <p className="text-[15px] leading-relaxed break-words">{msg.text}</p>
            </div>
          </div>
        ))}

        {/* Streaming text */}
        {streamingText && (
          <div className="flex flex-col items-start">
            <div className="max-w-[85%] rounded-3xl rounded-tl-md px-5 py-3 bg-white border border-blue-50/80 shadow-sm shadow-blue-900/5 text-slate-700">
              <span className="text-[11px] text-blue-500 font-semibold tracking-wide uppercase block mb-1">
                {characterName}
              </span>
              <p className="text-[15px] leading-relaxed text-slate-700">
                {streamingText}
                <span className="animate-pulse text-blue-400 ml-1">●</span>
              </p>
            </div>
          </div>
        )}

        {/* Loading indicator - thinking */}
        {loading && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-50 shadow-sm rounded-3xl rounded-tl-md px-5 py-4">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wide">Thinking</span>
                <TypingIndicator />
              </div>
            </div>
          </div>
        )}

        {/* TTS Generating indicator */}
        {ttsLoading && !loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-50 shadow-sm rounded-3xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                </div>
                <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Speaking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-10" />
      </div>

      {/* Status Bar */}
      {(speaking || ttsLoading) && (
        <div className="px-4 py-1.5 bg-blue-50/50 backdrop-blur-sm border-t border-blue-100/50 flex items-center justify-between text-[10px] text-blue-600/70 font-medium uppercase tracking-widest z-10">
          <div className="flex items-center gap-2">
            {speaking && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />}
            <span>{speaking ? "Playing audio" : "Generating voice"}</span>
          </div>
          <span className="opacity-70">{characterName}</span>
        </div>
      )}

      {/* Input Form */}
      <div className="w-full bg-white/80 backdrop-blur-md pb-4 pt-2">
      <form
        onSubmit={handleSubmit}
        className="px-4 flex items-center gap-2"
      >
        <div className="flex-1 relative group">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Say something..."
            className="w-full bg-slate-50 hover:bg-slate-100/80 text-slate-700 rounded-full pl-5 pr-12 py-3.5 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 disabled:opacity-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            disabled={isProcessing}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <MicButton listening={listening} onToggle={onMicToggle} />
          </div>
        </div>
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none text-white rounded-full w-12 h-12 flex items-center justify-center transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0"
        >
          {isProcessing ? (
             <span className="w-4 h-4 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </form>
      </div>
    </div>
  );
}