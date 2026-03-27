import { useState, useEffect } from "react";
import { ModelSettings } from "./ModelSettings";

interface Voice {
  id: string;
  name: string;
}

interface LLMPreset {
  name: string;
  base_url: string;
  needs_key: boolean;
  default_model: string;
}

interface TTSPreset {
  name: string;
  needs_key: boolean;
}

type SettingsPage = null | "profile" | "llm" | "tts" | "expressions";

const MENU_ITEMS: { id: SettingsPage & string; label: string; description: string; icon: string }[] = [
  { id: "profile", label: "Your Profile", description: "Name and about yourself", icon: "\u{1F464}" },
  { id: "llm", label: "LLM Provider", description: "AI model and API connection", icon: "\u{1F9E0}" },
  { id: "tts", label: "Voice & TTS", description: "Text-to-speech provider and voice", icon: "\u{1F50A}" },
  { id: "expressions", label: "Expression Mapping", description: "Map emotions to model expressions", icon: "\u{1F3AD}" },
];

export function Settings({ onClose, modelId, onPreviewExpression }: {
  onClose: () => void;
  modelId?: string;
  onPreviewExpression?: (expr: string) => void;
}) {
  const [page, setPage] = useState<SettingsPage>(null);
  const [config, setConfig] = useState<any>(null);
  const [llmPresets, setLlmPresets] = useState<Record<string, LLMPreset>>({});
  const [ttsPresets, setTtsPresets] = useState<Record<string, TTSPreset>>({});
  const [voices, setVoices] = useState<Voice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const [userName, setUserName] = useState("");
  const [userAbout, setUserAbout] = useState("");
  const [llmProvider, setLlmProvider] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [ttsProvider, setTtsProvider] = useState("tiktok");
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoice, setTtsVoice] = useState("jp_001");

  useEffect(() => {
    Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/config/presets").then((r) => r.json()),
    ]).then(([cfg, presets]) => {
      setConfig(cfg);
      setLlmPresets(presets.llm || {});
      setTtsPresets(presets.tts || {});

      setUserName(cfg.user?.name || "");
      setUserAbout(cfg.user?.about || "");
      setLlmProvider(cfg.llm?.provider || "");
      setLlmApiKey("");
      setLlmModel(cfg.llm?.model || "");
      setLlmBaseUrl(cfg.llm?.base_url || "");
      setTtsProvider(cfg.tts?.provider || "tiktok");
      setTtsApiKey("");
      setTtsVoice(cfg.tts?.voice || "jp_001");
    });
  }, []);

  useEffect(() => {
    fetch(`/api/voices/${ttsProvider}`)
      .then((r) => r.json())
      .then(setVoices)
      .catch(console.error);
  }, [ttsProvider]);

  const selectPreset = (id: string) => {
    const preset = llmPresets[id];
    if (!preset) return;
    setLlmProvider(id);
    setLlmBaseUrl(preset.base_url);
    setLlmModel(preset.default_model);
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/config/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: llmBaseUrl,
          api_key: llmApiKey || null,
          model: llmModel,
        }),
      });
      setTestResult(await res.json());
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const update: any = {
      user: { name: userName, about: userAbout },
      llm: { provider: llmProvider, base_url: llmBaseUrl, model: llmModel },
      tts: { provider: ttsProvider, voice: ttsVoice },
    };
    if (llmApiKey) update.llm.api_key = llmApiKey;
    if (ttsApiKey) update.tts.api_key = ttsApiKey;

    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!config) return <div className="p-8 text-slate-400">Loading settings...</div>;

  // ========== SUB-PAGE HEADER ==========
  const SubHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={() => setPage(null)}
        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
    </div>
  );

  // ========== MENU LIST ==========
  if (page === null) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800">Settings</h2>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
            Close
          </button>
        </div>

        <div className="space-y-2">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 transition-all text-left group"
            >
              <span className="text-2xl w-8 text-center">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">{item.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{item.description}</div>
              </div>
              <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 16 16"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ========== PROFILE PAGE ==========
  if (page === "profile") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <SubHeader title="Your Profile" />

        <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="What should your companion call you?"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">About Yourself</label>
        <textarea
          value={userAbout}
          onChange={(e) => setUserAbout(e.target.value)}
          placeholder="Tell your companion about yourself — interests, what you do, what you enjoy..."
          rows={5}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none mb-6 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </div>
    );
  }

  // ========== LLM PAGE ==========
  if (page === "llm") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <SubHeader title="LLM Provider" />

        <label className="block text-sm font-medium text-slate-700 mb-2">Provider</label>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {Object.entries(llmPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => selectPreset(id)}
              className={`px-2.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                llmProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {llmProvider && (
          <>
            {llmPresets[llmProvider]?.needs_key !== false && (
              <>
                <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => { setLlmApiKey(e.target.value); setTestResult(null); }}
                  placeholder="Paste your API key (blank = keep current)"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </>
            )}

            <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => { setLlmModel(e.target.value); setTestResult(null); }}
              placeholder="e.g. gpt-4o"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />

            {llmProvider === "custom" && (
              <>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
                <input
                  type="text"
                  value={llmBaseUrl}
                  onChange={(e) => { setLlmBaseUrl(e.target.value); setTestResult(null); }}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </>
            )}

            <button
              onClick={testConnection}
              disabled={testing}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors mb-2"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>

            {testResult && (
              <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm ${
                testResult.success
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {testResult.success ? "Connected successfully!" : testResult.error || "Connection failed"}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors mt-2"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
          </>
        )}
      </div>
    );
  }

  // ========== TTS PAGE ==========
  if (page === "tts") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <SubHeader title="Voice & TTS" />

        <label className="block text-sm font-medium text-slate-700 mb-2">Provider</label>
        <div className="flex gap-2 mb-4">
          {Object.entries(ttsPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => setTtsProvider(id)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                ttsProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {ttsPresets[ttsProvider]?.needs_key && (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
            <input
              type="password"
              value={ttsApiKey}
              onChange={(e) => setTtsApiKey(e.target.value)}
              placeholder="Paste your API key (blank = keep current)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </>
        )}

        <label className="block text-sm font-medium text-slate-700 mb-1">Voice</label>
        <select
          value={ttsVoice}
          onChange={(e) => setTtsVoice(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </div>
    );
  }

  // ========== EXPRESSIONS PAGE ==========
  if (page === "expressions") {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-0">
          <SubHeader title="Expression Mapping" />
        </div>
        {modelId ? (
          <ModelSettings
            modelId={modelId}
            onPreviewExpression={onPreviewExpression || (() => {})}
            onClose={() => setPage(null)}
          />
        ) : (
          <div className="p-6 text-sm text-slate-400">No model loaded — select a character first.</div>
        )}
      </div>
    );
  }

  return null;
}
