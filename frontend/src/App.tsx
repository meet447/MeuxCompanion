import { useState, useEffect, useCallback } from "react";
import { Live2DCanvas } from "./components/Live2DCanvas";
import { ChatPanel } from "./components/ChatPanel";
import { CharacterSelect } from "./components/CharacterSelect";
import { useChat } from "./hooks/useChat";
import { useVoice } from "./hooks/useVoice";
import type { Character, Live2DModelInfo } from "./types";

const DEFAULT_BG =
  "linear-gradient(135deg, #2d1b2e 0%, #3d2233 30%, #4a2a2a 60%, #5c3a2e 100%)";

function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<Live2DModelInfo[]>([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  const [charSelectOpen, setCharSelectOpen] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("neutral");
  const [background, setBackground] = useState(DEFAULT_BG);
  const [zoom, setZoom] = useState(1.2);

  const { messages, loading, sendMessage, clearMessages } = useChat();
  const { listening, speaking, startListening, stopListening, fetchAndPlayTTS } =
    useVoice();

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

  const selectedModel = (() => {
    if (!selectedChar?.live2d_model) return null;
    return models.find((m) => m.id === selectedChar.live2d_model) ?? null;
  })();

  const modelPath = selectedModel?.path ?? null;
  const modelMapping = selectedModel?.mapping ?? null;

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId) return;

      const response = await sendMessage(selectedCharId, text);
      if (response) {
        setCurrentExpression(response.expression || "neutral");
        const voice = selectedChar?.voice || "jp_001";
        fetchAndPlayTTS(response.text, voice);
      }
    },
    [selectedCharId, selectedChar, sendMessage, fetchAndPlayTTS]
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
    },
    [clearMessages]
  );

  return (
    <div className="h-screen flex flex-col bg-stone-950 text-stone-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-stone-900 border-b border-stone-800/60">
        <h1 className="text-lg font-bold text-amber-300/90">
          MeuxCompanion
        </h1>
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <Live2DCanvas
          modelPath={modelPath}
          modelMapping={modelMapping}
          expression={currentExpression}
          speaking={speaking}
          background={background}
          zoom={zoom}
          onZoomChange={setZoom}
          onBackgroundChange={setBackground}
        />
        <ChatPanel
          messages={messages}
          loading={loading}
          characterName={selectedChar?.name || "Companion"}
          onSend={handleSend}
          listening={listening}
          onMicToggle={handleMicToggle}
        />
      </div>
    </div>
  );
}

export default App;
