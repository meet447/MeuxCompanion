import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getMemory, searchMemory, clearMemory, getState, clearChat } from "../api/tauri";
import type { CharacterState, MemoryRecord } from "../types";

interface Props {
  characterId?: string;
  characterName: string;
  onConversationCleared?: () => void;
  onStateChanged?: () => void;
}

const sectionCardClass =
  "rounded-[1.75rem] border border-slate-200/70 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]";

function meterTone(value: number): string {
  if (value >= 0.7) return "from-emerald-400 to-teal-500";
  if (value >= 0.35) return "from-amber-400 to-orange-500";
  return "from-slate-300 to-slate-400";
}

function MoodOrb({ mood }: { mood: string }) {
  const moodStyles: Record<string, string> = {
    warm: "bg-gradient-to-br from-rose-200 via-orange-100 to-amber-100 text-rose-700 border-rose-200",
    concerned: "bg-gradient-to-br from-blue-100 via-slate-100 to-indigo-100 text-blue-700 border-blue-200",
    neutral: "bg-gradient-to-br from-slate-100 via-white to-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <div
      className={`flex h-20 w-20 items-center justify-center rounded-[1.5rem] border text-center text-[11px] font-bold uppercase tracking-[0.24em] ${moodStyles[mood] || moodStyles.neutral}`}
    >
      {mood}
    </div>
  );
}

function StateMeter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-gradient-to-r ${meterTone(value)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function MemoryStatePanel({ characterId, characterName, onConversationCleared, onStateChanged }: Props) {
  const [state, setState] = useState<CharacterState | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "memories" | "state" | "conversation">(null);

  const refresh = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const [memoryData, stateData] = await Promise.all([
        getMemory(characterId),
        getState(characterId),
      ]);
      const mems = (memoryData as MemoryRecord[]) || [];
      setMemories(mems);
      setState((stateData as CharacterState) || null);
      setResults([]);
    } catch (err) {
      console.error("Memory panel refresh error:", err);
      setState(null);
      setMemories([]);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSearch = useCallback(async () => {
    if (!characterId || !query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await searchMemory(characterId, query.trim());
      setResults((data as MemoryRecord[]) || []);
    } catch (err) {
      console.error("Memory search error:", err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [characterId, query]);

  const clearMemories = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("memories");
    try {
      await clearMemory(characterId);
      await refresh();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  const resetState = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("state");
    try {
      // TODO: implement Tauri command — state_reset does not exist yet
      await invoke("state_reset", { characterId }).catch(() => {
        console.warn("state_reset command not implemented yet");
      });
      await refresh();
      onStateChanged?.();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh, onStateChanged]);

  const clearConversation = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("conversation");
    try {
      await clearChat(characterId);
      await onConversationCleared?.();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, onConversationCleared]);

  const groupedMemoryLabel = useMemo(() => {
    const counts = memories.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type} ${count}`)
      .join(" \u00B7 ");
  }, [memories]);

  if (!characterId) {
    return (
      <div className="p-6 text-sm text-slate-400">
        Select a character to inspect memory and relational state.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="mb-6 rounded-[2rem] border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(254,226,226,0.9),_rgba(255,255,255,1)_38%,_rgba(219,234,254,0.95)_100%)] px-5 py-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Companion Memory Core</div>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{characterName}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Inspect what the backend remembers, how the relationship is evolving, and reset layers when you want a clean slate.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-full border border-white/90 bg-white/90 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
        {groupedMemoryLabel && (
          <div className="mt-5 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-xs font-medium text-slate-500 shadow-sm">
            {groupedMemoryLabel}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <section className={sectionCardClass}>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Relational State</div>
              <h4 className="mt-2 text-lg font-bold text-slate-800">Persistent emotional baseline</h4>
            </div>
            <MoodOrb mood={state?.mood || "neutral"} />
          </div>

          <div className="space-y-4">
            <StateMeter label="Trust" value={state?.trust ?? 0} />
            <StateMeter label="Affection" value={state?.affection ?? 0} />
            <StateMeter label="Energy" value={state?.energy ?? 0.7} />
          </div>

          <div className="mt-5 rounded-[1.5rem] bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-600">
            {state?.relationship_summary || "The relationship is still forming. Interactions will shape how the companion responds over time."}
          </div>

          <button
            onClick={resetState}
            disabled={busyAction !== null}
            className="mt-5 w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-amber-700 transition-all hover:bg-amber-100 disabled:opacity-50"
          >
            {busyAction === "state" ? "Resetting State..." : "Reset State"}
          </button>
        </section>

        <section className={sectionCardClass}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Memory Search</div>
              <h4 className="mt-2 text-lg font-bold text-slate-800">Probe the local archive</h4>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {memories.length} entries
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for preferences, facts, or relationship beats..."
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="rounded-2xl bg-slate-800 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-white transition-all hover:-translate-y-0.5 hover:bg-slate-900"
            >
              {searching ? "Searching" : "Search"}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-4 space-y-3">
              {results.map((memory) => (
                <div key={memory.id} className="rounded-[1.4rem] border border-blue-100 bg-blue-50/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">{memory.type}</span>
                    <span className="text-[11px] font-medium text-blue-400">importance {Math.round(memory.importance * 100)}%</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{memory.summary}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {memories.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">
                No long-term memories stored yet. Start chatting and the backend will begin writing semantic and episodic memories locally.
              </div>
            ) : (
              memories.slice(0, 8).reverse().map((memory) => (
                <div key={memory.id} className="rounded-[1.45rem] border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{memory.type}</span>
                    <span className="text-[11px] text-slate-400">{new Date(memory.ts).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{memory.summary}</p>
                  {memory.tags?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {memory.tags.slice(0, 6).map((tag) => (
                        <span key={`${memory.id}-${tag}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <button
            onClick={clearMemories}
            disabled={busyAction !== null}
            className="mt-5 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-rose-700 transition-all hover:bg-rose-100 disabled:opacity-50"
          >
            {busyAction === "memories" ? "Clearing Memories..." : "Clear Memories"}
          </button>
        </section>

        <section className={`${sectionCardClass} bg-[linear-gradient(135deg,rgba(248,250,252,1),rgba(255,247,237,0.82))]`}>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Conversation Archive</div>
            <h4 className="mt-2 text-lg font-bold text-slate-800">Session control</h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              The backend now stores chat history per character. Clear it here if you want to restart the ongoing conversation without deleting long-term memories.
            </p>
          </div>
          <button
            onClick={clearConversation}
            disabled={busyAction !== null}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-white transition-all hover:-translate-y-0.5 hover:bg-black disabled:opacity-50"
          >
            {busyAction === "conversation" ? "Clearing Conversation..." : "Clear Conversation"}
          </button>
        </section>
      </div>
    </div>
  );
}
