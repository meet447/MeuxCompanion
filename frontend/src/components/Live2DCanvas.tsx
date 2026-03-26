import { useRef, useEffect } from "react";
import { useLive2D } from "../hooks/useLive2D";

interface Props {
  modelPath: string | null;
  emotion: string;
  speaking: boolean;
}

export function Live2DCanvas({ modelPath, emotion, speaking }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loadModel, setExpression, startLipSync, stopLipSync } =
    useLive2D(canvasRef);
  const prevModelPath = useRef<string | null>(null);
  const prevEmotion = useRef<string>("");

  // Load model when path changes
  useEffect(() => {
    if (modelPath && modelPath !== prevModelPath.current) {
      prevModelPath.current = modelPath;
      loadModel(modelPath);
    }
  }, [modelPath, loadModel]);

  // Update expression + trigger body motion when emotion changes
  useEffect(() => {
    if (emotion && emotion !== prevEmotion.current) {
      prevEmotion.current = emotion;
      setExpression(emotion);
    }
  }, [emotion, setExpression]);

  // Lip sync while speaking
  useEffect(() => {
    if (speaking) {
      startLipSync();
    } else {
      stopLipSync();
    }
  }, [speaking, startLipSync, stopLipSync]);

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-indigo-950 to-purple-950 relative overflow-hidden">
      {!modelPath && (
        <div className="text-white/50 text-center">
          <p className="text-lg">No Live2D model loaded</p>
          <p className="text-sm mt-2">
            Add a model to <code>models/live2d/</code> and select a character
          </p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ display: modelPath ? "block" : "none" }}
      />
      {modelPath && (
        <div className="absolute bottom-3 left-3 text-white/30 text-xs">
          Click the character to interact
        </div>
      )}
    </div>
  );
}
