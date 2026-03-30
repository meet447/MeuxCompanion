import { useCallback, useEffect, useMemo, useState } from "react";
import { getMemory, searchMemory, clearMemory, clearChat } from "../api/tauri";
import type { MemoryRecord } from "../types";

interface Props {
  characterId?: string;
  characterName: string;
  onConversationCleared?: () => void;
}

const sectionCardClass =
  "rounded-[1.75rem] border border-slate-200/70 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]";

export function MemoryStatePanel({ characterId, characterName, onConversationCleared }: Props) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "memories" | "conversation">(null);

  const refresh = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const memoryData = await getMemory(characterId);
      const mems = (memoryData as MemoryRecord[]) || [];
      setMemories(mems);
      setResults([]);
    } catch (err) {
      console.error("Memory panel refresh error:", err);
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
        Select a character to inspect memory.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="mb-6 rounded-[2rem] border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(219,234,254,0.6),_rgba(255,255,255,1)_50%)] px-5 py-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Memory Core</div>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{characterName}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Inspect what the companion remembers from your conversations. Memories are stored locally on your machine.
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
              placeholder="Search for preferences, facts..."
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
                No long-term memories stored yet. Start chatting and the companion will begin writing memories locally.
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
              Clear chat history to restart the conversation without deleting long-term memories.
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
