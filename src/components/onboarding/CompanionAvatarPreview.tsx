import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
/** Give the previous WebGL context time to release after main-stage unmount / model switch. */
const CANVAS_MOUNT_DELAY_MS = 250;

export function CompanionAvatarPreview({
  model,
  companionName,
  vibeLabel,
  className,
  thumbnailUrl,
}: {
  model: PreviewModel | null;
  companionName?: string;
  vibeLabel?: string;
  className?: string;
  /** Optional marketplace thumbnail — used as VRM fallback when live WebGL fails. */
  thumbnailUrl?: string | null;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [portalBox, setPortalBox] = useState<DOMRect | null>(null);

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
    const timer = window.setTimeout(() => setCanvasReady(true), CANVAS_MOUNT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [model?.type, model?.id, url]);

  const syncPortalBox = () => {
    const el = slotRef.current;
    if (!el) {
      setPortalBox(null);
      return;
    }
    setPortalBox(el.getBoundingClientRect());
  };

  useLayoutEffect(() => {
    if (!model || model.type !== "vrm" || !url || !canvasReady) {
      setPortalBox(null);
      return;
    }
    syncPortalBox();
    const onResize = () => syncPortalBox();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (slotRef.current) ro.observe(slotRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [model, url, canvasReady]);

  const showCanvas = Boolean(model && url && canvasReady);
  const useVrmPortal = showCanvas && model?.type === "vrm" && portalBox && portalBox.width > 1 && portalBox.height > 1;

  const labels = (
    <>
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
    </>
  );

  const vrmPortal =
    useVrmPortal && portalBox
      ? createPortal(
          <div
            className="pointer-events-auto overflow-hidden rounded-panel"
            style={{
              position: "fixed",
              left: portalBox.left,
              top: portalBox.top,
              width: portalBox.width,
              height: portalBox.height,
              zIndex: 200,
              background: previewBg,
            }}
          >
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-sm text-ink-3">
                  Loading avatar…
                </div>
              }
            >
              <VRMCanvas
                key={`${model!.type}-${model!.id}`}
                modelPath={url}
                animations={undefined}
                expression="neutral"
                speaking={false}
                userTyping={false}
                background={previewBg}
                zoom={0.9}
                framing="full"
                onZoomChange={noop}
                onFramingChange={noop}
                onBackgroundChange={noop}
                uiMode="mini"
              />
            </Suspense>
            {companionName?.trim() && (
              <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink shadow-soft">
                {companionName.trim()}
              </div>
            )}
            {vibeLabel && (
              <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink shadow-soft">
                {vibeLabel}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={slotRef}
      className={cn(
        "relative w-full overflow-hidden rounded-card bg-well",
        className ?? "h-[180px]",
      )}
    >
      {!useVrmPortal && labels}
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
      {model?.type === "vrm" && thumbnailUrl && !useVrmPortal && showCanvas && (
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {showCanvas && model?.type !== "vrm" && (
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">
              Loading avatar…
            </div>
          }
        >
          <div className="absolute inset-0">
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
          </div>
        </Suspense>
      )}
      {vrmPortal}
    </div>
  );
}
