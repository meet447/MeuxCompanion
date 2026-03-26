import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import type { AudioLevels } from "./useAudioAnalyser";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function useVRM(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);
  const animFrameRef = useRef<number>(0);
  const animatingRef = useRef(false);

  // Animation state
  const lipSyncActiveRef = useRef(false);
  const audioLevelsGetterRef = useRef<(() => AudioLevels) | null>(null);
  const breathPhaseRef = useRef(0);
  const breathSpeedRef = useRef(0.03);
  const mouthValueRef = useRef(0);

  // Idle state
  const lastBlinkTimeRef = useRef(Date.now());
  const nextBlinkDelayRef = useRef(2000 + Math.random() * 4000);
  const blinkValueRef = useRef(0);
  const blinkClosingRef = useRef(false);
  const saccadeXRef = useRef(0);
  const saccadeYRef = useRef(0);
  const saccadeTargetXRef = useRef(0);
  const saccadeTargetYRef = useRef(0);
  const lastSaccadeTimeRef = useRef(Date.now());
  const bodySwayPhaseRef = useRef(0);

  // Speaking state
  const speakingRef = useRef(false);
  const speakStartRef = useRef(0);

  useEffect(() => {
    return () => {
      // Don't destroy WebGL resources here — React strict mode double-invokes
      // effects which would kill the context. Cleanup happens in loadModel
      // or when the component is removed from DOM via key change.
      animatingRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const startAnimationLoop = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const tick = () => {
      if (!animatingRef.current) return;

      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const vrm = vrmRef.current;
      const clock = clockRef.current;

      if (!renderer || !scene || !camera || !vrm || !clock) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const delta = clock.getDelta();
      const now = Date.now();

      // --- Rest pose (arms down, natural stance) ---
      if (vrm.humanoid) {
        const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
        const rightLowerArm = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");

        // Arms down at sides (rotate from T-pose)
        if (leftUpperArm) {
          leftUpperArm.rotation.z = 1.1; // ~63 degrees down
          leftUpperArm.rotation.x = 0.1; // slight forward
        }
        if (rightUpperArm) {
          rightUpperArm.rotation.z = -1.1;
          rightUpperArm.rotation.x = 0.1;
        }
        // Slight elbow bend
        if (leftLowerArm) {
          leftLowerArm.rotation.z = 0.15;
          leftLowerArm.rotation.y = -0.3;
        }
        if (rightLowerArm) {
          rightLowerArm.rotation.z = -0.15;
          rightLowerArm.rotation.y = 0.3;
        }
      }

      // --- Breathing ---
      breathPhaseRef.current += breathSpeedRef.current;
      const breathVal = Math.sin(breathPhaseRef.current) * 0.02;
      if (vrm.humanoid) {
        const chest = vrm.humanoid.getNormalizedBoneNode("chest");
        if (chest) chest.rotation.x = breathVal;

        bodySwayPhaseRef.current += 0.01;
        const spine = vrm.humanoid.getNormalizedBoneNode("spine");
        if (spine) {
          spine.rotation.z = Math.sin(bodySwayPhaseRef.current * 0.7) * 0.01;
          spine.rotation.x = Math.sin(bodySwayPhaseRef.current * 0.3) * 0.005;
        }
      }

      // --- Blinking ---
      if (!blinkClosingRef.current) {
        if (now - lastBlinkTimeRef.current > nextBlinkDelayRef.current) {
          blinkClosingRef.current = true;
          blinkValueRef.current = 0;
        }
      }
      if (blinkClosingRef.current) {
        blinkValueRef.current += delta * 15;
        if (blinkValueRef.current >= 2) {
          blinkValueRef.current = 0;
          blinkClosingRef.current = false;
          lastBlinkTimeRef.current = now;
          nextBlinkDelayRef.current = 2000 + Math.random() * 4000;
        }
      }
      const blinkWeight = blinkValueRef.current <= 1
        ? blinkValueRef.current
        : 2 - blinkValueRef.current;
      vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, blinkWeight);

      // --- Eye saccades ---
      if (now - lastSaccadeTimeRef.current > 500 + Math.random() * 2000) {
        lastSaccadeTimeRef.current = now;
        saccadeTargetXRef.current = (Math.random() - 0.5) * 0.1;
        saccadeTargetYRef.current = (Math.random() - 0.5) * 0.05;
      }
      saccadeXRef.current = lerp(saccadeXRef.current, saccadeTargetXRef.current, 0.1);
      saccadeYRef.current = lerp(saccadeYRef.current, saccadeTargetYRef.current, 0.1);

      const head = vrm.humanoid?.getNormalizedBoneNode("head");
      if (head) {
        head.rotation.y = saccadeXRef.current;
        head.rotation.x = saccadeYRef.current;
      }

      // --- Lip sync ---
      if (lipSyncActiveRef.current) {
        const getter = audioLevelsGetterRef.current;
        if (getter) {
          const levels = getter();
          mouthValueRef.current = lerp(mouthValueRef.current, levels.mouthOpen, 0.4);

          const mouth = mouthValueRef.current;
          const form = levels.mouthForm;

          const aa = mouth * Math.max(0, 1 - Math.abs(form)) * 0.8;
          const oh = mouth * Math.max(0, -form) * 0.6;
          const ee = mouth * Math.max(0, form) * 0.5;
          const ih = mouth * 0.3;

          vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, Math.min(1, aa));
          vrm.expressionManager?.setValue(VRMExpressionPresetName.Oh, Math.min(1, oh));
          vrm.expressionManager?.setValue(VRMExpressionPresetName.Ee, Math.min(1, ee));
          vrm.expressionManager?.setValue(VRMExpressionPresetName.Ih, Math.min(1, ih));
        }

        // Speaking head movement
        if (speakingRef.current && head) {
          const elapsed = (now - speakStartRef.current) / 1000;
          head.rotation.y += Math.sin(elapsed * 1.8) * 0.03;
          head.rotation.x += Math.sin(elapsed * 2.3) * 0.02;
          head.rotation.z = Math.sin(elapsed * 1.2) * 0.02;
        }
      } else {
        mouthValueRef.current = lerp(mouthValueRef.current, 0, 0.3);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, 0);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Oh, 0);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Ee, 0);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Ih, 0);
      }

      vrm.update(delta);
      renderer.render(scene, camera);

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const loadModel = useCallback(
    async (modelPath: string) => {
      if (!canvasRef.current) return;

      // Stop animation
      animatingRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }

      // Clean up previous VRM
      if (vrmRef.current) {
        vrmRef.current.scene.removeFromParent();
        vrmRef.current = null;
      }

      // Create renderer once
      if (!rendererRef.current) {
        const renderer = new THREE.WebGLRenderer({
          canvas: canvasRef.current,
          alpha: true,
          antialias: true,
        });
        renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        rendererRef.current = renderer;
      }

      // Create scene once
      if (!sceneRef.current) {
        const scene = new THREE.Scene();

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1).normalize();
        scene.add(directionalLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-1, 0.5, -1).normalize();
        scene.add(fillLight);

        sceneRef.current = scene;
      }

      // Create camera once
      if (!cameraRef.current) {
        const canvas = canvasRef.current;
        const camera = new THREE.PerspectiveCamera(
          30,
          canvas.clientWidth / canvas.clientHeight,
          0.1,
          20
        );
        camera.position.set(0, 1.1, 3.0);
        camera.lookAt(0, 0.9, 0);
        cameraRef.current = camera;
      }

      // Load VRM
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      try {
        const cacheBust = `${modelPath}${modelPath.includes("?") ? "&" : "?"}t=${Date.now()}`;
        const gltf = await loader.loadAsync(cacheBust);
        const vrm = gltf.userData.vrm as VRM;

        if (!vrm || !sceneRef.current || !rendererRef.current) {
          console.error("[VRM] Failed to load — scene or renderer destroyed");
          return;
        }

        vrm.scene.rotation.y = Math.PI;
        sceneRef.current.add(vrm.scene);
        vrmRef.current = vrm;

        // Create clock fresh for this model
        clockRef.current = new THREE.Clock();

        console.log("[VRM] Model loaded:", modelPath);
        console.log("[VRM] Expressions:", Object.keys(vrm.expressionManager?.expressionMap || {}));

        // Start animation loop
        startAnimationLoop();
      } catch (err) {
        console.error("[VRM] Failed to load model:", err);
      }
    },
    [canvasRef, startAnimationLoop]
  );

  const setExpression = useCallback((expressionName: string) => {
    const vrm = vrmRef.current;
    if (!vrm?.expressionManager) return;

    const emotionPresets = [
      VRMExpressionPresetName.Happy,
      VRMExpressionPresetName.Angry,
      VRMExpressionPresetName.Sad,
      VRMExpressionPresetName.Relaxed,
      VRMExpressionPresetName.Surprised,
    ];
    for (const preset of emotionPresets) {
      vrm.expressionManager.setValue(preset, 0);
    }

    const nameMap: Record<string, string> = {
      happy: VRMExpressionPresetName.Happy,
      angry: VRMExpressionPresetName.Angry,
      sad: VRMExpressionPresetName.Sad,
      relaxed: VRMExpressionPresetName.Relaxed,
      surprised: VRMExpressionPresetName.Surprised,
      neutral: "",
    };

    const preset = nameMap[expressionName.toLowerCase()] || expressionName;
    if (preset) {
      vrm.expressionManager.setValue(preset, 1);
    }

    const fastEmotions = ["excited", "angry", "surprised"];
    const slowEmotions = ["sad", "relaxed"];
    const name = expressionName.toLowerCase();

    if (fastEmotions.some(e => name.includes(e))) {
      breathSpeedRef.current = 0.06;
    } else if (slowEmotions.some(e => name.includes(e))) {
      breathSpeedRef.current = 0.02;
    } else {
      breathSpeedRef.current = 0.03;
    }

    console.log(`[VRM] Expression: "${expressionName}"`);
  }, []);

  const startLipSync = useCallback((getAudioLevels?: () => AudioLevels) => {
    lipSyncActiveRef.current = true;
    speakingRef.current = true;
    speakStartRef.current = Date.now();
    if (getAudioLevels) {
      audioLevelsGetterRef.current = getAudioLevels;
    }
  }, []);

  const stopLipSync = useCallback(() => {
    lipSyncActiveRef.current = false;
    speakingRef.current = false;
    audioLevelsGetterRef.current = null;
    mouthValueRef.current = 0;
  }, []);

  const setZoom = useCallback((zoom: number) => {
    if (!cameraRef.current) return;
    cameraRef.current.position.z = 3.0 / zoom;
  }, []);

  const setTypingReaction = useCallback((isTyping: boolean) => {
    if (isTyping) {
      saccadeTargetXRef.current = 0.05;
      saccadeTargetYRef.current = 0.03;
    } else {
      saccadeTargetXRef.current = 0;
      saccadeTargetYRef.current = 0;
    }
  }, []);

  const triggerMotion = useCallback((_group: string, _index?: number) => {
    // VRM doesn't have motion groups — no-op
  }, []);

  const getDebug = useCallback(() => ({
    modelLoaded: !!vrmRef.current,
    currentEmotion: "",
    expressionId: "",
    motionPlaying: "",
    lipSyncActive: lipSyncActiveRef.current,
    mouthValue: Math.round(mouthValueRef.current * 100) / 100,
    mappingEmotions: [],
    availableExpressions: Object.keys(vrmRef.current?.expressionManager?.expressionMap || {}),
    availableMotionGroups: [],
    lastError: "",
  }), []);

  return {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    triggerMotion,
    setZoom,
    setTypingReaction,
    getDebug,
  };
}
