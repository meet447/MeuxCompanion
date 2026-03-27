import { memo } from "react";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  subMessage?: string;
  variant?: "default" | "model" | "chat" | "tts";
}

export const LoadingOverlay = memo(function LoadingOverlay({
  visible,
  message = "Loading...",
  subMessage,
  variant = "default",
}: LoadingOverlayProps) {
  if (!visible) return null;

  const variantStyles = {
    default: {
      icon: "⟳",
      color: "text-blue-500",
    },
    model: {
      icon: "🎭",
      color: "text-indigo-500",
    },
    chat: {
      icon: "💬",
      color: "text-sky-500",
    },
    tts: {
      icon: "🔊",
      color: "text-emerald-500",
    },
  };

  const { color } = variantStyles[variant];

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-md z-50">
      <div className="flex flex-col items-center gap-4 bg-white/60 p-8 rounded-3xl shadow-lg shadow-blue-900/5 ring-1 ring-slate-200/50">
        <svg
          className={`w-12 h-12 animate-spin ${color}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <div className="text-slate-700 font-semibold mt-1">{message}</div>
        {subMessage && (
          <div className="text-slate-500 text-sm animate-pulse">{subMessage}</div>
        )}
        <div className="flex gap-1 mt-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
});

interface PulsingDotProps {
  color?: string;
}

export const PulsingDot = memo(function PulsingDot({ color = "bg-blue-400" }: PulsingDotProps) {
  return <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />;
});

export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
    </div>
  );
});