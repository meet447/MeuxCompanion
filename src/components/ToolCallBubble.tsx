interface ToolCallStatus {
  requestId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: "running" | "completed" | "failed" | "awaiting_confirmation";
  result?: string;
}

interface ConfirmRequest {
  requestId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  description: string;
}

const TOOL_ICONS: Record<string, string> = {
  read_file: "\u{1F4C4}",
  list_directory: "\u{1F4C2}",
  summarize_file: "\u{1F4DD}",
  move_file: "\u{27A1}\uFE0F",
  delete_file: "\u{1F5D1}\uFE0F",
  run_command: "\u{1F4BB}",
  open_application: "\u{1F680}",
  organize_desktop: "\u{1F9F9}",
  web_search: "\u{1F50D}",
};

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  if (entries.length === 1) return String(entries[0][1]);
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

export function ToolCallBubble({
  call,
  onConfirm,
}: {
  call: ToolCallStatus;
  onConfirm?: (requestId: string, approved: boolean) => void;
}) {
  const icon = TOOL_ICONS[call.toolName] || "\u{1F527}";
  const displayName = formatToolName(call.toolName);
  const argsPreview = formatArgs(call.arguments);

  return (
    <div className="flex flex-col items-start my-2">
      <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-slate-50 border border-slate-200/60 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{icon}</span>
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
            {displayName}
          </span>
          {call.status === "running" && (
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          {call.status === "completed" && (
            <span className="text-green-500 text-xs font-bold">\u2713</span>
          )}
          {call.status === "failed" && (
            <span className="text-red-500 text-xs font-bold">\u2717</span>
          )}
          {call.status === "awaiting_confirmation" && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </div>

        {/* Args preview */}
        {argsPreview && (
          <p className="text-[12px] text-slate-500 truncate max-w-[300px] mb-1">
            {argsPreview}
          </p>
        )}

        {/* Result preview */}
        {call.result && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-200/50">
            <p className="text-[12px] text-slate-600 line-clamp-3 whitespace-pre-wrap">
              {call.result.length > 300
                ? call.result.slice(0, 300) + "..."
                : call.result}
            </p>
          </div>
        )}

        {/* Confirmation buttons */}
        {call.status === "awaiting_confirmation" && onConfirm && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onConfirm(call.requestId, true)}
              className="px-3 py-1.5 text-[11px] font-semibold bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
            >
              Allow
            </button>
            <button
              onClick={() => onConfirm(call.requestId, false)}
              className="px-3 py-1.5 text-[11px] font-semibold bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300 transition-colors"
            >
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export type { ToolCallStatus, ConfirmRequest };
