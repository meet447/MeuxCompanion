import { useState, useEffect, useCallback, useRef } from "react";
import { Live2DCanvas } from "./components/Live2DCanvas";
import { ChatPanel } from "./components/ChatPanel";
import { CharacterSelect } from "./components/CharacterSelect";
import { useChat } from "./hooks/useChat";
import { useVoice } from "./hooks/useVoice";
import type { Character, Live2DModelInfo } from "./types";

const DEFAULT_BG =
  "linear-gradient(135deg, #2d1b2e 0%, #3d2233 30%, #4a2a2a 60%, #5c3a2e 100%)";

// Idle chatter: send after this many seconds of silence
const IDLE_DELAY_MS = 60_000; // 1 minute

function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<Live2DModelInfo[]>([]);
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

  // Wire up expression callback from streaming
  useEffect(() => {
    setOnExpression((expr: string) => {
      setCurrentExpression(expr);
    });
  }, [setOnExpression]);

  // Fetch characters and models on mount
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

  const selectedChar = characters.find((c) => c.id === selectedCharId);
  selectedCharRef.current = selectedChar;

  const selectedModel = (() => {
    if (!selectedChar?.live2d_model) return null;
    return models.find((m) => m.id === selectedChar.live2d_model) ?? null;
  })();

  const modelPath = selectedModel?.path ?? null;
  const modelMapping = selectedModel?.mapping ?? null;

  // --- Core send handler ---
  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId) return;

      // Reset idle timer
      resetIdleTimer();

      const response = await sendMessage(selectedCharId, text);
      if (response) {
        setCurrentExpression(response.expression || "neutral");
        const voice = selectedCharRef.current?.voice || "jp_001";
        fetchAndPlayTTS(response.text, voice);
      }

      // Restart idle timer after response
      startIdleTimer();
    },
    [selectedCharId, sendMessage, fetchAndPlayTTS]
  );

  // --- Idle chatter ---
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
  }, [selectedCharId, loading, sendMessage, fetchAndPlayTTS]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const startIdleTimer = useCallback(() => {
    resetIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      sendIdleMessage();
    }, IDLE_DELAY_MS);
  }, [resetIdleTimer, sendIdleMessage]);

  // --- Greeting on character load ---
  useEffect(() => {
    if (!selectedCharId || hasGreetedRef.current.has(selectedCharId)) return;

    // Small delay so model loads first
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

  // --- Typing awareness ---
  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      setUserTyping(isTyping);
      if (isTyping) {
        resetIdleTimer(); // Don't interrupt while typing
      }
    },
    [resetIdleTimer]
  );

  // --- Mic ---
  const handleMicToggle = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening((transcript) => {
        handleSend(transcript);
      });
    }
  }, [listening, startListening, stopListening, handleSend]);

  // --- Character switch ---
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
        <Live2DCanvas
          modelPath={modelPath}
          modelMapping={modelMapping}
          expression={currentExpression}
          speaking={speaking}
          userTyping={userTyping}
          background={background}
          zoom={zoom}
          onZoomChange={setZoom}
          onBackgroundChange={setBackground}
          getAudioLevels={getAudioLevels}
        />
        <ChatPanel
          messages={messages}
          loading={loading}
          streamingText={streamingText}
          characterName={selectedChar?.name || "Companion"}
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
