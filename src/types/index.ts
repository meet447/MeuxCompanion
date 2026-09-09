import type { CharacterSummary, ModelInfo as WireModelInfo } from "./generated/character";
export type { CharacterSummary, AnimationInfo } from "./generated/character";

export type Character = CharacterSummary;

/** Wire shape returned by `chat_history` (matches Rust `SessionMessage`). */
export interface SessionMessage {
  ts: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: unknown;
}

/** @deprecated Use SessionMessage for persisted history; timeline items use ChatTimelineItem. */
export type ChatMessage = SessionMessage;

export interface ToolCallStatus {
  requestId: string;
  toolCallId: string;
  permissionId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  description?: string;
  status: "running" | "completed" | "failed" | "awaiting_confirmation";
  result?: string;
}

export type ChatTimelineItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; expression?: string }
  | { id: string; kind: "tool"; call: ToolCallStatus };

export type MemoryFactKind =
  | "identity"
  | "people"
  | "preference"
  | "life"
  | "work"
  | "boundary"
  | "other";

export type MemoryFactSource = "agent" | "user" | "legacy";

export interface MemoryFact {
  id: string;
  text: string;
  kind: MemoryFactKind;
  created_at: string;
  confirmed_at: string;
  mentions: number;
  source: MemoryFactSource;
}

export interface MemoryMoment {
  id: string;
  at: string;
  summary: string;
  feeling?: string | null;
  weight: number;
}

export interface CompanionMood {
  name: string;
  intensity: number;
  cause?: string | null;
  wants?: string | null;
  since: string;
}

export interface CompanionThread {
  id: string;
  text: string;
  opened_at: string;
}

export type BondStage =
  | "just met"
  | "getting to know each other"
  | "friends"
  | "close"
  | "inseparable";

export interface CompanionBond {
  closeness: number;
  stage: BondStage;
  mood: CompanionMood;
  threads: CompanionThread[];
  last_talked_at?: string | null;
  seconds_since_last_talk?: number | null;
  turns: number;
  updated_at: string;
}

export interface MemorySnapshot {
  bond: CompanionBond;
  facts: MemoryFact[];
  moments: MemoryMoment[];
  memory_dir: string;
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

/** Model response with an optional mapping attached locally by avatar previews. */
export type ModelInfo = WireModelInfo & { mapping?: ModelMapping | null };

export interface Voice {
  id: string;
  name: string;
}

export interface UserConfig {
  id?: string;
  name: string;
  about: string;
}

export interface AgentConfig {
  /** Empty or absent uses the model chosen by the agent. */
  model?: string;
  preset: string;
  program: string;
  args: string[];
  /** Approve agent tool permissions automatically when explicitly enabled; otherwise ask in the chat UI. */
  auto_approve_tools?: boolean;
}

export interface LlmConfig {
  provider: string;
  base_url?: string;
  api_key?: string | null;
  model?: string;
}

export interface TtsConfig {
  provider: string;
  api_key?: string | null;
  voice: string;
}

export interface LlmProviderConfig {
  base_url?: string;
  api_key?: string | null;
  model?: string;
}

export interface TtsProviderConfig {
  api_key?: string | null;
  voice?: string;
}

export interface AppConfig {
  user?: UserConfig;
  llm?: LlmConfig;
  tts?: TtsConfig;
  llm_providers?: Record<string, LlmProviderConfig>;
  tts_providers?: Record<string, TtsProviderConfig>;
  active_character?: string;
  onboarding_complete?: boolean;
  agent?: AgentConfig;
}
