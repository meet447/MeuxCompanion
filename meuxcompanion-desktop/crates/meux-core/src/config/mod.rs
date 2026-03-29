pub mod types;

pub use types::*;

use crate::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// --- Provider Presets ---

#[derive(Debug, Clone, Copy)]
pub struct LlmPreset {
    pub base_url: &'static str,
    pub needs_key: bool,
    pub default_model: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct TtsPreset {
    pub name: &'static str,
    pub needs_key: bool,
}

pub const LLM_PRESETS: &[(&str, LlmPreset)] = &[
    (
        "openai",
        LlmPreset {
            base_url: "https://api.openai.com/v1",
            needs_key: true,
            default_model: "gpt-4o",
        },
    ),
    (
        "groq",
        LlmPreset {
            base_url: "https://api.groq.com/openai/v1",
            needs_key: true,
            default_model: "llama-3.3-70b-versatile",
        },
    ),
    (
        "openrouter",
        LlmPreset {
            base_url: "https://openrouter.ai/api/v1",
            needs_key: true,
            default_model: "openai/gpt-4o",
        },
    ),
    (
        "ollama",
        LlmPreset {
            base_url: "http://localhost:11434/v1",
            needs_key: false,
            default_model: "llama3.2",
        },
    ),
    (
        "nectara",
        LlmPreset {
            base_url: "https://api-nectara.chipling.xyz/v1",
            needs_key: true,
            default_model: "openai/gpt-oss-20b",
        },
    ),
    (
        "custom",
        LlmPreset {
            base_url: "",
            needs_key: true,
            default_model: "",
        },
    ),
];

pub const TTS_PRESETS: &[(&str, TtsPreset)] = &[
    (
        "tiktok",
        TtsPreset {
            name: "TikTok TTS",
            needs_key: false,
        },
    ),
    (
        "elevenlabs",
        TtsPreset {
            name: "ElevenLabs",
            needs_key: true,
        },
    ),
    (
        "openai_tts",
        TtsPreset {
            name: "OpenAI TTS",
            needs_key: true,
        },
    ),
];

// --- ConfigManager ---

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            config_path: data_dir.join("config.json"),
        }
    }

    pub fn load(&self) -> Result<AppConfig> {
        if !self.config_path.exists() {
            return Ok(AppConfig::default());
        }
        let data = std::fs::read_to_string(&self.config_path)?;
        let config: AppConfig = serde_json::from_str(&data)?;
        Ok(config)
    }

    pub fn save(&self, config: &AppConfig) -> Result<()> {
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(config)?;
        std::fs::write(&self.config_path, json)?;
        Ok(())
    }

    pub fn mask_config(config: &AppConfig) -> AppConfig {
        let mut masked = config.clone();
        masked.llm.api_key = masked.llm.api_key.map(|k| mask_key(&k));
        masked.tts.api_key = masked.tts.api_key.map(|k| mask_key(&k));
        for provider in masked.llm_providers.values_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        for provider in masked.tts_providers.values_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        masked
    }

    pub fn get_configured_providers(
        config: &AppConfig,
    ) -> HashMap<String, HashMap<String, serde_json::Value>> {
        let mut result: HashMap<String, HashMap<String, serde_json::Value>> = HashMap::new();

        // LLM providers
        let mut llm_status: HashMap<String, serde_json::Value> = HashMap::new();
        for (name, preset) in LLM_PRESETS {
            let configured = if let Some(provider_cfg) = config.llm_providers.get(*name) {
                if preset.needs_key {
                    provider_cfg.api_key.as_ref().map_or(false, |k| !k.is_empty())
                } else {
                    true
                }
            } else {
                false
            };
            llm_status.insert(name.to_string(), serde_json::Value::Bool(configured));
        }
        result.insert("llm".to_string(), llm_status);

        // TTS providers
        let mut tts_status: HashMap<String, serde_json::Value> = HashMap::new();
        for (name, preset) in TTS_PRESETS {
            let configured = if let Some(provider_cfg) = config.tts_providers.get(*name) {
                if preset.needs_key {
                    provider_cfg.api_key.as_ref().map_or(false, |k| !k.is_empty())
                } else {
                    true
                }
            } else {
                !preset.needs_key
            };
            tts_status.insert(name.to_string(), serde_json::Value::Bool(configured));
        }
        result.insert("tts".to_string(), tts_status);

        result
    }
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "***".to_string()
    } else {
        format!("{}...{}", &key[..4], &key[key.len() - 4..])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_load_missing_config_returns_default() {
        let tmp = TempDir::new().unwrap();
        let mgr = ConfigManager::new(tmp.path());
        let config = mgr.load().unwrap();
        assert_eq!(config.user.name, "");
        assert!(!config.onboarding_complete);
        assert!(config.llm_providers.is_empty());
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let mgr = ConfigManager::new(tmp.path());

        let mut config = AppConfig::default();
        config.user.name = "Alice".to_string();
        config.llm.provider = "openai".to_string();
        config.llm.api_key = Some("sk-test-key-12345678".to_string());
        config.onboarding_complete = true;

        mgr.save(&config).unwrap();
        let loaded = mgr.load().unwrap();

        assert_eq!(loaded.user.name, "Alice");
        assert_eq!(loaded.llm.provider, "openai");
        assert_eq!(
            loaded.llm.api_key,
            Some("sk-test-key-12345678".to_string())
        );
        assert!(loaded.onboarding_complete);
    }

    #[test]
    fn test_mask_key() {
        assert_eq!(mask_key("sk-abcdef1234567890xyzw"), "sk-a...xyzw");
        assert_eq!(mask_key("short"), "***");
        assert_eq!(mask_key("12345678"), "***");
        assert_eq!(mask_key("123456789"), "1234...6789");
    }

    #[test]
    fn test_mask_config() {
        let mut config = AppConfig::default();
        config.llm.api_key = Some("sk-abcdef1234567890xyzw".to_string());
        config.tts.api_key = Some("short".to_string());
        config.llm_providers.insert(
            "openai".to_string(),
            LlmProviderConfig {
                base_url: "https://api.openai.com/v1".to_string(),
                api_key: Some("sk-provider-key-longvalue".to_string()),
                model: "gpt-4o".to_string(),
            },
        );

        let masked = ConfigManager::mask_config(&config);

        assert_eq!(masked.llm.api_key, Some("sk-a...xyzw".to_string()));
        assert_eq!(masked.tts.api_key, Some("***".to_string()));
        assert_eq!(
            masked.llm_providers["openai"].api_key,
            Some("sk-p...alue".to_string())
        );
    }
}
