import { useRef, useCallback, useState, useEffect } from "react";
import { useAudioAnalyser } from "./useAudioAnalyser";

export interface SentenceTask {
  index: number;
  expression: string;
  text: string;
}

interface QueueEntry {
  task: SentenceTask;
  audio: string | null;
}

export function useAudioQueue() {
  const [speaking, setSpeaking] = useState(false);
  const entriesRef = useRef<Map<number, QueueEntry>>(new Map());
  const nextToPlayRef = useRef(0);
  const playingRef = useRef(false);
  const onExpressionChangeRef = useRef<((expr: string) => void) | null>(null);
  const neutralExpressionRef = useRef("neutral");
  const { connectAudio, getAudioLevels, disconnect } = useAudioAnalyser();

  // Store connect/disconnect in refs to avoid stale closures
  const connectRef = useRef(connectAudio);
  const disconnectRef = useRef(disconnect);
  useEffect(() => { connectRef.current = connectAudio; }, [connectAudio]);
  useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);

  const playAudioChunk = useCallback(
    (base64Audio: string): Promise<void> => {
      return new Promise((resolve) => {
        disconnectRef.current();

        // Convert base64 to Blob URL to avoid keeping large strings in JS memory
        const byteChars = atob(base64Audio);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: "audio/mp3" });
        const blobUrl = URL.createObjectURL(blob);

        const audio = new Audio(blobUrl);
        audio.crossOrigin = "anonymous";

        const cleanup = () => {
          disconnectRef.current();
          URL.revokeObjectURL(blobUrl);
          audio.oncanplay = null;
          audio.onended = null;
          audio.onerror = null;
          audio.src = "";
          audio.load(); // Release internal audio resources
        };

        audio.oncanplay = () => {
          connectRef.current(audio);
        };

        audio.onended = () => {
          cleanup();
          resolve();
        };

        audio.onerror = () => {
          cleanup();
          resolve();
        };

        audio.play().catch(() => {
          const resumePlay = () => {
            audio.play().catch(() => {});
            document.removeEventListener("click", resumePlay);
            document.removeEventListener("keydown", resumePlay);
          };
          document.addEventListener("click", resumePlay, { once: true });
          document.addEventListener("keydown", resumePlay, { once: true });
        });
      });
    },
    []
  );

  const processQueue = useCallback(async () => {
    if (playingRef.current) return;

    const entries = entriesRef.current;
    const nextIdx = nextToPlayRef.current;
    const entry = entries.get(nextIdx);

    if (!entry || entry.audio === null) return;

    playingRef.current = true;
    setSpeaking(true);

    // Play all ready entries sequentially
    while (true) {
      const idx = nextToPlayRef.current;
      const e = entriesRef.current.get(idx);
      if (!e || e.audio === null) break;

      // Set expression
      onExpressionChangeRef.current?.(e.task.expression);

      // Play audio
      await playAudioChunk(e.audio);

      // Advance
      entriesRef.current.delete(idx);
      nextToPlayRef.current = idx + 1;
    }

    playingRef.current = false;
    setSpeaking(false);
    // Reset to neutral after all sentences finish
    onExpressionChangeRef.current?.(neutralExpressionRef.current);
  }, [playAudioChunk]);

  // Store processQueue in ref so addAudio always has latest
  const processQueueRef = useRef(processQueue);
  useEffect(() => { processQueueRef.current = processQueue; }, [processQueue]);

  const addSentence = useCallback((task: SentenceTask) => {
    entriesRef.current.set(task.index, {
      task,
      audio: null,
    });
  }, []);

  const addAudio = useCallback((index: number, audio: string) => {
    const entry = entriesRef.current.get(index);
    if (entry) {
      entry.audio = audio;
    } else {
      entriesRef.current.set(index, {
        task: { index, expression: "neutral", text: "" },
        audio,
      });
    }
    // Try to play if not already playing
    if (!playingRef.current) {
      processQueueRef.current();
    }
  }, []);

  const clearQueue = useCallback(() => {
    entriesRef.current.clear();
    nextToPlayRef.current = 0;
    playingRef.current = false;
    setSpeaking(false);
  }, []);

  const setOnExpressionChange = useCallback((cb: (expr: string) => void) => {
    onExpressionChangeRef.current = cb;
  }, []);

  const setNeutralExpression = useCallback((expr: string) => {
    neutralExpressionRef.current = expr;
  }, []);

  return {
    speaking,
    addSentence,
    addAudio,
    clearQueue,
    getAudioLevels,
    setOnExpressionChange,
    setNeutralExpression,
  };
}
