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
        className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
          open
            ? "bg-blue-50 text-blue-600"
            : "hover:bg-slate-100/80 text-slate-600"
        }`}
      >
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Characters
        <svg className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-3 w-80 backdrop-blur-xl bg-white/95 border border-slate-100/80 rounded-[1.5rem] shadow-[0_12px_40px_rgb(0,0,0,0.08)] shadow-blue-900/5 z-50 overflow-hidden ring-1 ring-slate-200/50 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="px-5 py-4 border-b border-slate-100/80 bg-gradient-to-r from-slate-50/80 to-blue-50/30">
              <h3 className="text-slate-800 font-bold text-[15px] tracking-tight">
                Select Character
              </h3>
              <p className="text-slate-400 text-xs mt-1">Switch your active companion</p>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              {characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    onSelect(char.id);
                    onToggle();
                  }}
                  className={`w-full text-left px-4 py-3.5 transition-all rounded-2xl mb-1.5 flex items-center justify-between group ${
                    selected === char.id
                      ? "bg-blue-50 text-blue-700 font-medium ring-1 ring-blue-200/60 shadow-sm shadow-blue-500/5"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-colors ${
                      selected === char.id
                        ? "bg-blue-500 text-white shadow-sm shadow-blue-500/20"
                        : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600"
                    }`}>
                      {char.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className={`text-[14px] ${selected === char.id ? "font-semibold" : "font-medium group-hover:text-blue-600 transition-colors"}`}>{char.name}</div>
                      <div className={`text-xs mt-0.5 ${selected === char.id ? "text-blue-500/80" : "text-slate-400"}`}>
                        {char.live2d_model || "default model"}
                      </div>
                    </div>
                  </div>
                  {selected === char.id && (
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/30"></div>
                  )}
                </button>
              ))}
              {characters.length === 0 && (
                <div className="px-5 py-8 text-center text-slate-500 text-sm bg-slate-50/50 rounded-2xl m-1 border border-dashed border-slate-200">
                  <div className="mb-3 flex justify-center">
                    <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  No characters found.<br/>
                  <span className="text-xs text-slate-400">Complete onboarding to create one</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
