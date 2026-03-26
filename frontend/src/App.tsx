import { useState, useEffect, useCallback } from "react";
import { Live2DCanvas } from "./components/Live2DCanvas";
import { ChatPanel } from "./components/ChatPanel";
import { CharacterSelect } from "./components/CharacterSelect";
import { useChat } from "./hooks/useChat";
import { useVoice } from "./hooks/useVoice";
import type { Character, Live2DModelInfo } from "./types";

function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<Live2DModelInfo[]>([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  const [charSelectOpen, setCharSelectOpen] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState("neutral");

  const { messages, loading, sendMessage, clearMessages } = useChat();
  const { listening, speaking, startListening, stopListening, fetchAndPlayTTS } =
    useVoice();

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

  // Find the Live2D model path for the selected character
  const modelPath = (() => {
    if (!selectedChar?.live2d_model) return null;
    const model = models.find((m) => m.id === selectedChar.live2d_model);
    return model?.path ?? null;
  })();

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId) return;

      const response = await sendMessage(selectedCharId, text);
      if (response) {
        setCurrentEmotion(response.emotion || "neutral");

        // Generate and play TTS
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
      setCurrentEmotion("neutral");
    },
    [clearMessages]
  );

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
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
          emotion={currentEmotion}
          speaking={speaking}
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
