import { useState, useCallback, useRef, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { transcribeVoiceLocal } from "../api/tauri";
import { downloadWhisperModel, whisperModelStatus, type WhisperModelStatus } from "../api/whisper";

const SAMPLE_RATE = 16000;

// VAD constants
const SILENCE_THRESHOLD = 0.012;
const SILENCE_MS = 1200;
const MIN_SPEECH_CHUNKS = 4;

function float32ToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(i * 4, samples[i], true);
  }
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    // @ts-expect-error Typescript doesn't know that apply handles typed arrays directly without spreading in modern JS engines
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

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

export function useVoice() {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsWhisperDownload, setNeedsWhisperDownload] = useState(false);
  const [whisperStatus, setWhisperStatus] = useState<WhisperModelStatus | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ received: number; total: number | null } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const onResultRef = useRef<((text: string) => void) | null>(null);

  const pcmContextRef = useRef<AudioContext | null>(null);
  const pcmScriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmGainNodeRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmStreamRef = useRef<MediaStream | null>(null);

  const speechDetectedRef = useRef(false);
  const speechChunkCountRef = useRef(0);
  const lastLoudTimeRef = useRef(0);

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopPcmCapture = useCallback(() => {
    if (pcmScriptNodeRef.current) {
      pcmScriptNodeRef.current.onaudioprocess = null;
      pcmScriptNodeRef.current.disconnect();
    }
    pcmSourceRef.current?.disconnect();
    pcmGainNodeRef.current?.disconnect();
    pcmContextRef.current?.close().catch(() => {});
    pcmStreamRef.current?.getTracks().forEach((track) => track.stop());
    pcmScriptNodeRef.current = null;
    pcmSourceRef.current = null;
    pcmGainNodeRef.current = null;
    pcmContextRef.current = null;
    pcmStreamRef.current = null;
    pcmChunksRef.current = [];
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      return;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopMediaTracks();
    stopPcmCapture();
    mediaRecorderRef.current = null;
    setListening(false);
  }, [stopMediaTracks, stopPcmCapture]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      stopMediaTracks();
      stopPcmCapture();
      setListening(false);
    };
  }, [stopMediaTracks, stopPcmCapture]);

  const startSpeechRecognitionFallback = useCallback(
    (_onResult: (text: string) => void) => {
      setError("This browser can't record from the microphone. Use the desktop app to talk with your voice.");
    },
    []
  );

  const startListening = useCallback(
    async (onResult: (text: string) => void) => {
      if (listening) return;
      setError(null);

      try {
        const status = await whisperModelStatus();
        setWhisperStatus(status);
        if (!status.present || !status.loaded) {
          setNeedsWhisperDownload(true);
          setError("On-device listening needs a speech model first.");
          return;
        }
      } catch {
        setNeedsWhisperDownload(true);
        setError("On-device listening needs a speech model first.");
        return;
      }

      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        startSpeechRecognitionFallback(onResult);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        speechDetectedRef.current = false;
        speechChunkCountRef.current = 0;
        lastLoudTimeRef.current = Date.now();

        pcmStreamRef.current = stream;
        pcmChunksRef.current = [];

        const pcmCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        pcmContextRef.current = pcmCtx;

        const source = pcmCtx.createMediaStreamSource(stream);
        pcmSourceRef.current = source;

        const scriptNode = pcmCtx.createScriptProcessor(4096, 1, 1);
        pcmScriptNodeRef.current = scriptNode;

        const gainNode = pcmCtx.createGain();
        gainNode.gain.value = 0;
        pcmGainNodeRef.current = gainNode;

        let autoStopped = false;

        scriptNode.onaudioprocess = (e) => {
          if (autoStopped) return;
          const input = e.inputBuffer.getChannelData(0);
          pcmChunksRef.current.push(new Float32Array(input));

          const volume = rms(input);
          const now = Date.now();

          if (volume >= SILENCE_THRESHOLD) {
            speechChunkCountRef.current++;
            if (speechChunkCountRef.current >= MIN_SPEECH_CHUNKS) {
              speechDetectedRef.current = true;
            }
            lastLoudTimeRef.current = now;
          } else if (speechDetectedRef.current && now - lastLoudTimeRef.current >= SILENCE_MS) {
            autoStopped = true;
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state !== "inactive"
            ) {
              mediaRecorderRef.current.stop();
            }
          }
        };

        source.connect(scriptNode);
        scriptNode.connect(gainNode);
        gainNode.connect(pcmCtx.destination);

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
          stopPcmCapture();
          mediaRecorderRef.current = null;
          setListening(false);
          setError("Recording failed. Check the microphone and try again.");
        };

        recorder.onstop = async () => {
          const chunks = recordedChunksRef.current;
          recordedChunksRef.current = [];
          stopMediaTracks();
          stopPcmCapture();
          mediaRecorderRef.current = null;
          setListening(false);

          if (chunks.length === 0) return;

          try {
            const pcmData = mergePcmChunks();
            if (pcmData.length > SAMPLE_RATE / 2) {
              const pcmBase64 = float32ToBase64(pcmData);
              const text = await transcribeVoiceLocal(pcmBase64);
              if (text.trim()) {
                onResultRef.current?.(text.trim());
                return;
              }
              setError("No speech detected. Try again a little closer to the mic.");
              return;
            }
            setError("That was too short to transcribe. Try speaking a bit longer.");
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.startsWith("whisper_model_missing:")) {
              setNeedsWhisperDownload(true);
              setError("On-device listening needs a speech model first.");
              return;
            }
            setError(message || "Could not transcribe that. Try again.");
          }
        };

        function mergePcmChunks(): Float32Array {
          const allChunks = pcmChunksRef.current;
          pcmChunksRef.current = [];
          const totalLength = allChunks.reduce((sum, c) => sum + c.length, 0);
          const merged = new Float32Array(totalLength);
          let offset = 0;
          for (const chunk of allChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          return merged;
        }

        recorder.start();
        setListening(true);
      } catch (err) {
        console.error("Microphone access failed:", err);
        stopMediaTracks();
        stopPcmCapture();
        mediaRecorderRef.current = null;
        setError("Microphone access was denied. Allow it in system settings to talk out loud.");
      }
    },
    [listening, startSpeechRecognitionFallback, stopMediaTracks, stopPcmCapture]
  );

  const downloadWhisper = useCallback(async () => {
    setDownloading(true);
    setError(null);
    setDownloadProgress({ received: 0, total: null });
    try {
      await downloadWhisperModel();
      const status = await whisperModelStatus();
      setWhisperStatus(status);
      setNeedsWhisperDownload(!status.present || !status.loaded);
      setDownloadProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    whisperModelStatus()
      .then((status) => {
        if (cancelled) return;
        setWhisperStatus(status);
        setNeedsWhisperDownload(!status.present || !status.loaded);
      })
      .catch(() => {
        if (!cancelled) setNeedsWhisperDownload(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<{ received: number; total: number | null }>("whisper:download-progress", (event) => {
      setDownloadProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {
      /* browser-only vite has no Tauri events */
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    listening,
    error,
    clearError,
    needsWhisperDownload,
    whisperStatus,
    downloadProgress,
    downloading,
    downloadWhisper,
    startListening,
    stopListening,
  };
}
