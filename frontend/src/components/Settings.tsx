import { useState, useEffect } from "react";
import type { JSX } from "react";
import { ModelSettings } from "./ModelSettings";
import { MemoryStatePanel } from "./MemoryStatePanel";

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

type SettingsPage = null | "profile" | "llm" | "tts" | "expressions" | "memory";

const ProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
);
const BrainIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
);
const SpeakerIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
);
const MaskIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const ArchiveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 12h10M5 16h8M4 4h16v16H4z" /></svg>
);

const MENU_ITEMS: { id: SettingsPage & string; label: string; description: string; icon: () => JSX.Element }[] = [
  { id: "profile", label: "Your Profile", description: "Name and about yourself", icon: ProfileIcon },
  { id: "llm", label: "LLM Provider", description: "AI model and API connection", icon: BrainIcon },
  { id: "tts", label: "Voice & TTS", description: "Text-to-speech provider and voice", icon: SpeakerIcon },
  { id: "expressions", label: "Expression Mapping", description: "Map emotions to model expressions", icon: MaskIcon },
  { id: "memory", label: "Memory & State", description: "Inspect local memories and relationship state", icon: ArchiveIcon },
];

const inputClass = "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";
const buttonClass = "w-full py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all active:translate-y-0";
const secondaryBtnClass = "w-full py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 text-[15px] font-medium hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 transition-all mb-3";

export function Settings({ onClose, characterId, characterName, modelId, onPreviewExpression, onConversationCleared, onStateChanged }: {
  onClose: () => void;
  characterId?: string;
  characterName: string;
  modelId?: string;
  onPreviewExpression?: (expr: string) => void;
  onConversationCleared?: () => void;
  onStateChanged?: () => void;
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
  const [configuredLlm, setConfiguredLlm] = useState<Record<string, { configured: boolean; model: string }>>({});
  const [configuredTts, setConfiguredTts] = useState<Record<string, { configured: boolean; voice: string }>>({});

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
      fetch("/api/config/configured").then((r) => r.json()),
    ]).then(([cfg, presets, configured]) => {
      setConfig(cfg);
      setLlmPresets(presets.llm || {});
      setTtsPresets(presets.tts || {});
      setConfiguredLlm(configured.llm || {});
      setConfiguredTts(configured.tts || {});

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
    setTestResult(null);
    setLlmApiKey("");

    // If this provider was previously configured, restore its saved config
    const saved = config?.llm_providers?.[id];
    if (saved) {
      setLlmBaseUrl(saved.base_url || preset.base_url);
      setLlmModel(saved.model || preset.default_model);
    } else {
      setLlmBaseUrl(preset.base_url);
      setLlmModel(preset.default_model);
    }
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

    // Refresh configured status
    fetch("/api/config/configured").then((r) => r.json()).then((data) => {
      setConfiguredLlm(data.llm || {});
      setConfiguredTts(data.tts || {});
    });
    // Refresh full config so llm_providers/tts_providers are up-to-date
    fetch("/api/config").then((r) => r.json()).then(setConfig);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!config) return <div className="p-8 text-slate-400">Loading settings...</div>;

  // ========== SUB-PAGE HEADER ==========
  const SubHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-4 mb-8">
      <button
        onClick={() => setPage(null)}
        className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shadow-blue-900/5 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center text-slate-500 hover:text-blue-500 transition-all"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
    </div>
  );

  // ========== MENU LIST ==========
  if (page === null) {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Settings</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shadow-blue-900/5 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center text-slate-500 hover:text-red-500 transition-all">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div className="space-y-3">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="w-full flex items-center gap-5 px-5 py-4 rounded-3xl border border-slate-100/80 bg-white shadow-sm shadow-blue-900/5 hover:border-blue-100 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-blue-50 flex items-center justify-center text-slate-500 group-hover:text-blue-500 transition-colors shadow-sm">
                <item.icon />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{item.label}</div>
                <div className="text-sm text-slate-400 mt-1">{item.description}</div>
              </div>
              <svg className="w-5 h-5 text-slate-300 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 16 16"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ========== PROFILE PAGE ==========
  if (page === "profile") {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Your Profile" />

        <label className={labelClass}>Your Name</label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="What should your companion call you?"
          className={inputClass}
        />

        <label className={labelClass}>About Yourself</label>
        <textarea
          value={userAbout}
          onChange={(e) => setUserAbout(e.target.value)}
          placeholder="Tell your companion about yourself — interests, what you do, what you enjoy..."
          rows={5}
          className={`${inputClass} resize-none mb-8 rounded-3xl`}
        />

        <button
          onClick={handleSave}
          disabled={saving}
          className={buttonClass}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Profile"}
        </button>
      </div>
    );
  }

  // ========== LLM PAGE ==========
  if (page === "llm") {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="LLM Provider" />

        <label className={labelClass}>Provider</label>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {Object.entries(llmPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => selectPreset(id)}
              className={`relative px-4 py-3 rounded-2xl text-[13px] font-semibold border transition-all ${
                llmProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                  : configuredLlm[id]?.configured
                    ? "border-green-200 bg-green-50/30 text-slate-600 hover:border-green-300 hover:shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                {preset.name}
                {configuredLlm[id]?.configured && llmProvider !== id && (
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
              </span>
              {configuredLlm[id]?.configured && llmProvider !== id && (
                <span className="block text-[10px] text-green-600/70 font-medium mt-0.5">Configured</span>
              )}
            </button>
          ))}
        </div>

        {llmProvider && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {llmPresets[llmProvider]?.needs_key !== false && (
              <>
                <label className={labelClass}>API Key</label>
                <input
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => { setLlmApiKey(e.target.value); setTestResult(null); }}
                  placeholder="Paste your API key (blank to keep current)"
                  className={inputClass}
                />
              </>
            )}

            <label className={labelClass}>Model</label>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => { setLlmModel(e.target.value); setTestResult(null); }}
              placeholder="e.g. gpt-4o"
              className={inputClass}
            />

            {llmProvider === "custom" && (
              <>
                <label className={labelClass}>Base URL</label>
                <input
                  type="text"
                  value={llmBaseUrl}
                  onChange={(e) => { setLlmBaseUrl(e.target.value); setTestResult(null); }}
                  placeholder="https://api.example.com/v1"
                  className={inputClass}
                />
              </>
            )}

            <button
              onClick={testConnection}
              disabled={testing}
              className={secondaryBtnClass}
            >
              {testing ? "Testing Connection..." : "Test Connection"}
            </button>

            {testResult && (
              <div className={`mb-6 px-5 py-4 rounded-2xl text-sm font-medium ${
                testResult.success
                  ? "bg-green-50 text-green-700 border border-green-200/50 shadow-sm"
                  : "bg-red-50 text-red-700 border border-red-200/50 shadow-sm"
              }`}>
                {testResult.success ? "Connected successfully!" : testResult.error || "Connection failed"}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className={buttonClass}
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ========== TTS PAGE ==========
  if (page === "tts") {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Voice & TTS" />

        <label className={labelClass}>Provider</label>
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(ttsPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => setTtsProvider(id)}
              className={`px-4 py-3 rounded-2xl text-[13px] font-semibold border transition-all ${
                ttsProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                  : configuredTts[id]?.configured
                    ? "border-green-200 bg-green-50/30 text-slate-600 hover:border-green-300 hover:shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {preset.name}
                {configuredTts[id]?.configured && ttsProvider !== id && (
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {ttsPresets[ttsProvider]?.needs_key && (
            <>
              <label className={labelClass}>API Key</label>
              <input
                type="password"
                value={ttsApiKey}
                onChange={(e) => setTtsApiKey(e.target.value)}
                placeholder="Paste your API key (blank to keep current)"
                className={inputClass}
              />
            </>
          )}

          <label className={labelClass}>Voice</label>
          <div className="relative mb-8">
            <select
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className={`${inputClass} appearance-none cursor-pointer mb-0`}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={buttonClass}
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
          </button>
        </div>
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

  if (page === "memory") {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-0">
          <SubHeader title="Memory & State" />
        </div>
        <MemoryStatePanel
          characterId={characterId}
          characterName={characterName}
          onConversationCleared={onConversationCleared}
          onStateChanged={onStateChanged}
        />
      </div>
    );
  }

  return null;
}
