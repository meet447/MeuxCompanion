import { lazy, Suspense, useEffect, useState } from "react";
import { resolveAssetUrl } from "../../api/tauri";
import { Mascot } from "../ui";
import { cn } from "../ui/cn";

const Live2DCanvas = lazy(() =>
  import("../Live2DCanvas").then((m) => ({ default: m.Live2DCanvas })),
);
const VRMCanvas = lazy(() => import("../VRMCanvas").then((m) => ({ default: m.VRMCanvas })));

import type { PreviewModel } from "./ModelPicker";

export type { PreviewModel };

const noop = () => undefined;
const previewBg = "#f0f0f2";

export function CompanionAvatarPreview({
  model,
  companionName,
  vibeLabel,
  className,
}: {
  model: PreviewModel | null;
  companionName?: string;
  vibeLabel?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (!model?.path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    setCanvasReady(false);
    resolveAssetUrl(model.path)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [model?.path]);

  // Brief gap after URL resolves so the browser can reclaim the previous WebGL context.
  useEffect(() => {
    if (!model || !url) {
      setCanvasReady(false);
      return;
    }
    setCanvasReady(false);
    const timer = window.setTimeout(() => setCanvasReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [model?.type, model?.id, url]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-card bg-well",
        className ?? "h-[180px]",
      )}
    >
      {companionName?.trim() && (
        <div className="absolute left-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink shadow-soft">
          {companionName.trim()}
        </div>
      )}
      {vibeLabel && (
        <div className="absolute right-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink shadow-soft">
          {vibeLabel}
        </div>
      )}
      {!model && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <Mascot mood="sleepy" tone="light" className="h-12 w-12" />
          <p className="text-xs text-ink-3">Your companion will appear here</p>
        </div>
      )}
      {model && (!url || !canvasReady) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">
          Loading avatar…
        </div>
      )}
      {model && url && canvasReady && (
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">
              Loading avatar…
            </div>
          }
        >
          <div
            className="absolute inset-0"
            style={{ transform: "translateZ(0)", isolation: "isolate" }}
          >
            {model.type === "vrm" ? (
              <VRMCanvas
                key={`${model.type}-${model.id}`}
                modelPath={url}
                animations={undefined}
                expression="neutral"
                speaking={false}
                userTyping={false}
                background={previewBg}
                zoom={1}
                framing="half"
                onZoomChange={noop}
                onFramingChange={noop}
                onBackgroundChange={noop}
                uiMode="mini"
              />
            ) : (
              <Live2DCanvas
                key={`${model.type}-${model.id}`}
                modelPath={url}
                modelMapping={null}
                expression="neutral"
                speaking={false}
                userTyping={false}
                background={previewBg}
                zoom={1}
                framing="half"
                onZoomChange={noop}
                onFramingChange={noop}
                onBackgroundChange={noop}
                uiMode="mini"
              />
            )}
          </div>
        </Suspense>
      )}
    </div>
  );
}
