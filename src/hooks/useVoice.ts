import { useState, useCallback, useRef } from "react";
import { useAudioAnalyser } from "./useAudioAnalyser";

export function useVoice() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { connectAudio, getAudioLevels, disconnect } = useAudioAnalyser();

  const startListening = useCallback(
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

      recognition.onerror = () => {
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

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

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
