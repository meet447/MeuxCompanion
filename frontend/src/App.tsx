import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { CharacterSelect } from "./components/CharacterSelect";
import { useChat } from "./hooks/useChat";
import { useVoice } from "./hooks/useVoice";
import type { Character, ModelInfo } from "./types";

// Lazy load renderers — only one is active at a time
const Live2DCanvas = lazy(() => import("./components/Live2DCanvas").then(m => ({ default: m.Live2DCanvas })));
const VRMCanvas = lazy(() => import("./components/VRMCanvas").then(m => ({ default: m.VRMCanvas })));

const DEFAULT_BG =
  "linear-gradient(135deg, #2d1b2e 0%, #3d2233 30%, #4a2a2a 60%, #5c3a2e 100%)";

const IDLE_DELAY_MS = 60_000;

function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  const [charSelectOpen, setCharSelectOpen] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("neutral");
  const [background, setBackground] = useState(DEFAULT_BG);
  const [zoom, setZoom] = useState(1.2);
  const [userTyping, setUserTyping] = useState(false);

  const { messages, loading, streamingText, sendMessage, clearMessages, setOnExpression } =
    useChat();
  const { listening, speaking, startListening, stopListening, fetchAndPlayTTS, getAudioLevels } =
    useVoice();

  const idleTimerRef = useRef<number | null>(null);
  const hasGreetedRef = useRef<Set<string>>(new Set());
  const selectedCharRef = useRef<Character | undefined>(undefined);

  useEffect(() => {
    setOnExpression((expr: string) => {
      setCurrentExpression(expr);
    });
  }, [setOnExpression]);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((data) => {
        setCharacters(data);
        if (data.length > 0) setSelectedCharId(data[0].id);
      })
      .catch(console.error);

    fetch("/api/models")
      .then((r) => r.json())
      .then(setModels)
      .catch(console.error);
  }, []);

  // Memoize expensive lookups
  const selectedChar = useMemo(
    () => characters.find((c) => c.id === selectedCharId),
    [characters, selectedCharId]
  );
  selectedCharRef.current = selectedChar;

  const selectedModel = useMemo(() => {
    if (!selectedChar?.live2d_model) return null;
    return models.find((m) => m.id === selectedChar.live2d_model) ?? null;
  }, [selectedChar, models]);

  const modelPath = selectedModel?.path ?? null;
  const modelType = selectedModel?.type ?? "live2d";
  const modelMapping = selectedModel?.mapping ?? null;

  // Stable idle timer using ref to break callback chain
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const sendIdleMessageRef = useRef<() => void>(() => {});

  const startIdleTimer = useCallback(() => {
    resetIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      sendIdleMessageRef.current();
    }, IDLE_DELAY_MS);
  }, [resetIdleTimer]);

  const sendIdleMessage = useCallback(async () => {
    if (!selectedCharId || loading) return;

    const idlePrompts = [
      "Say something to get the user's attention since they've been quiet. Be playful and in-character.",
      "The user hasn't said anything in a while. Say something casual or share a thought, staying in character.",
      "Initiate a conversation topic you'd be interested in, staying in character.",
    ];
    const prompt = idlePrompts[Math.floor(Math.random() * idlePrompts.length)];

    const response = await sendMessage(selectedCharId, `[system: ${prompt}]`);
    if (response) {
      setCurrentExpression(response.expression || "neutral");
      const voice = selectedCharRef.current?.voice || "jp_001";
      fetchAndPlayTTS(response.text, voice);
    }
    startIdleTimer();
  }, [selectedCharId, loading, sendMessage, fetchAndPlayTTS, startIdleTimer]);

  useEffect(() => {
    sendIdleMessageRef.current = sendIdleMessage;
  }, [sendIdleMessage]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId) return;
      resetIdleTimer();

      const response = await sendMessage(selectedCharId, text);
      if (response) {
        setCurrentExpression(response.expression || "neutral");
        const voice = selectedCharRef.current?.voice || "jp_001";
        fetchAndPlayTTS(response.text, voice);
      }
      startIdleTimer();
    },
    [selectedCharId, sendMessage, fetchAndPlayTTS, resetIdleTimer, startIdleTimer]
  );

  // Greeting on character load
  useEffect(() => {
    if (!selectedCharId || hasGreetedRef.current.has(selectedCharId)) return;

    const timer = setTimeout(async () => {
      hasGreetedRef.current.add(selectedCharId);

      const response = await sendMessage(
        selectedCharId,
        "[system: The user just opened the app. Greet them warmly and in-character. Keep it short — 1-2 sentences.]"
      );
      if (response) {
        setCurrentExpression(response.expression || "neutral");
        const voice = selectedCharRef.current?.voice || "jp_001";
        fetchAndPlayTTS(response.text, voice);
      }
      startIdleTimer();
    }, 2000);

    return () => clearTimeout(timer);
  }, [selectedCharId, sendMessage, fetchAndPlayTTS, startIdleTimer]);

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      setUserTyping(isTyping);
      if (isTyping) resetIdleTimer();
    },
    [resetIdleTimer]
  );

  const handleMicToggle = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening((transcript) => {
        handleSend(transcript);
      });
    }
  }, [listening, startListening, stopListening, handleSend]);

  const handleCharacterChange = useCallback(
    (id: string) => {
      setSelectedCharId(id);
      clearMessages();
      setCurrentExpression("neutral");
      setZoom(1.2);
      resetIdleTimer();
    },
    [clearMessages, resetIdleTimer]
  );

  // Memoize canvas props to prevent unnecessary re-renders
  const canvasProps = useMemo(() => ({
    modelPath,
    expression: currentExpression,
    speaking,
    userTyping,
    background,
    zoom,
    onZoomChange: setZoom,
    onBackgroundChange: setBackground,
    getAudioLevels,
  }), [modelPath, currentExpression, speaking, userTyping, background, zoom, getAudioLevels]);

  const charName = selectedChar?.name || "Companion";

  return (
    <div className="h-screen flex flex-col bg-stone-950 text-stone-100">
      <header className="flex items-center justify-between px-4 py-2 bg-stone-900 border-b border-stone-800/60">
        <h1 className="text-lg font-bold text-amber-300/90">MeuxCompanion</h1>
        <div className="flex gap-2">
          <CharacterSelect
            characters={characters}
            selected={selectedCharId}
            onSelect={handleCharacterChange}
            open={charSelectOpen}
            onToggle={() => setCharSelectOpen(!charSelectOpen)}
          />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-stone-900 text-stone-500">Loading model...</div>}>
          {modelType === "vrm" ? (
            <VRMCanvas key={`vrm-${selectedCharId}`} {...canvasProps} animations={selectedModel?.animations} />
          ) : (
            <Live2DCanvas
              key={`l2d-${selectedCharId}`}
              {...canvasProps}
              modelMapping={modelMapping}
            />
          )}
        </Suspense>
        <ChatPanel
          messages={messages}
          loading={loading}
          streamingText={streamingText}
          characterName={charName}
          onSend={handleSend}
          onTypingChange={handleTypingChange}
          listening={listening}
          onMicToggle={handleMicToggle}
        />
      </div>
    </div>
  );
}

export default App;
