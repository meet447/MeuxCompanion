import { useRef, useEffect, useState, memo } from "react";
import { useLive2D } from "../hooks/useLive2D";
import type { DebugInfo } from "../hooks/useLive2D";
import type { ModelMapping } from "../types";
import { BG_PRESETS } from "../constants/bgPresets";
import { LoadingOverlay } from "./LoadingOverlay";

interface Props {
  modelPath: string | null;
  modelMapping: ModelMapping | null;
  expression: string;
  speaking: boolean;
  userTyping: boolean;
  background: string;
  zoom: number;
  framing: "full" | "half";
  onZoomChange: (zoom: number) => void;
  onFramingChange: (framing: "full" | "half") => void;
  onBackgroundChange: (bg: string) => void;
  getAudioLevels?: () => { volume: number; mouthOpen: number; mouthForm: number };
}

export const Live2DCanvas = memo(function Live2DCanvas({
  modelPath,
  modelMapping,
  expression,
  speaking,
  userTyping,
  background,
  zoom,
  framing,
  onZoomChange,
  onFramingChange,
  onBackgroundChange,
  getAudioLevels,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loadModel, setExpression, startLipSync, stopLipSync, setViewport, setTypingReaction, getDebug } =
    useLive2D(canvasRef);
  const prevModelPath = useRef<string | null>(null);
  const prevExpression = useRef<string>("");
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [modelLoading, setModelLoading] = useState(false);

  useEffect(() => {
    if (modelPath && modelPath !== prevModelPath.current) {
      prevModelPath.current = modelPath;
      setModelLoading(true);
      loadModel(modelPath, modelMapping || undefined).then(() => {
        // apply viewport after load
        setViewport(zoom, framing);
      }).finally(() => setModelLoading(false));
    }
    // Intentionally disabling lint rule - loading state is necessary for model loading UX
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/set-state-syntax-use-give-error-message
  }, [modelPath, modelMapping, loadModel]);

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

  // Poll debug info when debug panel is open
  useEffect(() => {
    if (!showDebug) return;
    const interval = setInterval(() => {
      setDebugInfo(getDebug());
    }, 200);
    return () => clearInterval(interval);
  }, [showDebug, getDebug]);

  return (
    <div
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ background }}
    >
      <LoadingOverlay
        visible={modelLoading}
        message="Loading model..."
        subMessage="Please wait"
        variant="model"
      />
      {!modelPath && (
        <div className="text-amber-200/50 text-center">
          <p className="text-lg">No Live2D model loaded</p>
          <p className="text-sm mt-2">
            Add a model to <code className="text-amber-300/60">models/live2d/</code> and select a character
          </p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ display: modelPath ? "block" : "none" }}
      />

      {/* Debug overlay */}
      {showDebug && debugInfo && (
        <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-sm text-xs font-mono text-green-400 rounded-lg p-3 max-w-xs z-50 space-y-1">
          <div className="text-green-300 font-bold mb-2 flex items-center justify-between">
            <span>Live2D Debug</span>
            <button
              onClick={() => setShowDebug(false)}
              className="text-stone-500 hover:text-stone-300 ml-4"
            >
              X
            </button>
          </div>
          <Row label="Model" value={debugInfo.modelLoaded ? "loaded" : "none"} ok={debugInfo.modelLoaded} />
          <Row label="Emotion" value={debugInfo.currentEmotion || "-"} />
          <Row label="Expression ID" value={debugInfo.expressionId || "-"} />
          <Row label="Motion" value={debugInfo.motionPlaying || "idle"} />
          <Row label="Lip Sync" value={debugInfo.lipSyncActive ? "ON" : "off"} ok={debugInfo.lipSyncActive} />
          <Row label="Mouth Value" value={String(debugInfo.mouthValue)} />
          <div className="border-t border-green-900 pt-1 mt-1">
            <div className="text-stone-500">Mapping Emotions:</div>
            <div className="text-green-300">
              {debugInfo.mappingEmotions.length > 0
                ? debugInfo.mappingEmotions.join(", ")
                : "(none)"}
            </div>
          </div>
          <div>
            <div className="text-stone-500">Model Expressions:</div>
            <div className="text-green-300">
              {debugInfo.availableExpressions.length > 0
                ? debugInfo.availableExpressions.join(", ")
                : "(none)"}
            </div>
          </div>
          <div>
            <div className="text-stone-500">Motion Groups:</div>
            <div className="text-green-300">
              {debugInfo.availableMotionGroups.length > 0
                ? debugInfo.availableMotionGroups.join(", ")
                : "(none)"}
            </div>
          </div>
          {debugInfo.lastError && (
            <div className="text-red-400 border-t border-red-900 pt-1 mt-1">
              {debugInfo.lastError}
            </div>
          )}
        </div>
      )}

      {/* Controls overlay */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        {/* Background picker */}
        <div className="relative">
          <button
            onClick={() => setShowBgPicker(!showBgPicker)}
            className="bg-black/40 hover:bg-black/60 backdrop-blur-sm text-amber-200/70 hover:text-amber-200 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
          >
            BG
          </button>
          {showBgPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowBgPicker(false)} />
              <div className="absolute bottom-full left-0 mb-2 bg-stone-900/95 backdrop-blur-sm border border-stone-700/50 rounded-xl shadow-xl z-50 p-2 w-44">
                <div className="text-xs text-stone-400 px-2 py-1 mb-1">Background</div>
                {BG_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      onBackgroundChange(preset.value);
                      setShowBgPicker(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      background === preset.value
                        ? "bg-amber-900/40 text-amber-200"
                        : "text-stone-300 hover:bg-stone-800"
                    }`}
                  >
                    <div
                      className="w-5 h-5 rounded-md border border-stone-600/50 shrink-0"
                      style={{ background: preset.value }}
                    />
                    {preset.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-lg px-1.5 py-1">
          <button
            onClick={() => onZoomChange(Math.round(Math.max(30, (zoom * 100) - 1)) / 100)}
            className="text-amber-200/70 hover:text-amber-200 text-xs w-5 h-5 flex items-center justify-center transition-colors"
          >
            -
          </button>
          <span className="text-amber-200/60 text-xs w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => onZoomChange(Math.round(Math.min(200, (zoom * 100) + 1)) / 100)}
            className="text-amber-200/70 hover:text-amber-200 text-xs w-5 h-5 flex items-center justify-center transition-colors"
          >
            +
          </button>
        </div>

        {/* Framing toggle */}
        <button
          onClick={() => onFramingChange(framing === "full" ? "half" : "full")}
          className={`backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
            framing === "half"
              ? "bg-blue-900/60 text-blue-400 font-medium"
              : "bg-black/40 hover:bg-black/60 text-amber-200/70 hover:text-amber-200"
          }`}
        >
          {framing.toUpperCase()}
        </button>

        {/* Debug toggle */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className={`backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
            showDebug
              ? "bg-green-900/60 text-green-400"
              : "bg-black/40 hover:bg-black/60 text-amber-200/70 hover:text-amber-200"
          }`}
        >
          DBG
        </button>
      </div>

      {modelPath && !showDebug && (
        <div className="absolute bottom-3 right-3 text-amber-200/20 text-xs">
          Click character to interact
        </div>
      )}
    </div>
  );
});

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-stone-500">{label}:</span>
      <span className={ok !== undefined ? (ok ? "text-green-400" : "text-red-400") : ""}>
        {value}
      </span>
    </div>
  );
}
