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

const IDLE_DELAY_MS = 60_000;

function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  const [charSelectOpen, setCharSelectOpen] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("neutral");
  const [background, setBackground] = useState("transparent");
  const [zoom, setZoom] = useState(1.1);
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
      setZoom(1.1);
      resetIdleTimer();
    },
    [clearMessages, clearQueue, resetIdleTimer]
  );

  const [framing, setFraming] = useState<"full" | "half">("full");

  const canvasProps = useMemo(() => ({
    modelPath,
    expression: currentExpression,
    speaking,
    userTyping,
    background,
    zoom,
    framing,
    onZoomChange: setZoom,
    onBackgroundChange: setBackground,
    onFramingChange: setFraming,
    getAudioLevels,
  }), [modelPath, currentExpression, speaking, userTyping, background, zoom, framing, getAudioLevels]);

  const charName = selectedChar?.name || "Companion";

  return (
    <div className="h-screen flex flex-col font-sans text-slate-800" style={{ backgroundColor: "transparent" }}>
      {/* Wavy background for header */}
      <svg className="absolute top-0 left-0 w-full z-0 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ height: "6rem" }}>
        <path d="M0,0 L1440,0 L1440,60 C1240,100 960,20 720,60 C480,100 240,40 0,80 Z" fill="#eaf3fd" />
      </svg>

      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <h1 className="text-xl font-bold text-slate-700 tracking-wide uppercase">{charName}</h1>
        </div>
        <div className="flex items-center gap-4 bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm shadow-blue-900/5 ring-1 ring-slate-100">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              settingsOpen
                ? "bg-blue-100 text-blue-700"
                : "hover:bg-slate-100 text-slate-600"
            }`}
          >
            {settingsOpen ? "Chat" : "Settings"}
          </button>
          
          <div className="text-slate-300">|</div>

          <CharacterSelect
            characters={characters}
            selected={selectedCharId}
            onSelect={handleCharacterChange}
            open={charSelectOpen}
            onToggle={() => setCharSelectOpen(!charSelectOpen)}
          />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-0 pl-10 pr-6 pb-6">
        <div className="flex-1 relative rounded-3xl overflow-hidden mr-6">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">Loading model...</div>}>
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
        </div>

        <div className="w-[420px] rounded-[2rem] bg-white border border-slate-100/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-blue-900/5 my-2 mr-2 flex flex-col overflow-hidden relative backdrop-blur-3xl bg-white/95">
          {settingsOpen ? (
            <ModelSettings
              modelId={selectedModel?.id || ""}
              onPreviewExpression={(expr) => setCurrentExpression(expr)}
              onClose={() => {
                setSettingsOpen(false);
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
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-orange-50/50">
              <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-3xl font-bold mb-6 shadow-sm">!</div>
              <h3 className="text-slate-800 font-semibold text-lg mb-3">Expression Mapping Required</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                This model's expressions need to be mapped before chatting.
                Open Settings to preview each expression and assign them to emotions.
              </p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 rounded-full px-8 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
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
    </div>
  );
}

export default App;

