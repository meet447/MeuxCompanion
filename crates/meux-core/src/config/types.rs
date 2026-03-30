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
    pub search: SearchConfig,
    #[serde(default)]
    pub llm_providers: HashMap<String, LlmProviderConfig>,
    #[serde(default)]
    pub tts_providers: HashMap<String, TtsProviderConfig>,
    /// Tool names that are disabled (won't be sent to LLM or executed).
    #[serde(default)]
    pub disabled_tools: Vec<String>,
    #[serde(default)]
    pub active_character: String,
    #[serde(default)]
    pub onboarding_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    /// "duckduckgo", "serpapi", or "exa"
    #[serde(default = "default_search_provider")]
    pub provider: String,
    #[serde(default)]
    pub serp_api_key: Option<String>,
    #[serde(default)]
    pub exa_api_key: Option<String>,
}

fn default_search_provider() -> String {
    "duckduckgo".to_string()
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            provider: default_search_provider(),
            serp_api_key: None,
            exa_api_key: None,
        }
    }
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
