import { useRef, useEffect, useState, memo } from "react";
import { useVRM } from "../hooks/useVRM";
import type { AnimationInfo } from "../types";
import { LoadingOverlay } from "./LoadingOverlay";

interface Props {
  modelPath: string | null;
  animations?: AnimationInfo[];
  expression: string;
  speaking: boolean;
  userTyping: boolean;
  uiMode?: "full" | "mini";
  background: string;
  zoom: number;
  framing: "full" | "half";
  onZoomChange?: (zoom: number) => void;
  onFramingChange?: (framing: "full" | "half") => void;
  onBackgroundChange?: (bg: string) => void;
  getAudioLevels?: () => { volume: number; mouthOpen: number; mouthForm: number };
}

export const VRMCanvas = memo(function VRMCanvas({
  modelPath,
  animations,
  expression,
  speaking,
  userTyping,
  uiMode = "full",
  background,
  zoom,
  framing,
  getAudioLevels,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    setViewport,
    setTypingReaction,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    lastError,
  } = useVRM(canvasRef);
  const prevExpression = useRef<string>("");
  const expressionRef = useRef(expression);
  expressionRef.current = expression;
  const loadModelRef = useRef(loadModel);
  loadModelRef.current = loadModel;
  const setViewportRef = useRef(setViewport);
  setViewportRef.current = setViewport;
  const setExpressionRef = useRef(setExpression);
  setExpressionRef.current = setExpression;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const [modelLoading, setModelLoading] = useState(false);

  useEffect(() => {
    if (!modelPath) return;

    let cancelled = false;
    setModelLoading(true);
    loadModelRef.current(modelPath, animations, backgroundRef.current)
      .then(() => {
        if (cancelled) return;
        setViewportRef.current(zoom, framing);
        const expr = expressionRef.current;
        if (expr) {
          prevExpression.current = expr;
          setExpressionRef.current(expr);
        }
      })
      .finally(() => {
        if (!cancelled) setModelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modelPath, animations]);

  useEffect(() => {
    if (expression && expression !== prevExpression.current) {
      prevExpression.current = expression;
      setExpression(expression);
    }
  }, [expression, setExpression]);

  useEffect(() => {
    if (speaking) {
      startLipSync(getAudioLevels);
    } else {
      stopLipSync();
    }
  }, [speaking, startLipSync, stopLipSync, getAudioLevels]);

  useEffect(() => {
    setViewport(zoom, framing);
  }, [zoom, framing, setViewport]);

  useEffect(() => {
    setTypingReaction(userTyping);
  }, [userTyping, setTypingReaction]);

  const showMiniUi = uiMode === "mini";

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background }}>
      <LoadingOverlay
        visible={modelLoading}
        message="Loading VRM model..."
        subMessage="Please wait"
        variant="model"
      />
      {lastError && !modelLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <p className="text-sm text-ink-2">
            Failed to load VRM: {lastError}
          </p>
        </div>
      )}
      {!modelPath && !showMiniUi && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <div>
            <p className="text-lg font-medium text-ink-2">No VRM model loaded</p>
            <p className="mt-2 text-sm text-ink-3">
              Add a <code className="rounded-[6px] bg-well px-1 font-mono text-[12px] text-ink-2">.vrm</code> file to <code className="rounded-[6px] bg-well px-1 font-mono text-[12px] text-ink-2">models/vrm/</code>
            </p>
          </div>
        </div>
      )}
      {!modelPath && showMiniUi && (
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <p className="text-lg text-ink-3">No VRM model loaded</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full cursor-grab active:cursor-grabbing"
        style={{
          display: modelPath ? "block" : "none",
          touchAction: "none",
          transform: "translateZ(0)",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </div>
  );
});
