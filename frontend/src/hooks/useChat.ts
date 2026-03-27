import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "../types";
import type { SentenceTask } from "./useAudioQueue";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const onSentenceRef = useRef<((task: SentenceTask) => void) | null>(null);
  const onAudioRef = useRef<((index: number, audio: string) => void) | null>(null);

  const sendMessage = useCallback(
    async (characterId: string, text: string) => {
      const userMsg: ChatMessage = { role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setStreamingText("");

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character_id: characterId, message: text }),
        });

        if (!res.ok) throw new Error("Chat request failed");

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let displayText = "";
        let lastExpression = "neutral";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (data.type === "text") {
                // Streaming text for display (raw from LLM, may contain tags)
                displayText += data.text;
                // Strip expression tags for display
                const cleanDisplay = displayText
                  .replace(/<<\/?[^>]*>>\s*/g, "")
                  .replace(/\[expression:\s*[^\]]+\]\s*/g, "");
                setStreamingText(cleanDisplay);
              } else if (data.type === "sentence") {
                // Per-sentence event with expression
                lastExpression = data.expression;
                onSentenceRef.current?.({
                  index: data.index,
                  expression: data.expression,
                  text: data.text,
                });
              } else if (data.type === "audio") {
                // Audio data for a sentence
                onAudioRef.current?.(data.index, data.audio);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        // Strip tags from final display text
        const cleanFull = displayText
          .replace(/<<\/?[^>]*>>\s*/g, "")
          .replace(/\[expression:\s*[^\]]+\]\s*/g, "");
        const assistantMsg: ChatMessage = {
          role: "assistant",
          text: cleanFull,
          expression: lastExpression,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText("");
        return assistantMsg;
      } catch (err) {
        console.error("Chat error:", err);
        const errorMsg: ChatMessage = {
          role: "assistant",
          text: "Sorry, I couldn't respond right now...",
          expression: "neutral",
        };
        setMessages((prev) => [...prev, errorMsg]);
        setStreamingText("");
        return errorMsg;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingText("");
  }, []);

  const setOnSentence = useCallback((cb: (task: SentenceTask) => void) => {
    onSentenceRef.current = cb;
  }, []);

  const setOnAudio = useCallback((cb: (index: number, audio: string) => void) => {
    onAudioRef.current = cb;
  }, []);

  return { messages, loading, streamingText, sendMessage, clearMessages, setOnSentence, setOnAudio };
}
