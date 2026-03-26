import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "../types";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const onExpressionRef = useRef<((expr: string) => void) | null>(null);

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
        let fullText = "";
        let expression = "neutral";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (data.type === "expression") {
                expression = data.expression;
                onExpressionRef.current?.(expression);
              } else if (data.type === "text") {
                fullText += data.text;
                setStreamingText(fullText);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        const assistantMsg: ChatMessage = {
          role: "assistant",
          text: fullText,
          expression,
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

  const setOnExpression = useCallback((cb: (expr: string) => void) => {
    onExpressionRef.current = cb;
  }, []);

  return { messages, loading, streamingText, sendMessage, clearMessages, setOnExpression };
}
