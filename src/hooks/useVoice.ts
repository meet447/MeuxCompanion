import { useState, useCallback, useRef } from "react";
import { useAudioAnalyser } from "./useAudioAnalyser";
import { transcribeVoice } from "../api/tauri";

function pickRecordingMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];

  for (const mimeType of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read voice blob"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read voice blob"));
    reader.readAsDataURL(blob);
  });
}

export function useVoice() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const onResultRef = useRef<((text: string) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { connectAudio, getAudioLevels, disconnect } = useAudioAnalyser();

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const startSpeechRecognitionFallback = useCallback(
    (onResult: (text: string) => void) => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error("Speech recognition not supported");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
        setListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event?.error ?? "unknown");
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    },
    []
  );

  const startListening = useCallback(
    async (onResult: (text: string) => void) => {
      if (listening) return;

      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        startSpeechRecognitionFallback(onResult);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = pickRecordingMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;
        recordedChunksRef.current = [];
        onResultRef.current = onResult;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          stopMediaTracks();
          mediaRecorderRef.current = null;
          setListening(false);
        };

        recorder.onstop = async () => {
          const chunks = recordedChunksRef.current;
          recordedChunksRef.current = [];
          stopMediaTracks();
          mediaRecorderRef.current = null;
          setListening(false);

          if (chunks.length === 0) return;

          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
            const audioBase64 = await blobToBase64(blob);
            const transcript = await transcribeVoice(
              audioBase64,
              blob.type || recorder.mimeType || mimeType || "audio/webm",
            );

            if (transcript.trim()) {
              onResultRef.current?.(transcript.trim());
            }
          } catch (err) {
            console.error("Voice transcription error:", err);
          }
        };

        recorder.start();
        setListening(true);
      } catch (err) {
        console.error("Microphone access failed, trying speech recognition fallback:", err);
        stopMediaTracks();
        mediaRecorderRef.current = null;
        startSpeechRecognitionFallback(onResult);
      }
    },
    [listening, startSpeechRecognitionFallback, stopMediaTracks]
  );

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      return;
    }
    recognitionRef.current?.stop();
    stopMediaTracks();
    setListening(false);
  }, [stopMediaTracks]);

  const playAudio = useCallback(
    (base64Audio: string): Promise<void> => {
      return new Promise((resolve) => {
        // Disconnect previous audio element
        disconnect();

        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        // Need crossOrigin for AudioContext to work with data URIs in some browsers
        audio.crossOrigin = "anonymous";
        audioRef.current = audio;

        audio.oncanplay = () => {
          // Connect to analyser once audio is ready
          connectAudio(audio);
        };

        audio.onplay = () => {
          setSpeaking(true);
        };

        audio.onended = () => {
          setSpeaking(false);
          disconnect();
          resolve();
        };

        audio.onerror = () => {
          setSpeaking(false);
          disconnect();
          resolve();
        };

        audio.play().catch(() => {
          // Autoplay blocked — wait for user interaction then retry
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

  const fetchAndPlayTTS = useCallback(
    async (text: string, voice: string): Promise<void> => {
      setTtsLoading(true);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
        });

        if (!res.ok) return;

        const data = await res.json();
        if (data.audio) {
          await playAudio(data.audio);
        }
      } catch (err) {
        console.error("TTS error:", err);
      } finally {
        setTtsLoading(false);
      }
    },
    [playAudio]
  );

  return {
    listening,
    speaking,
    ttsLoading,
    startListening,
    stopListening,
    fetchAndPlayTTS,
    getAudioLevels,
  };
}
