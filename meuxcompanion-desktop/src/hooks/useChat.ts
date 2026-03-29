import { useState, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { sendChat } from "../api/tauri";

interface Message {
  role: "user" | "assistant";
  content: string;
  expression?: string;
}

interface SentencePayload {
  index: number;
  text: string;
  expression: string;
}

interface AudioPayload {
  index: number;
  data: string; // base64-encoded audio
}

interface DonePayload {
  state_update: unknown;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const onSentenceRef = useRef<((data: SentencePayload) => void) | null>(null);
  const onAudioRef = useRef<
    ((index: number, data: string) => void) | null
  >(null);
  const onDoneRef = useRef<((data: DonePayload) => void) | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const cleanExpressionTags = (text: string) =>
    text
      .replace(/<<\/?[^>]*>>\s*/g, "")
      .replace(/\[expression:\s*[^\]]+\]\s*/g, "");

  const send = useCallback(
    async (characterId: string, message: string) => {
      if (isStreaming) return;
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setStreamingText("");
      setIsStreaming(true);

      let displayText = "";
      let lastExpression = "neutral";

      for (const unlisten of unlistenersRef.current) {
        unlisten();
      }
      unlistenersRef.current = [];

      const unlistenText = await listen<{ text: string }>(
        "chat:text-chunk",
        (event) => {
          displayText += event.payload.text;
          setStreamingText(cleanExpressionTags(displayText));
        },
      );

      const unlistenSentence = await listen<SentencePayload>(
        "chat:sentence",
        (event) => {
          console.log("[useChat] sentence event:", event.payload.index, event.payload.expression, event.payload.text?.slice(0, 50));
          lastExpression = event.payload.expression;
          onSentenceRef.current?.(event.payload);
        },
      );

      const unlistenAudio = await listen<AudioPayload>(
        "chat:audio",
        (event) => {
          console.log("[useChat] audio event:", event.payload.index, "bytes:", event.payload.data?.length);
          onAudioRef.current?.(event.payload.index, event.payload.data);
        },
      );

      const unlistenDone = await listen<DonePayload>(
        "chat:done",
        (event) => {
          const finalText = cleanExpressionTags(displayText);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: finalText,
              expression: lastExpression,
            },
          ]);
          setStreamingText("");
          setIsStreaming(false);
          onDoneRef.current?.(event.payload);
          for (const u of unlistenersRef.current) {
            u();
          }
          unlistenersRef.current = [];
        },
      );

      const unlistenError = await listen<{ message: string }>(
        "chat:error",
        (event) => {
          console.error("Chat error:", event.payload.message);
          setIsStreaming(false);
          for (const u of unlistenersRef.current) {
            u();
          }
          unlistenersRef.current = [];
        },
      );

      unlistenersRef.current = [
        unlistenText,
        unlistenSentence,
        unlistenAudio,
        unlistenDone,
        unlistenError,
      ];

      await sendChat(characterId, message);
    },
    [isStreaming],
  );

  const setOnSentence = useCallback(
    (cb: (data: SentencePayload) => void) => {
      onSentenceRef.current = cb;
    },
    [],
  );

  const setOnAudio = useCallback(
    (cb: (index: number, data: string) => void) => {
      onAudioRef.current = cb;
    },
    [],
  );

  const setOnDone = useCallback((cb: (data: DonePayload) => void) => {
    onDoneRef.current = cb;
  }, []);

  return {
    messages,
    setMessages,
    streamingText,
    isStreaming,
    send,
    setOnSentence,
    setOnAudio,
    setOnDone,
  };
}
