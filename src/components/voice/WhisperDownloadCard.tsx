import { Button, Notice } from "../ui";

export function WhisperDownloadCard({
  progress,
  error,
  downloading,
  onDownload,
}: {
  progress: { received: number; total: number | null } | null;
  error: string | null;
  downloading: boolean;
  onDownload: () => void;
}) {
  const total = progress?.total ?? 0;
  const received = progress?.received ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;

  return (
    <Notice tone="info" title="On-device listening">
      <p>
        The first time you use the mic, Meuxe downloads a small speech model (~75 MB) from Hugging
        Face. After that, transcription stays on this computer.
      </p>
      {total > 0 && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-well-2">
            <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-3">
            {pct}% ({Math.round(received / (1024 * 1024))} MB)
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-clay-700">{error}</p>}
      <Button
        variant="primary"
        size="sm"
        className="mt-3"
        loading={downloading}
        onClick={onDownload}
      >
        {error ? "Try again" : "Download speech model"}
      </Button>
    </Notice>
  );
}
