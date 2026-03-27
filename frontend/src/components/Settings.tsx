import { useState, useEffect } from "react";

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

export function Settings({ onClose }: { onClose: () => void }) {
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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800">Settings</h2>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
          Close
        </button>
      </div>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Your Profile</h3>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Your name"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <textarea
          value={userAbout}
          onChange={(e) => setUserAbout(e.target.value)}
          placeholder="About yourself"
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </section>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">LLM Provider</h3>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(llmPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => selectPreset(id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                llmProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {llmPresets[llmProvider]?.needs_key !== false && (
          <input
            type="password"
            value={llmApiKey}
            onChange={(e) => { setLlmApiKey(e.target.value); setTestResult(null); }}
            placeholder="API Key (leave blank to keep current)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}

        <input
          type="text"
          value={llmModel}
          onChange={(e) => { setLlmModel(e.target.value); setTestResult(null); }}
          placeholder="Model name"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        {llmProvider === "custom" && (
          <input
            type="text"
            value={llmBaseUrl}
            onChange={(e) => { setLlmBaseUrl(e.target.value); setTestResult(null); }}
            placeholder="Base URL"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}

        <button
          onClick={testConnection}
          disabled={testing}
          className="w-full py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>
        {testResult && (
          <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs ${
            testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {testResult.success ? "Connected!" : testResult.error || "Failed"}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Voice & TTS</h3>
        <div className="flex gap-1.5 mb-3">
          {Object.entries(ttsPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => setTtsProvider(id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                ttsProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {ttsPresets[ttsProvider]?.needs_key && (
          <input
            type="password"
            value={ttsApiKey}
            onChange={(e) => setTtsApiKey(e.target.value)}
            placeholder="API Key (leave blank to keep current)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}

        <select
          value={ttsVoice}
          onChange={(e) => setTtsVoice(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
