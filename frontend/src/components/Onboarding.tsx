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

const inputClass = "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";
const headingClass = "text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-3 tracking-tight";
const descriptionClass = "text-slate-500 text-[15px] mb-8 leading-relaxed";

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
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-blue-50 via-white to-indigo-50 relative">
      {/* Decorative Blur Blobs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-300/20 blur-[100px]" />
        <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-300/20 blur-[120px]" />
      </div>

      <div className="min-h-full flex flex-col items-center justify-center p-6 py-12">
      <div className="w-full max-w-xl z-10 relative">
        {step < 4 && (
          <div className="flex items-center justify-center gap-2 mb-10">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    i === step
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/30 scale-110"
                      : i < step
                        ? "bg-blue-100 text-blue-600"
                        : "bg-white/60 text-slate-400 border border-slate-200/50"
                  }`}
                >
                  {i < step ? "\u2713" : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-10 h-1 rounded-full transition-all duration-300 ${i < step ? "bg-blue-400/80" : "bg-white/60 border border-slate-100/50"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="backdrop-blur-3xl bg-white/90 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] shadow-blue-900/5 border border-white p-10 ring-1 ring-slate-100/50">
          {step === 0 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className={headingClass}>Let's set up your companion</h2>
              <p className={descriptionClass}>Tell us a bit about yourself so your companion can get to know you.</p>
              
              <label className={labelClass}>Your Name</label>
              <input
                type="text"
                value={form.user.name}
                onChange={(e) => updateForm("user", "name", e.target.value)}
                placeholder="What should your companion call you?"
                className={inputClass}
              />
              
              <label className={labelClass}>About Yourself</label>
              <textarea
                value={form.user.about}
                onChange={(e) => updateForm("user", "about", e.target.value)}
                placeholder="Tell your companion a bit about yourself — your interests, what you do..."
                rows={4}
                className={`${inputClass} resize-none mb-2 rounded-3xl`}
              />
            </div>
          )}

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className={headingClass}>Connect your AI brain</h2>
              <p className={descriptionClass}>Choose an LLM provider. Any OpenAI-compatible API works.</p>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                {Object.entries(llmPresets).map(([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => selectLLMPreset(id)}
                    className={`px-4 py-3.5 rounded-2xl text-[14px] font-semibold border transition-all ${
                      form.llm.provider === id
                        ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              
              {form.llm.provider && (
                <div className="animate-in fade-in duration-300">
                  {llmPresets[form.llm.provider]?.needs_key !== false && (
                    <>
                      <label className={labelClass}>API Key</label>
                      <input
                        type="password"
                        value={form.llm.api_key}
                        onChange={(e) => { updateForm("llm", "api_key", e.target.value); setTestResult(null); }}
                        placeholder="Paste your API key"
                        className={inputClass}
                      />
                    </>
                  )}
                  
                  <label className={labelClass}>Model</label>
                  <input
                    type="text"
                    value={form.llm.model}
                    onChange={(e) => { updateForm("llm", "model", e.target.value); setTestResult(null); }}
                    placeholder="e.g. gpt-4o"
                    className={inputClass}
                  />
                  
                  {form.llm.provider === "custom" && (
                    <>
                      <label className={labelClass}>Base URL</label>
                      <input
                        type="text"
                        value={form.llm.base_url}
                        onChange={(e) => { updateForm("llm", "base_url", e.target.value); setTestResult(null); }}
                        placeholder="https://api.example.com/v1"
                        className={inputClass}
                      />
                    </>
                  )}
                  
                  <button
                    onClick={testConnection}
                    disabled={testing}
                    className="w-full py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 text-[15px] font-medium hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 transition-all mb-4"
                  >
                    {testing ? "Testing..." : "Test Connection"}
                  </button>
                  
                  {testResult && (
                    <div className={`px-5 py-4 rounded-2xl text-[15px] font-medium animate-in fade-in ${
                      testResult.success
                        ? "bg-green-50 text-green-700 border border-green-200/50 shadow-sm"
                        : "bg-red-50 text-red-700 border border-red-200/50 shadow-sm"
                    }`}>
                      {testResult.success ? "Connected successfully!" : testResult.error || "Connection failed"}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className={headingClass}>Choose a voice</h2>
              <p className={descriptionClass}>Pick a TTS provider and voice for your companion.</p>
              
              <label className={labelClass}>TTS Provider</label>
              <div className="flex flex-wrap gap-3 mb-6">
                {Object.entries(ttsPresets).map(([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => updateForm("tts", "provider", id)}
                    className={`px-4 py-3 rounded-2xl text-[14px] font-semibold border transition-all ${
                      form.tts.provider === id
                        ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              
              <div className="animate-in fade-in duration-300">
                {ttsPresets[form.tts.provider]?.needs_key && (
                  <>
                    <label className={labelClass}>API Key</label>
                    <input
                      type="password"
                      value={form.tts.api_key}
                      onChange={(e) => updateForm("tts", "api_key", e.target.value)}
                      placeholder="Paste your API key"
                      className={inputClass}
                    />
                  </>
                )}
                
                <label className={labelClass}>Voice</label>
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <select
                      value={form.tts.voice}
                      onChange={(e) => updateForm("tts", "voice", e.target.value)}
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
                    onClick={playSample}
                    className="px-6 rounded-2xl bg-white border border-slate-200 text-blue-600 text-[15px] font-semibold hover:bg-slate-50 hover:border-blue-200 shadow-sm transition-all"
                  >
                    Play Sample
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className={headingClass}>Create your companion</h2>
              <p className={descriptionClass}>Give your companion a name and personality.</p>
              
              <label className={labelClass}>Companion Name</label>
              <input
                type="text"
                value={form.companion.name}
                onChange={(e) => updateForm("companion", "name", e.target.value)}
                placeholder="What's your companion's name?"
                className={inputClass}
              />
              
              <label className={labelClass}>Vibe</label>
              <div className="flex flex-wrap gap-2.5 mb-6">
                {VIBES.map((vibe) => (
                  <button
                    key={vibe}
                    onClick={() => selectVibe(vibe)}
                    className={`px-4 py-2 rounded-full text-[14px] font-semibold border transition-all ${
                      form.companion.vibe === vibe
                        ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {vibe}
                  </button>
                ))}
              </div>
              
              <label className={labelClass}>Personality</label>
              <textarea
                value={form.companion.personality}
                onChange={(e) => updateForm("companion", "personality", e.target.value)}
                placeholder="Describe your companion's personality... e.g., cheerful and energetic, calm and wise, playful and sarcastic"
                rows={4}
                className={`${inputClass} resize-none rounded-3xl`}
              />
              
              <label className={labelClass}>Model</label>
              {models.length > 1 ? (
                <div className="relative mb-2">
                  <select
                    value={form.companion.model_id}
                    onChange={(e) => updateForm("companion", "model_id", e.target.value)}
                    className={`${inputClass} appearance-none cursor-pointer mb-0`}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.id} ({m.type})</option>
                    ))}
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100/80 text-slate-600 text-sm mb-2 shadow-sm font-medium">
                  Using default model (haru).
                  <span className="block text-[13px] text-slate-400 font-normal mt-1.5 leading-relaxed">
                    To use a custom model, place it in models/live2d/ or models/vrm/ and restart.
                  </span>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-12 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-gradient-to-tr from-green-400 to-emerald-400 text-white shadow-lg shadow-green-500/30 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
                {"\u2713"}
              </div>
              <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">You're all set!</h2>
              <p className="text-slate-500 text-[16px] max-w-sm mx-auto">Meet <span className="font-semibold text-blue-600">{form.companion.name}</span>. Loading your companion now...</p>
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}

          {step < 4 && (
            <div className="flex justify-between mt-10 space-x-4">
              <button
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                className={`w-1/3 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 text-[15px] font-medium transition-all ${
                  step === 0 ? "opacity-0 pointer-events-none" : "hover:bg-slate-50 hover:border-slate-300 shadow-sm"
                }`}
              >
                Back
              </button>
              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="flex-1 py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5 transition-all active:translate-y-0"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={!canProceed() || submitting}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[15px] font-semibold hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5 transition-all active:translate-y-0"
                >
                  {submitting ? "Setting up..." : "Finish"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
