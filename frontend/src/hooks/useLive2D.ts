import { useRef, useCallback, useEffect } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import type { ModelMapping } from "../types";

// Expose PIXI globally for pixi-live2d-display
(window as any).PIXI = PIXI;

const DEFAULT_PARAMS = {
  mouthOpen: "ParamMouthOpenY",
  mouthForm: "ParamMouthForm",
  eyeLeftOpen: "ParamEyeLOpen",
  eyeRightOpen: "ParamEyeROpen",
  breath: "ParamBreath",
  bodyAngleX: "ParamBodyAngleX",
};

export interface DebugInfo {
  modelLoaded: boolean;
  currentEmotion: string;
  expressionId: string;
  motionPlaying: string;
  lipSyncActive: boolean;
  mouthValue: number;
  mappingEmotions: string[];
  availableExpressions: string[];
  availableMotionGroups: string[];
  lastError: string;
}

export function useLive2D(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const baseScaleRef = useRef(1);
  const mappingRef = useRef<ModelMapping | null>(null);
  const debugRef = useRef<DebugInfo>({
    modelLoaded: false,
    currentEmotion: "",
    expressionId: "",
    motionPlaying: "",
    lipSyncActive: false,
    mouthValue: 0,
    mappingEmotions: [],
    availableExpressions: [],
    availableMotionGroups: [],
    lastError: "",
  });
  const lipSyncActiveRef = useRef(false);
  const lipSyncHandlerRef = useRef<(() => void) | null>(null);
  const idleHandlerRef = useRef<(() => void) | null>(null);
  const mouthValueRef = useRef(0);
  const mouthTargetRef = useRef(0);
  const lastToggleRef = useRef(0);
  const breathPhaseRef = useRef(0);

  const getParams = useCallback(() => {
    return mappingRef.current?.params || DEFAULT_PARAMS;
  }, []);

  useEffect(() => {
    return () => {
      lipSyncActiveRef.current = false;
      if (modelRef.current) {
        modelRef.current.destroy();
        modelRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  const loadModel = useCallback(
    async (modelPath: string, mapping?: ModelMapping) => {
      if (!canvasRef.current) return;

      if (mapping) {
        mappingRef.current = mapping;
        debugRef.current.mappingEmotions = Object.keys(mapping.emotions || {});
      }

      // Clean up previous model but keep the PIXI Application
      if (modelRef.current) {
        const oldModel = modelRef.current;
        // Remove handlers before destroying
        if (idleHandlerRef.current) {
          oldModel.internalModel.off("beforeModelUpdate", idleHandlerRef.current);
          idleHandlerRef.current = null;
        }
        if (lipSyncHandlerRef.current) {
          oldModel.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
          lipSyncHandlerRef.current = null;
          lipSyncActiveRef.current = false;
        }
        if (appRef.current) {
          appRef.current.stage.removeChildren();
        }
        oldModel.destroy();
        modelRef.current = null;
      }

      // Create PIXI Application only once
      let app = appRef.current;
      if (!app) {
        app = new PIXI.Application({
          view: canvasRef.current,
          width: canvasRef.current.clientWidth,
          height: canvasRef.current.clientHeight,
          backgroundAlpha: 0,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
        appRef.current = app;
      }

      try {
        // Cache-bust to ensure patched model3.json is loaded
        const cacheBust = `${modelPath}${modelPath.includes("?") ? "&" : "?"}t=${Date.now()}`;
        const model = await Live2DModel.from(cacheBust, {
          motionPreload: "ALL" as any,
        });

        modelRef.current = model;

        // Scale to fit canvas
        const scaleX = app.screen.width / model.width;
        const scaleY = app.screen.height / model.height;
        baseScaleRef.current = Math.min(scaleX, scaleY);

        model.scale.set(baseScaleRef.current);
        model.anchor.set(0.5, 0.5);
        model.x = app.screen.width / 2;
        model.y = app.screen.height / 2;

        // Make model interactive for click
        model.interactive = true;
        model.buttonMode = true;

        app.stage.addChild(model);

        // Populate debug info
        debugRef.current.modelLoaded = true;

        // Deep probe the model internals to find expressions & motions
        const im = model.internalModel;
        console.log("[Live2D Debug] Model loaded:", modelPath);
        console.log("[Live2D Debug] internalModel keys:", Object.keys(im));
        console.log("[Live2D Debug] motionManager:", im.motionManager);
        console.log("[Live2D Debug] motionManager keys:", im.motionManager ? Object.keys(im.motionManager) : "none");

        // Try multiple paths to find expressions
        const exprPaths = [
          im.motionManager?.expressionManager?.definitions,
          (im.motionManager?.expressionManager as any)?._definitions,
          (im as any).settings?.expressions,
          (im as any).settings?.fileReferences?.expressions,
        ];
        let exprDefs: any[] = [];
        for (const p of exprPaths) {
          if (Array.isArray(p) && p.length > 0) {
            exprDefs = p;
            break;
          }
        }
        debugRef.current.availableExpressions = exprDefs.map(
          (d: any) => d.Name || d.name || d.File || d.file || "unnamed"
        );

        // Try multiple paths to find motions
        const motionPaths = [
          im.motionManager?.definitions,
          (im.motionManager as any)?._definitions,
          (im as any).settings?.motions,
          (im as any).settings?.fileReferences?.motions,
        ];
        let motionDefs: Record<string, any> | null = null;
        for (const p of motionPaths) {
          if (p && typeof p === "object" && Object.keys(p).length > 0) {
            motionDefs = p;
            break;
          }
        }
        debugRef.current.availableMotionGroups = motionDefs
          ? Object.keys(motionDefs)
          : [];

        // Also dump the expression manager fully
        const em = im.motionManager?.expressionManager;
        if (em) {
          console.log("[Live2D Debug] expressionManager:", em);
          console.log("[Live2D Debug] expressionManager keys:", Object.keys(em));
          console.log("[Live2D Debug] expressionManager.definitions:", em.definitions);
          console.log("[Live2D Debug] expressionManager._definitions:", (em as any)._definitions);
        } else {
          console.log("[Live2D Debug] No expressionManager found");
        }

        // Dump settings
        const settings = (im as any).settings;
        if (settings) {
          console.log("[Live2D Debug] settings keys:", Object.keys(settings));
          console.log("[Live2D Debug] settings.expressions:", settings.expressions);
          console.log("[Live2D Debug] settings.fileReferences:", settings.fileReferences);
        }

        console.log("[Live2D Debug] Available expressions:", debugRef.current.availableExpressions);
        console.log("[Live2D Debug] Available motion groups:", debugRef.current.availableMotionGroups);
        console.log("[Live2D Debug] Mapping emotions:", debugRef.current.mappingEmotions);

        // Cursor tracking
        canvasRef.current.addEventListener("mousemove", (e) => {
          const rect = canvasRef.current!.getBoundingClientRect();
          model.focus(e.clientX - rect.left, e.clientY - rect.top);
        });

        // Click interaction — play a random TapBody motion
        model.on("hit", (hitAreas: string[]) => {
          if (hitAreas.includes("Body") || hitAreas.length > 0) {
            const idx = Math.floor(Math.random() * 5);
            try {
              model.motion("TapBody", idx, 3);
            } catch {
              // motion may not exist
            }
          }
        });

        // Idle animations
        startIdleAnimations(model);
      } catch (err) {
        console.error("Failed to load Live2D model:", err);
      }
    },
    [canvasRef]
  );

  const startIdleAnimations = useCallback((model: any) => {
    if (idleHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", idleHandlerRef.current);
    }

    let lastBlinkTime = Date.now();
    let nextBlinkDelay = 2000 + Math.random() * 4000;
    let blinkPhase = 0;
    const BLINK_DURATION = 150;

    const handler = () => {
      const now = Date.now();
      const coreModel = model.internalModel.coreModel;
      const params = getParams();

      // Breathing
      breathPhaseRef.current += 0.03;
      try {
        const breathVal = Math.sin(breathPhaseRef.current) * 0.5 + 0.5;
        coreModel.setParameterValueById(params.breath, breathVal);
      } catch {}

      // Subtle body sway
      try {
        const swayVal = Math.sin(breathPhaseRef.current * 0.7) * 2;
        coreModel.setParameterValueById(params.bodyAngleX, swayVal);
      } catch {}

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
          eyeOpen = 1.0 - blinkProgress / 0.3;
        } else if (blinkProgress < 0.5) {
          eyeOpen = 0;
        } else if (blinkProgress < 1.0) {
          eyeOpen = (blinkProgress - 0.5) / 0.5;
        } else {
          eyeOpen = 1.0;
          blinkPhase = 0;
        }

        try {
          coreModel.setParameterValueById(params.eyeLeftOpen, eyeOpen);
          coreModel.setParameterValueById(params.eyeRightOpen, eyeOpen);
        } catch {}
      }
    };

    idleHandlerRef.current = handler;
    model.internalModel.on("beforeModelUpdate", handler);
  }, [getParams]);

  const setExpression = useCallback((expressionName: string) => {
    const model = modelRef.current;
    if (!model) return;

    debugRef.current.currentEmotion = expressionName;
    debugRef.current.expressionId = expressionName;

    // Pass the expression name directly to the model — the LLM already picked
    // from the available expressions, so no mapping needed
    try {
      model.expression(expressionName);
      console.log(`[Live2D Debug] Expression set: "${expressionName}"`);
    } catch (e) {
      debugRef.current.lastError = `Expression "${expressionName}" failed: ${e}`;
      console.warn(`[Live2D Debug] Expression "${expressionName}" FAILED:`, e);
      // Try by index 0 as fallback
      try { model.expression(0); } catch {}
    }
  }, []);

  const startLipSync = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;

    if (lipSyncHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
    }

    lipSyncActiveRef.current = true;
    debugRef.current.lipSyncActive = true;
    lastToggleRef.current = Date.now();
    mouthValueRef.current = 0;
    mouthTargetRef.current = 0;

    const handler = () => {
      if (!lipSyncActiveRef.current) return;

      const now = Date.now();
      const params = getParams();

      if (now - lastToggleRef.current > 80 + Math.random() * 80) {
        lastToggleRef.current = now;
        const r = Math.random();
        if (r < 0.25) {
          mouthTargetRef.current = 0;
        } else if (r < 0.5) {
          mouthTargetRef.current = 0.3 + Math.random() * 0.3;
        } else {
          mouthTargetRef.current = 0.6 + Math.random() * 0.4;
        }
      }

      mouthValueRef.current +=
        (mouthTargetRef.current - mouthValueRef.current) * 0.35;
      debugRef.current.mouthValue = Math.round(mouthValueRef.current * 100) / 100;

      try {
        const coreModel = model.internalModel.coreModel;
        coreModel.setParameterValueById(params.mouthOpen, mouthValueRef.current);
        const formVal = Math.sin(now * 0.005) * 0.3;
        coreModel.setParameterValueById(params.mouthForm, formVal);
      } catch {}
    };

    lipSyncHandlerRef.current = handler;
    model.internalModel.on("beforeModelUpdate", handler);
  }, [getParams]);

  const stopLipSync = useCallback(() => {
    lipSyncActiveRef.current = false;
    debugRef.current.lipSyncActive = false;
    debugRef.current.mouthValue = 0;
    mouthValueRef.current = 0;
    mouthTargetRef.current = 0;

    const model = modelRef.current;
    if (!model) return;

    if (lipSyncHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
      lipSyncHandlerRef.current = null;
    }

    try {
      const params = getParams();
      const coreModel = model.internalModel.coreModel;
      coreModel.setParameterValueById(params.mouthOpen, 0);
      coreModel.setParameterValueById(params.mouthForm, 0);
    } catch {}
  }, [getParams]);

  const triggerMotion = useCallback((group: string, index?: number) => {
    const model = modelRef.current;
    if (!model) return;

    try {
      if (index !== undefined) {
        model.motion(group, index, 3);
      } else {
        model.motion(group);
      }
    } catch {}
  }, []);

  const setZoom = useCallback((zoom: number) => {
    const model = modelRef.current;
    if (!model) return;

    model.scale.set(baseScaleRef.current * zoom);
  }, []);

  const getDebug = useCallback((): DebugInfo => {
    return { ...debugRef.current };
  }, []);

  return {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    triggerMotion,
    setZoom,
    getDebug,
  };
}
