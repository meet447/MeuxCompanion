import { useState, useRef, useEffect, useCallback } from "react";
import { MicButton } from "./MicButton";

interface ChatInputFormProps {
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  listening: boolean;
  onMicToggle: () => void;
  isProcessing: boolean;
  loading: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function ChatInputForm({
  onSend,
  onTypingChange,
  listening,
  onMicToggle,
  isProcessing,
  loading,
  inputRef: externalInputRef,
}: ChatInputFormProps) {
  const [input, setInput] = useState("");
  const typingTimeoutRef = useRef<number | null>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || loading) return;
      onTypingChange(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onSend(input.trim());
      setInput("");
      inputRef.current?.focus();
    },
    [input, loading, onSend, onTypingChange]
  );

  return (
    <div className="w-full bg-white/90 backdrop-blur-md pb-4 pt-2 border-t border-slate-100/50">
      <form onSubmit={handleSubmit} className="px-4 flex items-center gap-2">
        <div className="flex-1 relative group">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Say something..."
            className="w-full bg-slate-50 hover:bg-slate-100/80 text-slate-700 rounded-2xl pl-5 pr-12 py-3 text-[14px] outline-none transition-all placeholder-slate-400 border border-slate-100 disabled:opacity-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-200"
            disabled={isProcessing}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <MicButton listening={listening} onToggle={onMicToggle} />
          </div>
        </div>
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none text-white rounded-2xl w-11 h-11 flex items-center justify-center transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0"
        >
          {isProcessing ? (
            <span className="w-4 h-4 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
