use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub user: UserConfig,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default)]
    pub tts: TtsConfig,
    #[serde(default)]
    pub llm_providers: HashMap<String, LlmProviderConfig>,
    #[serde(default)]
    pub tts_providers: HashMap<String, TtsProviderConfig>,
    #[serde(default)]
    pub active_character: String,
    #[serde(default)]
    pub onboarding_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserConfig {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub about: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmConfig {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TtsConfig {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub voice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmProviderConfig {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TtsProviderConfig {
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub voice: String,
}
