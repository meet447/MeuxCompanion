import { useState, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { sendChat, confirmToolCall } from "../api/tauri";
import type { ToolCallStatus } from "../components/ToolCallBubble";

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

interface ToolCallStartPayload {
  request_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

interface ToolCallResultPayload {
  request_id: string;
  tool_name: string;
  result: string;
  success: boolean;
}

interface ToolConfirmPayload {
  request_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  description: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallStatus[]>([]);

  const onSentenceRef = useRef<((data: SentencePayload) => void) | null>(null);
  const onAudioRef = useRef<
    ((index: number, data: string) => void) | null
  >(null);
  const onDoneRef = useRef<((data: DonePayload) => void) | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const cleanExpressionTags = (text: string) =>
    text
      .replace(/<<\/?[^>]*>>\s*/g, "")
      .replace(/\[(?:expression:\s*)?[a-zA-Z0-9_\-]+\]\s*/g, "");

  const handleConfirm = useCallback(
    async (requestId: string, approved: boolean) => {
      await confirmToolCall(requestId, approved);
      // Update status from awaiting_confirmation
      setToolCalls((prev) =>
        prev.map((tc) =>
          tc.requestId === requestId
            ? {
                ...tc,
                status: approved ? ("running" as const) : ("failed" as const),
                result: approved ? undefined : "User denied this action.",
              }
            : tc,
        ),
      );
    },
    [],
  );

  const send = useCallback(
    async (characterId: string, message: string) => {
      if (isStreaming) return;
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setStreamingText("");
      setIsStreaming(true);
      setToolCalls([]);

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

      // Tool events
      const unlistenToolStart = await listen<ToolCallStartPayload>(
        "chat:tool-call-start",
        (event) => {
          const { request_id, tool_name, arguments: args } = event.payload;
          setToolCalls((prev) => [
            ...prev,
            {
              requestId: request_id,
              toolName: tool_name,
              arguments: args,
              status: "running",
            },
          ]);
        },
      );

      const unlistenToolResult = await listen<ToolCallResultPayload>(
        "chat:tool-call-result",
        (event) => {
          const { request_id, result, success } = event.payload;
          setToolCalls((prev) =>
            prev.map((tc) =>
              tc.requestId === request_id
                ? {
                    ...tc,
                    status: success ? "completed" : "failed",
                    result,
                  }
                : tc,
            ),
          );
        },
      );

      const unlistenToolConfirm = await listen<ToolConfirmPayload>(
        "chat:tool-confirm",
        (event) => {
          const { request_id, tool_name, arguments: args } = event.payload;
          setToolCalls((prev) => [
            ...prev,
            {
              requestId: request_id,
              toolName: tool_name,
              arguments: args,
              status: "awaiting_confirmation",
            },
          ]);
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
          // Clean up most listeners, keep audio alive for late TTS
          unlistenText();
          unlistenSentence();
          unlistenDone();
          unlistenError();
          unlistenToolStart();
          unlistenToolResult();
          unlistenToolConfirm();
          // Keep only audio listener in the ref for cleanup on next send
          unlistenersRef.current = [unlistenAudio];
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
        unlistenToolStart,
        unlistenToolResult,
        unlistenToolConfirm,
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
    toolCalls,
    handleConfirm,
  };
}
