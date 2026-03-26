interface Props {
  listening: boolean;
  onToggle: () => void;
}

export function MicButton({ listening, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-xl px-3 py-2 text-sm transition-colors ${
        listening
          ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
          : "bg-gray-700 hover:bg-gray-600 text-gray-300"
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
