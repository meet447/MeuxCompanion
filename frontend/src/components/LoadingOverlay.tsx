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
      color: "text-amber-400",
    },
    model: {
      icon: "🎭",
      color: "text-blue-400",
    },
    chat: {
      icon: "💬",
      color: "text-purple-400",
    },
    tts: {
      icon: "🔊",
      color: "text-green-400",
    },
  };

  const { icon, color } = variantStyles[variant];

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-3">
        <div className={`text-4xl animate-spin ${color}`}>{icon}</div>
        <div className="text-amber-200 font-medium">{message}</div>
        {subMessage && (
          <div className="text-stone-400 text-sm animate-pulse">{subMessage}</div>
        )}
        <div className="flex gap-1 mt-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
});

interface PulsingDotProps {
  color?: string;
}

export const PulsingDot = memo(function PulsingDot({ color = "bg-amber-400" }: PulsingDotProps) {
  return <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />;
});

export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
    </div>
  );
});