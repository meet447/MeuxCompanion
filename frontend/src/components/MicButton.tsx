interface Props {
  listening: boolean;
  onToggle: () => void;
}

export function MicButton({ listening, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full p-2.5 transition-colors ${
        listening
          ? "bg-red-100 text-red-500 animate-pulse shadow-sm shadow-red-500/20"
          : "text-slate-400 hover:text-blue-500 hover:bg-blue-50"
      }`}
      title={listening ? "Stop listening" : "Start voice input"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
        <path d="M17 11a1 1 0 10-2 0 3 3 0 01-6 0 1 1 0 10-2 0 5 5 0 004 4.9V19H9a1 1 0 100 2h6a1 1 0 100-2h-2v-3.1A5 5 0 0017 11z" />
      </svg>
    </button>
  );
}
