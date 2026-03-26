import { useState, useCallback } from "react";
import type { ChatMessage } from "../types";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(
    async (characterId: string, text: string) => {
      const userMsg: ChatMessage = { role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character_id: characterId, message: text }),
        });

        if (!res.ok) throw new Error("Chat request failed");

        const data = await res.json();
        const assistantMsg: ChatMessage = {
          role: "assistant",
          text: data.text,
          emotion: data.emotion,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        return assistantMsg;
      } catch (err) {
        console.error("Chat error:", err);
        const errorMsg: ChatMessage = {
          role: "assistant",
          text: "Sorry, I couldn't respond right now...",
          emotion: "sad",
        };
        setMessages((prev) => [...prev, errorMsg]);
        return errorMsg;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, loading, sendMessage, clearMessages };
}
