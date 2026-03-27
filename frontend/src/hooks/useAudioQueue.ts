import { useRef, useCallback, useState } from "react";
import { useAudioAnalyser } from "./useAudioAnalyser";

export interface SentenceTask {
  index: number;
  expression: string;
  text: string;
}

interface QueueEntry {
  task: SentenceTask;
  audio: string | null;  // null = waiting for audio
  resolved: boolean;
}

export function useAudioQueue() {
  const [speaking, setSpeaking] = useState(false);
  const entriesRef = useRef<Map<number, QueueEntry>>(new Map());
  const nextToPlayRef = useRef(0);
  const playingRef = useRef(false);
  const onExpressionChangeRef = useRef<((expr: string) => void) | null>(null);
  const { connectAudio, getAudioLevels, disconnect } = useAudioAnalyser();

  const tryPlayNext = useCallback(async () => {
    if (playingRef.current) return;

    const entries = entriesRef.current;
    const nextIdx = nextToPlayRef.current;
    const entry = entries.get(nextIdx);

    // Need both the sentence AND its audio to play
    if (!entry || entry.audio === null) return;

    playingRef.current = true;
    setSpeaking(true);

    // Set expression for this sentence
    onExpressionChangeRef.current?.(entry.task.expression);

    // Play the audio
    if (entry.audio) {
      await playAudioChunk(entry.audio);
    }

    // Clean up and move to next
    entries.delete(nextIdx);
    nextToPlayRef.current = nextIdx + 1;
    playingRef.current = false;

    // Check if more sentences are ready
    const nextEntry = entries.get(nextToPlayRef.current);
    if (nextEntry && nextEntry.audio !== null) {
      tryPlayNext();
    } else {
      setSpeaking(false);
    }
  }, []);

  const playAudioChunk = useCallback(
    (base64Audio: string): Promise<void> => {
      return new Promise((resolve) => {
        disconnect();

        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audio.crossOrigin = "anonymous";

        audio.oncanplay = () => {
          connectAudio(audio);
        };

        audio.onended = () => {
          disconnect();
          resolve();
        };

        audio.onerror = () => {
          disconnect();
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
    [connectAudio, disconnect]
  );

  const addSentence = useCallback(
    (task: SentenceTask) => {
      entriesRef.current.set(task.index, {
        task,
        audio: null,  // waiting for audio
        resolved: false,
      });
    },
    []
  );

  const addAudio = useCallback(
    (index: number, audio: string) => {
      const entry = entriesRef.current.get(index);
      if (entry) {
        entry.audio = audio;
        // Try to play if this is the next in line
        if (index === nextToPlayRef.current && !playingRef.current) {
          tryPlayNext();
        }
      } else {
        // Audio arrived before sentence (unlikely but handle it)
        entriesRef.current.set(index, {
          task: { index, expression: "neutral", text: "" },
          audio,
          resolved: false,
        });
      }
    },
    [tryPlayNext]
  );

  const clearQueue = useCallback(() => {
    entriesRef.current.clear();
    nextToPlayRef.current = 0;
    playingRef.current = false;
    setSpeaking(false);
  }, []);

  const setOnExpressionChange = useCallback((cb: (expr: string) => void) => {
    onExpressionChangeRef.current = cb;
  }, []);

  return {
    speaking,
    addSentence,
    addAudio,
    clearQueue,
    getAudioLevels,
    setOnExpressionChange,
  };
}
