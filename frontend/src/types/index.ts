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
  emotion?: string;
}

export interface Live2DModelInfo {
  id: string;
  model_file: string;
  path: string;
}

export interface Voice {
  id: string;
  name: string;
}
