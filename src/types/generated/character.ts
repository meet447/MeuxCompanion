// Generated from Rust character/types.rs. Run npm run types:generate to update.

export type SourceType = "directory" | "markdown";
export type CharacterSummary = { id: string, name: string, live2d_model: string, voice: string, default_emotion: string, source_type: SourceType, };
export type AnimationInfo = { name: string, path: string, };
export type ModelInfo = { id: string, type: string, model_file: string, path: string, animations?: Array<AnimationInfo>, };
