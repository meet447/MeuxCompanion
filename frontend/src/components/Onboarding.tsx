import { useState, useEffect, useRef } from "react";

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

interface Voice {
  id: string;
  name: string;
}

interface Model {
  id: string;
  type: string;
  model_file: string;
  path: string;
}

interface FormData {
  user: { name: string; about: string };
  llm: { provider: string; base_url: string; api_key: string; model: string };
  tts: { provider: string; api_key: string; voice: string };
  companion: { name: string; personality: string; vibe: string; model_id: string };
}

const VIBES = ["Cheerful", "Chill", "Tsundere", "Gothic", "Mysterious", "Sassy", "Wise", "Energetic"];

const STEPS = ["About You", "LLM Provider", "Voice & TTS", "Your Companion"];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [llmPresets, setLlmPresets] = useState<Record<string, LLMPreset>>({});
  const [ttsPresets, setTtsPresets] = useState<Record<string, TTSPreset>>({});
  const [voices, setVoices] = useState<Voice[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [form, setForm] = useState<FormData>({
    user: { name: "", about: "" },
    llm: { provider: "", base_url: "", api_key: "", model: "" },
    tts: { provider: "tiktok", api_key: "", voice: "jp_001" },
    companion: { name: "", personality: "", vibe: "", model_id: "haru" },
  });

  useEffect(() => {
    fetch("/api/config/presets")
      .then((r) => r.json())
      .then((data) => {
        setLlmPresets(data.llm || {});
        setTtsPresets(data.tts || {});
      })
      .catch(console.error);

    fetch("/api/models")
      .then((r) => r.json())
      .then(setModels)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`/api/voices/${form.tts.provider}`)
      .then((r) => r.json())
      .then((data) => {
        setVoices(data);
        if (data.length > 0 && !data.find((v: Voice) => v.id === form.tts.voice)) {
          updateForm("tts", "voice", data[0].id);
        }
      })
      .catch(console.error);
  }, [form.tts.provider]);

  const updateForm = (section: keyof FormData, field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const selectLLMPreset = (presetId: string) => {
    const preset = llmPresets[presetId];
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      llm: {
        provider: presetId,
        base_url: preset.base_url,
        api_key: prev.llm.api_key,
        model: preset.default_model,
      },
    }));
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
          base_url: form.llm.base_url,
          api_key: form.llm.api_key || null,
          model: form.llm.model,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  };

  const playSample = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello! I'm your new companion.", voice: form.tts.voice }),
      });
      const data = await res.json();
      if (data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        audioRef.current = audio;
        audio.play().catch(() => {});
      }
    } catch {}
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return form.user.name.trim() !== "" && form.user.about.trim() !== "";
      case 1:
        return form.llm.provider !== "" && form.llm.model !== "" && testResult?.success === true;
      case 2:
        return form.tts.voice !== "";
      case 3:
        return form.companion.name.trim() !== "" && form.companion.personality.trim() !== "";
      default:
        return false;
    }
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError("");
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: form.user,
          llm: {
            provider: form.llm.provider,
            base_url: form.llm.base_url,
            api_key: form.llm.api_key || null,
            model: form.llm.model,
          },
          tts: {
            provider: form.tts.provider,
            api_key: form.tts.api_key || null,
            voice: form.tts.voice,
          },
          onboarding_complete: true,
        }),
      });

      const charRes = await fetch("/api/characters/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.companion.name,
          personality: form.companion.personality,
          model_id: form.companion.model_id,
          voice: form.tts.voice,
          user_name: form.user.name,
          user_about: form.user.about,
          vibe: form.companion.vibe || null,
        }),
      });
      const charData = await charRes.json();

      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_character: charData.id }),
      });

      setStep(4);
      setTimeout(onComplete, 2000);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  const selectVibe = (vibe: string) => {
    const isSelected = form.companion.vibe === vibe;
    updateForm("companion", "vibe", isSelected ? "" : vibe);
    if (!isSelected) {
      if (!form.companion.personality.trim()) {
        const templates: Record<string, string> = {
          Cheerful: "Bright, upbeat, and always encouraging. Loves to make people smile and celebrates every little win.",
          Chill: "Laid-back and easygoing. Never rushes, keeps things mellow, and always has a calming presence.",
          Tsundere: "Acts tough and dismissive but secretly cares deeply. Gets flustered by compliments easily.",
          Gothic: "Elegant, mysterious, and a touch dramatic. Has a poetic way of speaking with dry wit.",
          Mysterious: "Enigmatic and thoughtful. Sometimes gives cryptic answers and always seems to know more than they let on.",
          Sassy: "Quick-witted with sharp comebacks. Playful teasing is their way of showing affection.",
          Wise: "Calm, thoughtful, and insightful. Speaks with purpose and offers gentle guidance when asked.",
          Energetic: "Bursting with energy and enthusiasm. Gets excited easily and brings infectious positivity.",
        };
        updateForm("companion", "personality", templates[vibe] || "");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {step < 4 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    i === step
                      ? "bg-blue-500 text-white"
                      : i < step
                        ? "bg-blue-200 text-blue-700"
                        : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {i < step ? "\u2713" : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < step ? "bg-blue-300" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg shadow-blue-900/5 border border-slate-100 p-8">
          {step === 0 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Let's set up your AI companion</h2>
              <p className="text-slate-500 mb-6">Tell us a bit about yourself so your companion can get to know you.</p>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
              <input
                type="text"
                value={form.user.name}
                onChange={(e) => updateForm("user", "name", e.target.value)}
                placeholder="What should your companion call you?"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
              />
              <label className="block text-sm font-medium text-slate-700 mb-1">About Yourself</label>
              <textarea
                value={form.user.about}
                onChange={(e) => updateForm("user", "about", e.target.value)}
                placeholder="Tell your companion a bit about yourself — your interests, what you do, what you enjoy talking about..."
                rows={4}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Connect your AI brain</h2>
              <p className="text-slate-500 mb-6">Choose an LLM provider. Any OpenAI-compatible API works.</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {Object.entries(llmPresets).map(([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => selectLLMPreset(id)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.llm.provider === id
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              {form.llm.provider && (
                <>
                  {llmPresets[form.llm.provider]?.needs_key !== false && (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                      <input
                        type="password"
                        value={form.llm.api_key}
                        onChange={(e) => { updateForm("llm", "api_key", e.target.value); setTestResult(null); }}
                        placeholder="Paste your API key"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                      />
                    </>
                  )}
                  <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
                  <input
                    type="text"
                    value={form.llm.model}
                    onChange={(e) => { updateForm("llm", "model", e.target.value); setTestResult(null); }}
                    placeholder="e.g. gpt-4o"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                  />
                  {form.llm.provider === "custom" && (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
                      <input
                        type="text"
                        value={form.llm.base_url}
                        onChange={(e) => { updateForm("llm", "base_url", e.target.value); setTestResult(null); }}
                        placeholder="https://api.example.com/v1"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                      />
                    </>
                  )}
                  <button
                    onClick={testConnection}
                    disabled={testing}
                    className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {testing ? "Testing..." : "Test Connection"}
                  </button>
                  {testResult && (
                    <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm ${
                      testResult.success
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {testResult.success ? "Connected successfully!" : testResult.error || "Connection failed"}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Choose a voice</h2>
              <p className="text-slate-500 mb-6">Pick a TTS provider and voice for your companion.</p>
              <label className="block text-sm font-medium text-slate-700 mb-1">TTS Provider</label>
              <div className="flex gap-2 mb-4">
                {Object.entries(ttsPresets).map(([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => updateForm("tts", "provider", id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.tts.provider === id
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              {ttsPresets[form.tts.provider]?.needs_key && (
                <>
                  <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                  <input
                    type="password"
                    value={form.tts.api_key}
                    onChange={(e) => updateForm("tts", "api_key", e.target.value)}
                    placeholder="Paste your API key"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                  />
                </>
              )}
              <label className="block text-sm font-medium text-slate-700 mb-1">Voice</label>
              <div className="flex gap-2 mb-4">
                <select
                  value={form.tts.voice}
                  onChange={(e) => updateForm("tts", "voice", e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <button
                  onClick={playSample}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-600 text-sm font-medium transition-colors"
                >
                  Play Sample
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Create your companion</h2>
              <p className="text-slate-500 mb-6">Give your companion a name and personality.</p>
              <label className="block text-sm font-medium text-slate-700 mb-1">Companion Name</label>
              <input
                type="text"
                value={form.companion.name}
                onChange={(e) => updateForm("companion", "name", e.target.value)}
                placeholder="What's your companion's name?"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
              />
              <label className="block text-sm font-medium text-slate-700 mb-2">Vibe</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {VIBES.map((vibe) => (
                  <button
                    key={vibe}
                    onClick={() => selectVibe(vibe)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      form.companion.vibe === vibe
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-500"
                    }`}
                  >
                    {vibe}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Personality</label>
              <textarea
                value={form.companion.personality}
                onChange={(e) => updateForm("companion", "personality", e.target.value)}
                placeholder="Describe your companion's personality... e.g., cheerful and energetic, calm and wise, playful and sarcastic"
                rows={4}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-4"
              />
              <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
              {models.length > 1 ? (
                <select
                  value={form.companion.model_id}
                  onChange={(e) => updateForm("companion", "model_id", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.id} ({m.type})</option>
                  ))}
                </select>
              ) : (
                <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-sm">
                  Using default model (haru).
                  <span className="block text-xs text-slate-400 mt-1">
                    To use a custom model, place it in models/live2d/ or models/vrm/ and restart.
                  </span>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                {"\u2713"}
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">You're all set!</h2>
              <p className="text-slate-500">Meet {form.companion.name}. Loading your companion...</p>
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}

          {step < 4 && (
            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-0 transition-colors"
              >
                Back
              </button>
              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={!canProceed() || submitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 transition-colors"
                >
                  {submitting ? "Setting up..." : "Finish"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
