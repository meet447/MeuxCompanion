import { useAppUpdater } from "../../hooks/useAppUpdater";
import { openExternalUrl } from "../../lib/openExternal";
import { Button, Notice, Pill, SectionTitle, Surface } from "../ui";

const RELEASES_URL = "https://github.com/meet447/Meuxe/releases";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdatesSection() {
  const { appVersion, enabled, state, check, install, restart } = useAppUpdater();

  if (!enabled) {
    return (
      <Surface tone="well" elevation="none" className="p-5">
        <SectionTitle>App updates</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          In-app updates are available in the installed Meuxe app. Downloads from{" "}
          <button
            type="button"
            className="font-medium text-accent-600 underline-offset-2 hover:underline"
            onClick={() => void openExternalUrl(RELEASES_URL)}
          >
            GitHub Releases
          </button>{" "}
          always work in the browser build.
        </p>
      </Surface>
    );
  }

  const isBusy = state.status === "checking" || state.status === "downloading";

  return (
    <Surface tone="well" elevation="none" className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>App updates</SectionTitle>
        <Pill tone="neutral">v{appVersion}</Pill>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Meuxe checks GitHub Releases for signed updates. Your chat, memories, and settings stay on this device.
      </p>

      {state.status === "error" && (
        <Notice tone="danger" className="mt-4">
          {state.message}
        </Notice>
      )}

      {state.status === "available" && (
        <Notice tone="info" className="mt-4">
          Meuxe {state.update.version} is available.
          {state.update.notes ? (
            <span className="mt-2 block whitespace-pre-wrap text-ink-2">{state.update.notes}</span>
          ) : null}
        </Notice>
      )}

      {state.status === "downloading" && (
        <Notice tone="info" className="mt-4">
          Downloading Meuxe {state.update.version}…
          {state.progress.total != null
            ? ` ${formatBytes(state.progress.downloaded)} / ${formatBytes(state.progress.total)}`
            : state.progress.downloaded > 0
              ? ` ${formatBytes(state.progress.downloaded)} downloaded`
              : null}
        </Notice>
      )}

      {state.status === "ready" && (
        <Notice tone="success" className="mt-4">
          Meuxe {state.update.version} is installed. Restart to finish.
        </Notice>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {state.status === "ready" ? (
          <Button variant="primary" onClick={() => void restart()}>
            Restart Meuxe
          </Button>
        ) : state.status === "available" || state.status === "downloading" ? (
          <Button variant="primary" loading={state.status === "downloading"} onClick={() => void install()}>
            {state.status === "downloading" ? "Downloading…" : "Install update"}
          </Button>
        ) : (
          <Button variant="secondary" loading={state.status === "checking"} onClick={() => void check()}>
            Check for updates
          </Button>
        )}

        <Button
          variant="ghost"
          disabled={isBusy}
          onClick={() => void openExternalUrl(RELEASES_URL)}
        >
          View releases
        </Button>
      </div>
    </Surface>
  );
}
