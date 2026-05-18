import { ComposioToolkitIcon, toolkitColorClasses } from "./ComposioToolkitIcon";
import { COMPOSIO_TOOLKITS } from "../lib/composioToolkits";
import type { ComposioToolkitStatus } from "../types";

interface Props {
  enabledToolkits: string[];
  statuses?: ComposioToolkitStatus[];
  onToggle: (slug: string) => void;
  onConnect?: (slug: string) => void;
  onRefresh?: (slug: string) => void;
  compact?: boolean;
}

export function ComposioToolkitPicker({
  enabledToolkits,
  statuses = [],
  onToggle,
  onConnect,
  onRefresh,
  compact = false,
}: Props) {
  const statusBySlug = new Map(statuses.map((status) => [status.slug, status]));

  return (
    <ToolkitGrid compact={compact}>
      {COMPOSIO_TOOLKITS.map((toolkit) => (
        <ToolkitCard
          key={toolkit.slug}
          enabled={enabledToolkits.includes(toolkit.slug)}
          toolkit={toolkit}
          connected={Boolean(statusBySlug.get(toolkit.slug)?.connected)}
          status={statusBySlug.get(toolkit.slug)}
          colors={toolkitColorClasses(toolkit.slug)}
          compact={compact}
          onToggle={onToggle}
          onConnect={onConnect}
          onRefresh={onRefresh}
        />
      ))}
    </ToolkitGrid>
  );
}

function ToolkitCard({
  enabled,
  toolkit,
  connected,
  status,
  colors,
  compact,
  onToggle,
  onConnect,
  onRefresh,
}: {
  enabled: boolean;
  toolkit: (typeof COMPOSIO_TOOLKITS)[number];
  connected: boolean;
  status?: ComposioToolkitStatus;
  colors: { bg: string; text: string };
  compact: boolean;
  onToggle: (slug: string) => void;
  onConnect?: (slug: string) => void;
  onRefresh?: (slug: string) => void;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 transition-all ${
        enabled ? "border-blue-300 bg-blue-50/70 shadow-sm" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <ComposioToolkitIcon slug={toolkit.slug} withBackground />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{toolkit.name}</span>
            {connected && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Connected
              </span>
            )}
          </div>
          {status?.status && (
            <div className={`mt-1 text-[11px] font-medium ${connected ? "text-emerald-600" : "text-amber-600"}`}>
              {status.status}
            </div>
          )}
          {!compact && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{toolkit.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onToggle(toolkit.slug)}
          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
            enabled ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-500"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
      {(onConnect || onRefresh) && enabled && (
        <div className="mt-3 flex gap-2">
          {onConnect && (
            <button
              type="button"
              onClick={() => onConnect(toolkit.slug)}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${colors.bg} ${colors.text} border-transparent`}
            >
              {connected ? "Reconnect" : "Connect"}
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh(toolkit.slug)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
            >
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ToolkitGrid({
  compact,
  children,
}: {
  compact: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>{children}</div>
  );
}
