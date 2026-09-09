import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getChatHistory, clearChat } from "../api/tauri";
import { sessionMessagesToChat } from "../lib/sessionHistory";
import { useChat } from "./useChat";
import { unlockAudioPlayback, useAudioQueue } from "./useAudioQueue";
import { useVoice } from "./useVoice";

/** Owns conversation history, chat/voice actions, and the speech event pipeline. */
export function useCompanionSession({ selectedCharId, expressionsConfigured, agentReady, openSettings, setCurrentExpression }: {
  selectedCharId: string;
  expressionsConfigured: boolean | null;
  agentReady: boolean;
  openSettings: () => void;
  setCurrentExpression: (expression: string) => void;
}) {
  const historyGenerationRef = useRef(0);
  const {
    setMessages,
    timeline,
    isStreaming,
    streamingText,
    send,
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    toolCalls,
    handleConfirm,
    cancel,
    error: chatError,
    clearError: clearChatError,
  } = useChat();
  const {
    listening,
    startListening,
    stopListening,
    error: voiceError,
    clearError: clearVoiceError,
    needsWhisperDownload,
    downloadProgress,
    downloading,
    downloadWhisper,
  } = useVoice();
  const {
    speaking,
    speakingSentence,
    speechSessionActive,
    beginRequest,
    addSentence,
    addAudio,
    failAudio,
    markTextDone,
    failRequest,
    clearQueue,
    getAudioLevels,
    setOnExpressionChange,
    setNeutralExpression,
  } = useAudioQueue();

  const loadHistory = useCallback(
    async (characterId: string) => {
      const generation = ++historyGenerationRef.current;
      try {
        const history = await getChatHistory(characterId);
        if (generation !== historyGenerationRef.current) return;
        setMessages(sessionMessagesToChat(history));
      } catch (err) {
        console.error("History load error:", err);
      }
    },
    [setMessages]
  );

  const clearMessages = useCallback(
    async (characterId?: string) => {
      if (characterId) {
        await clearChat(characterId).catch(console.error);
      }
      setMessages([]);
    },
    [setMessages]
  );

  // Wire audio queue events to model
  useEffect(() => {
    setOnExpressionChange((expr: string) => {
      setCurrentExpression(expr);
    });
  }, [setOnExpressionChange, setCurrentExpression]);

  // Wire chat sentence events to audio queue
  useEffect(() => {
    setOnSentence((payload) => {
      addSentence(payload.request_id, payload);
    });
    setOnAudio((payload) => {
      addAudio(
        payload.request_id,
        payload.index,
        payload.data,
        payload.engine === "system" ? "system" : "remote",
      );
    });
    setOnAudioFailed((payload) => {
      failAudio(payload.request_id, payload.index);
    });
    setOnDone((payload) => {
      markTextDone(payload.request_id);
    });
    setOnError((requestId) => {
      if (failRequest(requestId) === "accepted") clearQueue();
    });
  }, [
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    addSentence,
    addAudio,
    failAudio,
    markTextDone,
    failRequest,
    clearQueue,
  ]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId || !expressionsConfigured) return;
      if (!agentReady) {
        openSettings();
        return;
      }
      unlockAudioPlayback();
      const requestId = crypto.randomUUID();
      beginRequest(requestId);
      await send(selectedCharId, text, requestId);
    },
    [selectedCharId, expressionsConfigured, agentReady, send, beginRequest, openSettings]
  );

  useEffect(() => {
    const unlock = () => unlockAudioPlayback();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!selectedCharId) return;
    const generation = ++historyGenerationRef.current;
    setMessages([]);
    void (async () => {
      try {
        const history = await getChatHistory(selectedCharId);
        if (generation !== historyGenerationRef.current) return;
        setMessages(sessionMessagesToChat(history));
      } catch (err) {
        console.error("History load error:", err);
      }
    })();
  }, [selectedCharId, setMessages]);

  // Reload chat history when switching from mini mode back to full mode
  useEffect(() => {
    const unlisten = listen<{ mode: string }>("app:mode-changed", (event) => {
      if (event.payload.mode === "full" && selectedCharId) {
        loadHistory(selectedCharId);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedCharId, loadHistory]);

  const pendingToolConfirm = toolCalls.find((tc) => tc.status === "awaiting_confirmation") ?? null;

  const handleMicToggle = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening((transcript) => {
        handleSend(transcript);
      });
    }
  }, [listening, startListening, stopListening, handleSend]);

  return { setMessages, timeline, isStreaming, streamingText, toolCalls, handleConfirm, cancel,
    chatError, clearChatError, listening, voiceError, clearVoiceError, needsWhisperDownload,
    downloadProgress, downloading, downloadWhisper, speaking, speakingSentence, speechSessionActive,
    clearQueue, getAudioLevels, setNeutralExpression, loadHistory, clearMessages,
    handleSend, handleMicToggle, pendingToolConfirm };
}
