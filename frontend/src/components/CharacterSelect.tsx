import type { Character } from "../types";

interface Props {
  characters: Character[];
  selected: string;
  onSelect: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}

export function CharacterSelect({
  characters,
  selected,
  onSelect,
  open,
  onToggle,
}: Props) {
  return (
    <div className="relative flex items-center">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 hover:bg-slate-100/80 text-slate-600 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4 text-blue-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Characters
        <svg className={`w-3.5 h-3.5 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-white/95 backdrop-blur-md border border-slate-100 rounded-2xl shadow-xl shadow-blue-900/10 z-50 overflow-hidden transform origin-top-right transition-all">
            <div className="px-4 py-3 border-b border-slate-50 bg-slate-50/50">
              <h3 className="text-slate-700 font-semibold text-sm">
                Select Model
              </h3>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    onSelect(char.id);
                    onToggle();
                  }}
                  className={`w-full text-left px-4 py-3 text-sm transition-all rounded-xl mb-1 flex items-center justify-between group ${
                    selected === char.id
                      ? "bg-blue-50 text-blue-700 font-medium ring-1 ring-blue-100"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <div>
                    <div className={selected === char.id ? "font-semibold" : "font-medium group-hover:text-blue-600 transition-colors"}>{char.name}</div>
                    <div className={`text-xs mt-1 ${selected === char.id ? "text-blue-500/80" : "text-slate-400"}`}>
                      Model: {char.live2d_model || "none"}
                    </div>
                  </div>
                  {selected === char.id && (
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  )}
                </button>
              ))}
              {characters.length === 0 && (
                <div className="px-4 py-6 text-center text-slate-500 text-sm bg-slate-50/50 rounded-xl m-2 border border-dashed border-slate-200">
                  No characters found.<br/>Add .md files to characters/
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
