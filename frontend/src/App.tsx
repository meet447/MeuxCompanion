import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { CharacterSelect } from "./components/CharacterSelect";
import { ModelSettings } from "./components/ModelSettings";
import { useChat } from "./hooks/useChat";
import { useAudioQueue } from "./hooks/useAudioQueue";
import { useVoice } from "./hooks/useVoice";
import type { Character, ModelInfo } from "./types";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expressionsConfigured, setExpressionsConfigured] = useState(true);
  const [userTyping, setUserTyping] = useState(false);

  const { messages, loading, streamingText, sendMessage, clearMessages, setOnSentence, setOnAudio } =
    useChat();
  const { listening, startListening, stopListening } = useVoice();
  const { speaking, addSentence, addAudio, clearQueue, getAudioLevels, setOnExpressionChange, setNeutralExpression } =
    useAudioQueue();

  const idleTimerRef = useRef<number | null>(null);
  const hasGreetedRef = useRef<Set<string>>(new Set());
  const selectedCharRef = useRef<Character | undefined>(undefined);

  // Wire audio queue events to model
  useEffect(() => {
    setOnExpressionChange((expr: string) => {
      setCurrentExpression(expr);
    });
  }, [setOnExpressionChange]);

  // Wire chat sentence events to audio queue
  useEffect(() => {
    setOnSentence((task) => {
      addSentence(task);
    });
    setOnAudio((index, audio) => {
      addAudio(index, audio);
    });
  }, [setOnSentence, setOnAudio, addSentence, addAudio]);

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

  // Check if expression mapping is configured for current model
  useEffect(() => {
    if (!selectedModel?.id) return;
    fetch(`/api/expressions/configured/${selectedModel.id}`)
      .then((r) => r.json())
      .then((data) => {
        setExpressionsConfigured(data.configured);
        if (data.neutral) setNeutralExpression(data.neutral);
      })
      .catch(() => setExpressionsConfigured(false));
  }, [selectedModel?.id]);

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

    await sendMessage(selectedCharId, `[system: ${prompt}]`);
    startIdleTimer();
  }, [selectedCharId, loading, sendMessage, startIdleTimer]);

  useEffect(() => {
    sendIdleMessageRef.current = sendIdleMessage;
  }, [sendIdleMessage]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId) return;
      resetIdleTimer();
      clearQueue();

      await sendMessage(selectedCharId, text);
      startIdleTimer();
    },
    [selectedCharId, sendMessage, resetIdleTimer, startIdleTimer, clearQueue]
  );

  // Greeting on character load
  useEffect(() => {
    if (!selectedCharId || !expressionsConfigured || hasGreetedRef.current.has(selectedCharId)) return;

    const timer = setTimeout(async () => {
      hasGreetedRef.current.add(selectedCharId);
      await sendMessage(
        selectedCharId,
        "[system: The user just opened the app. Greet them warmly and in-character. Keep it short — 1-2 sentences.]"
      );
      startIdleTimer();
    }, 2000);

    return () => clearTimeout(timer);
  }, [selectedCharId, expressionsConfigured, sendMessage, startIdleTimer]);

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
      clearQueue();
      setCurrentExpression("neutral");
      setZoom(1.2);
      resetIdleTimer();
    },
    [clearMessages, clearQueue, resetIdleTimer]
  );

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
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              settingsOpen
                ? "bg-amber-800/60 text-amber-200"
                : "bg-stone-800 hover:bg-stone-700 text-stone-300"
            }`}
          >
            {settingsOpen ? "Chat" : "Settings"}
          </button>
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
        {settingsOpen ? (
          <ModelSettings
            modelId={selectedModel?.id || ""}
            onPreviewExpression={(expr) => setCurrentExpression(expr)}
            onClose={() => {
              setSettingsOpen(false);
              // Re-check configuration
              if (selectedModel?.id) {
                fetch(`/api/expressions/configured/${selectedModel.id}`)
                  .then((r) => r.json())
                  .then((data) => {
                    setExpressionsConfigured(data.configured);
                    if (data.neutral) setNeutralExpression(data.neutral);
                  });
              }
            }}
          />
        ) : !expressionsConfigured ? (
          <div className="w-[400px] flex flex-col items-center justify-center bg-stone-900 border-l border-stone-800/60 p-6 text-center">
            <div className="text-amber-400 text-3xl mb-4">!</div>
            <h3 className="text-stone-200 font-medium text-sm mb-2">Expression Mapping Required</h3>
            <p className="text-stone-500 text-xs mb-4 leading-relaxed">
              This model's expressions need to be mapped before chatting.
              Open Settings to preview each expression and assign them to emotions.
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="bg-amber-800/70 hover:bg-amber-700/70 text-amber-50 rounded-lg px-5 py-2 text-sm font-medium transition-colors"
            >
              Configure Expressions
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}

export default App;
