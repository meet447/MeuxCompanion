import { useAppUpdater } from "../hooks/useAppUpdater";
import { Button, Notice } from "./ui";

export function UpdateBanner() {
  const { enabled, state, install, restart } = useAppUpdater({ autoCheck: true });

  if (!enabled) return null;

  if (state.status === "ready") {
    return (
      <div className="absolute inset-x-0 top-0 z-[90] px-4 pt-3">
        <Notice tone="success" className="mx-auto max-w-2xl shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Meuxe {state.update.version} is ready. Restart to finish updating.</span>
            <Button variant="primary" size="sm" onClick={() => void restart()}>
              Restart
            </Button>
          </div>
        </Notice>
      </div>
    );
  }

  if (state.status !== "available") return null;

  return (
    <div className="absolute inset-x-0 top-0 z-[90] px-4 pt-3">
      <Notice tone="info" className="mx-auto max-w-2xl shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Meuxe {state.update.version} is available.</span>
          <Button variant="primary" size="sm" onClick={() => void install()}>
            Update
          </Button>
        </div>
      </Notice>
    </div>
  );
}
