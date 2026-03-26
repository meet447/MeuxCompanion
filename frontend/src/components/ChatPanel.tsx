import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../types";
import { MicButton } from "./MicButton";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  characterName: string;
  onSend: (text: string) => void;
  listening: boolean;
  onMicToggle: () => void;
}

export function ChatPanel({
  messages,
  loading,
  characterName,
  onSend,
  listening,
  onMicToggle,
}: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="w-[400px] flex flex-col bg-stone-900 border-l border-stone-800/60">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-stone-500 text-center mt-8">
            <p>Start chatting with {characterName}!</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                msg.role === "user"
                  ? "bg-amber-800/60 text-amber-50"
                  : "bg-stone-800 text-stone-100"
              }`}
            >
              {msg.role === "assistant" && (
                <span className="text-xs text-amber-400/80 font-medium block mb-1">
                  {characterName}
                  {msg.expression && (
                    <span className="ml-1 text-stone-500">({msg.expression})</span>
                  )}
                </span>
              )}
              <p className="text-sm leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-stone-800 text-stone-400 rounded-2xl px-4 py-2">
              <span className="animate-pulse">typing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-stone-800/60 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-stone-800 text-stone-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-700/50 placeholder-stone-500"
          disabled={loading}
        />
        <MicButton listening={listening} onToggle={onMicToggle} />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-amber-800/70 hover:bg-amber-700/70 disabled:bg-stone-800 disabled:cursor-not-allowed text-amber-50 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
