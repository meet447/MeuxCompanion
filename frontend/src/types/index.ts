export interface Character {
  id: string;
  name: string;
  live2d_model: string;
  voice: string;
  default_emotion: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  expression?: string;
}

export interface MotionConfig {
  group: string;
  index: number;
}

export interface EmotionConfig {
  expression: string;
  motion?: MotionConfig;
}

export interface ModelMapping {
  emotions: Record<string, EmotionConfig>;
  params: {
    mouthOpen: string;
    mouthForm: string;
    eyeLeftOpen: string;
    eyeRightOpen: string;
    breath: string;
    bodyAngleX: string;
  };
}

export interface AnimationInfo {
  name: string;
  path: string;
}

export interface ModelInfo {
  id: string;
  type: "live2d" | "vrm";
  model_file: string;
  path: string;
  mapping: ModelMapping | null;
  animations?: AnimationInfo[];
}

export interface Voice {
  id: string;
  name: string;
}
