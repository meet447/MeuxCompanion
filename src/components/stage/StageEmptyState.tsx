import { Mascot, AsciiAccent, Button } from "../ui";

export function StageEmptyState({
  characterName,
  agentReady,
  onOpenSettings,
}: {
  characterName: string;
  agentReady: boolean;
  onOpenSettings: () => void;
}) {
  if (!agentReady) {
    return (
      <div className="pointer-events-auto flex max-w-sm flex-col items-center text-center">
        <Mascot mood="thinking" className="h-16 w-16" />
        <p className="mt-4 text-sm font-semibold text-ink">Your assistant isn&apos;t ready yet</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          Chat needs an assistant on this computer. Install one in Settings, then say hello to{" "}
          {characterName}.
        </p>
        <Button variant="primary" size="sm" className="mt-4" onClick={onOpenSettings}>
          Open settings
        </Button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none flex max-w-sm flex-col items-center text-center">
      <Mascot mood="neutral" className="h-16 w-16" />
      <p className="mt-4 text-sm font-semibold text-ink">Say hello to {characterName}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">
        Share what&apos;s on your mind: a small update, a worry, or just because you want to talk.
      </p>
      <AsciiAccent rows={3} cols={18} density={0.7} className="mt-4" />
    </div>
  );
}
