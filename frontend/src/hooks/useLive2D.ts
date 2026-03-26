import { useRef, useCallback, useEffect } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";

// Expose PIXI globally for pixi-live2d-display
(window as any).PIXI = PIXI;

// Map emotion names to Haru's expression IDs
const EMOTION_TO_EXPRESSION: Record<string, string> = {
  neutral: "F01",
  happy: "F05",
  sad: "F07",
  angry: "F03",
  surprised: "F06",
  embarrassed: "F05",
  thinking: "F04",
  excited: "F02",
};

// Map emotions to motion behavior for more lively reactions
const EMOTION_TO_MOTION: Record<string, { group: string; index?: number }> = {
  excited: { group: "TapBody", index: 0 },
  surprised: { group: "TapBody", index: 1 },
  angry: { group: "TapBody", index: 2 },
  happy: { group: "TapBody", index: 3 },
  embarrassed: { group: "TapBody", index: 4 },
};

export function useLive2D(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const lipSyncActiveRef = useRef(false);
  const lipSyncHandlerRef = useRef<(() => void) | null>(null);
  const idleHandlerRef = useRef<(() => void) | null>(null);
  const mouthValueRef = useRef(0);
  const mouthTargetRef = useRef(0);
  const lastToggleRef = useRef(0);
  const breathPhaseRef = useRef(0);

  useEffect(() => {
    return () => {
      lipSyncActiveRef.current = false;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  const loadModel = useCallback(
    async (modelPath: string) => {
      if (!canvasRef.current) return;

      // Destroy previous app if exists
      if (appRef.current) {
        appRef.current.destroy(true);
      }

      const app = new PIXI.Application({
        view: canvasRef.current,
        width: canvasRef.current.clientWidth,
        height: canvasRef.current.clientHeight,
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      appRef.current = app;

      try {
        const model = await Live2DModel.from(modelPath, {
          motionPreload: "ALL" as any,
        });

        modelRef.current = model;

        // Scale to fit canvas
        const scaleX = app.screen.width / model.width;
        const scaleY = app.screen.height / model.height;
        const scale = Math.min(scaleX, scaleY) * 0.8;

        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.x = app.screen.width / 2;
        model.y = app.screen.height / 2;

        // Make model interactive for click
        model.interactive = true;
        model.buttonMode = true;

        app.stage.addChild(model);

        // Cursor tracking — model follows mouse
        canvasRef.current.addEventListener("mousemove", (e) => {
          const rect = canvasRef.current!.getBoundingClientRect();
          model.focus(e.clientX - rect.left, e.clientY - rect.top);
        });

        // Click interaction — play a random TapBody motion
        model.on("hit", (hitAreas: string[]) => {
          if (hitAreas.includes("Body") || hitAreas.length > 0) {
            const idx = Math.floor(Math.random() * 5);
            try {
              model.motion("TapBody", idx, 3); // priority FORCE
            } catch {
              // motion may not exist at that index
            }
          }
        });

        // Idle life: subtle breathing + random blinking
        startIdleAnimations(model);
      } catch (err) {
        console.error("Failed to load Live2D model:", err);
      }
    },
    [canvasRef]
  );

  const startIdleAnimations = useCallback((model: any) => {
    // Remove previous handler
    if (idleHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", idleHandlerRef.current);
    }

    let lastBlinkTime = Date.now();
    let nextBlinkDelay = 2000 + Math.random() * 4000; // 2-6 seconds
    let blinkPhase = 0; // 0 = open, >0 = in blink animation
    const BLINK_DURATION = 150; // ms for full close-open cycle

    const handler = () => {
      const now = Date.now();
      const coreModel = model.internalModel.coreModel;

      // Breathing — gentle body sway
      breathPhaseRef.current += 0.03;
      try {
        const breathVal = Math.sin(breathPhaseRef.current) * 0.5 + 0.5;
        coreModel.setParameterValueById("ParamBreath", breathVal);
      } catch {
        // ParamBreath may not exist
      }

      // Subtle body angle sway
      try {
        const swayVal = Math.sin(breathPhaseRef.current * 0.7) * 2;
        coreModel.setParameterValueById("ParamBodyAngleX", swayVal);
      } catch {
        // may not exist
      }

      // Random blinking
      if (blinkPhase === 0) {
        if (now - lastBlinkTime > nextBlinkDelay) {
          blinkPhase = 1;
          lastBlinkTime = now;
          nextBlinkDelay = 2000 + Math.random() * 4000;
        }
      } else {
        const blinkProgress = (now - lastBlinkTime) / BLINK_DURATION;
        let eyeOpen: number;

        if (blinkProgress < 0.3) {
          // Closing
          eyeOpen = 1.0 - blinkProgress / 0.3;
        } else if (blinkProgress < 0.5) {
          // Closed
          eyeOpen = 0;
        } else if (blinkProgress < 1.0) {
          // Opening
          eyeOpen = (blinkProgress - 0.5) / 0.5;
        } else {
          eyeOpen = 1.0;
          blinkPhase = 0;
        }

        try {
          coreModel.setParameterValueById("ParamEyeLOpen", eyeOpen);
          coreModel.setParameterValueById("ParamEyeROpen", eyeOpen);
        } catch {
          // params may not exist
        }
      }
    };

    idleHandlerRef.current = handler;
    model.internalModel.on("beforeModelUpdate", handler);
  }, []);

  const setExpression = useCallback((emotionName: string) => {
    const model = modelRef.current;
    if (!model) return;

    // Set the facial expression
    const expressionId = EMOTION_TO_EXPRESSION[emotionName] || "F01";
    try {
      model.expression(expressionId);
    } catch {
      try {
        model.expression(0);
      } catch {
        // No expressions available
      }
    }

    // Play a motion that matches the emotion for body language
    const motionConfig = EMOTION_TO_MOTION[emotionName];
    if (motionConfig) {
      try {
        model.motion(
          motionConfig.group,
          motionConfig.index ?? 0,
          2 // priority NORMAL
        );
      } catch {
        // motion may not exist
      }
    }
  }, []);

  const startLipSync = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;

    // Remove previous handler if any
    if (lipSyncHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
    }

    lipSyncActiveRef.current = true;
    lastToggleRef.current = Date.now();
    mouthValueRef.current = 0;
    mouthTargetRef.current = 0;

    const handler = () => {
      if (!lipSyncActiveRef.current) return;

      const now = Date.now();

      // Generate new mouth target every 80-160ms (variable for realism)
      if (now - lastToggleRef.current > 80 + Math.random() * 80) {
        lastToggleRef.current = now;
        // Vary between closed, half-open, and fully open
        const r = Math.random();
        if (r < 0.25) {
          mouthTargetRef.current = 0; // closed pause
        } else if (r < 0.5) {
          mouthTargetRef.current = 0.3 + Math.random() * 0.3; // half open
        } else {
          mouthTargetRef.current = 0.6 + Math.random() * 0.4; // wide open
        }
      }

      // Smooth interpolation toward target (lerp)
      mouthValueRef.current +=
        (mouthTargetRef.current - mouthValueRef.current) * 0.35;

      try {
        const coreModel = model.internalModel.coreModel;
        coreModel.setParameterValueById(
          "ParamMouthOpenY",
          mouthValueRef.current
        );
        // Subtle mouth form change while speaking
        const formVal = Math.sin(now * 0.005) * 0.3;
        coreModel.setParameterValueById("ParamMouthForm", formVal);
      } catch {
        // Parameter may not exist
      }
    };

    lipSyncHandlerRef.current = handler;
    model.internalModel.on("beforeModelUpdate", handler);
  }, []);

  const stopLipSync = useCallback(() => {
    lipSyncActiveRef.current = false;
    mouthValueRef.current = 0;
    mouthTargetRef.current = 0;

    const model = modelRef.current;
    if (!model) return;

    // Remove the handler
    if (lipSyncHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
      lipSyncHandlerRef.current = null;
    }

    // Smoothly close mouth
    try {
      const coreModel = model.internalModel.coreModel;
      coreModel.setParameterValueById("ParamMouthOpenY", 0);
      coreModel.setParameterValueById("ParamMouthForm", 0);
    } catch {
      // ignore
    }
  }, []);

  const triggerMotion = useCallback((group: string, index?: number) => {
    const model = modelRef.current;
    if (!model) return;

    try {
      if (index !== undefined) {
        model.motion(group, index, 3); // FORCE priority
      } else {
        model.motion(group);
      }
    } catch {
      // Motion may not exist
    }
  }, []);

  return {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    triggerMotion,
  };
}
