import { memo } from "react";
import { toolkitBySlug } from "../lib/composioToolkits";

const BRAND_ICONS: Record<string, string> = {
  github:
    "M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.12-1.46-1.12-1.46-.92-.63.07-.62.07-.62 1.02.07 1.56 1.05 1.56 1.05.9 1.55 2.36 1.1 2.94.84.09-.66.35-1.1.64-1.35-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0112 6.8c.85.004 1.71.11 2.51.32 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.16.58.67.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z",
  gmail: "M4 6h16v12H4V6zm2 2v8h12V8l-6 4-6-4zm0-2l6 4 6-4H6z",
  slack:
    "M14.5 10a1.5 1.5 0 110-3H13V5.5a1.5 1.5 0 10-3 0V7H8.5a1.5 1.5 0 100 3H10v1.5a1.5 1.5 0 103 0V10h1.5zM10 14.5a1.5 1.5 0 110 3H8.5V19a1.5 1.5 0 103 0v-1.5H13a1.5 1.5 0 100-3H11v-1.5a1.5 1.5 0 10-3 0V14.5H10z",
  notion:
    "M6 5h12v14H6V5zm2 2v10h8V7H8zm1.5 1.5h5v1h-5v-1zm0 2.5h5v1h-5v-1zm0 2.5h3.5v1H9.5v-1z",
  googlecalendar:
    "M7 4V3h2v1h6V3h2v1h2v16H5V4h2zm0 4h10V6H7v2zm1 3h2v2H8v-2zm4 0h2v2h-2v-2zm-4 4h2v2H8v-2zm4 0h2v2h-2v-2z",
  googledrive:
    "M8.2 7h7.6l4.2 7H4L8.2 7zm-2.4 9h12.4l-2.1 3.5H3.7L5.8 16zM12 3.5 15.8 10H8.2L12 3.5z",
  linear: "M5 19L19 5l-2-2L3 17l2 2z",
  jira: "M11.5 6.5 6.5 11.5 11.5 16.5 16.5 11.5 11.5 6.5zM5 12l6.5 6.5L18 12l-6.5-6.5L5 12z",
  discord:
    "M9 8.5c.8-.3 1.6-.5 2.5-.5 2.2 0 4 1.1 5.2 2.8-1.1.9-2 2.1-2.6 3.5H8.8c-.6-1.4-1.5-2.6-2.6-3.5C7.3 9.6 8.1 8.8 9 8.5zm3.5 7a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm3 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z",
  trello: "M6 5h12v14H6V5zm3 3h3v8H9V8zm5 0h3v5h-3V8z",
  asana: "M12 5.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm-6.5 9a3 3 0 110 6 3 3 0 010-6zm13 0a3 3 0 110 6 3 3 0 010-6z",
  dropbox:
    "M6 8.5 12 5l6 3.5-6 3.5-6-3.5zm12 3.5-6 3.5-6-3.5 2.2 1.3L12 17l3.8-2.2L18 12z",
};

const COLOR_CLASSES: Record<string, { bg: string; text: string }> = {
  slate: { bg: "bg-slate-100", text: "text-slate-700" },
  red: { bg: "bg-red-100", text: "text-red-600" },
  purple: { bg: "bg-purple-100", text: "text-purple-600" },
  blue: { bg: "bg-blue-100", text: "text-blue-600" },
  green: { bg: "bg-green-100", text: "text-green-600" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600" },
  sky: { bg: "bg-sky-100", text: "text-sky-600" },
  rose: { bg: "bg-rose-100", text: "text-rose-600" },
};

export const ComposioToolkitIcon = memo(function ComposioToolkitIcon({
  slug,
  className = "w-4 h-4",
  withBackground = false,
}: {
  slug: string;
  className?: string;
  withBackground?: boolean;
}) {
  const toolkit = toolkitBySlug(slug);
  const color = toolkit?.color ?? "slate";
  const colors = COLOR_CLASSES[color] ?? COLOR_CLASSES.slate;
  const path = BRAND_ICONS[slug];

  const icon = path ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  ) : (
    <span className={`text-[10px] font-bold uppercase ${colors.text}`}>{slug.slice(0, 2)}</span>
  );

  if (!withBackground) {
    return <span className={colors.text}>{icon}</span>;
  }

  return (
    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${colors.bg} ${colors.text}`}>
      {icon}
    </span>
  );
});

export function toolkitColorClasses(slug: string): { bg: string; text: string } {
  const color = toolkitBySlug(slug)?.color ?? "slate";
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.slate;
}
