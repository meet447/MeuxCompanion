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
    <div className="relative">
      <button
        onClick={onToggle}
        className="bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg px-3 py-1.5 text-sm transition-colors"
      >
        Characters
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-stone-800 border border-stone-700/50 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-stone-700/50">
              <h3 className="text-stone-200 font-medium text-sm">
                Select Character
              </h3>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    onSelect(char.id);
                    onToggle();
                  }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    selected === char.id
                      ? "bg-amber-800/50 text-amber-100"
                      : "text-stone-300 hover:bg-stone-700"
                  }`}
                >
                  <div className="font-medium">{char.name}</div>
                  <div className="text-xs opacity-60 mt-0.5">
                    Model: {char.live2d_model || "none"} | Voice: {char.voice}
                  </div>
                </button>
              ))}
              {characters.length === 0 && (
                <div className="px-4 py-3 text-stone-500 text-sm">
                  No characters found. Add .md files to characters/
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
