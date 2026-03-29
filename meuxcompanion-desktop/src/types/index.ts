export interface Character {
  id: string;
  name: string;
  live2d_model: string;
  voice: string;
  default_emotion: string;
  source_type?: "markdown" | "directory";
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  expression?: string;
}

export interface MemoryRecord {
  id: string;
  ts: string;
  type: "episodic" | "semantic" | "reflections" | string;
  summary: string;
  importance: number;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface CharacterState {
  trust: number;
  affection: number;
  mood: string;
  energy: number;
  relationship_summary: string;
  updated_at?: string | null;
}

export interface ModelMapping {
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
