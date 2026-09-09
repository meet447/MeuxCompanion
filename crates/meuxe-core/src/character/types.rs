use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub live2d_model: String,
    pub voice: String,
    pub default_emotion: String,
    pub system_prompt: String,
    pub prompt_sections: PromptSections,
    pub source_type: SourceType,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptSections {
    pub soul: String,
    pub style: String,
    pub rules: String,
    pub context: String,
    pub lorebook: String,
    pub examples: String,
    pub legacy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum SourceType {
    Directory,
    Markdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CharacterSummary {
    pub id: String,
    pub name: String,
    pub live2d_model: String,
    pub voice: String,
    pub default_emotion: String,
    pub source_type: SourceType,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CharacterYaml {
    pub name: Option<String>,
    pub live2d_model: Option<String>,
    #[serde(default, alias = "model")]
    pub vrm_model: Option<String>,
    pub voice: Option<String>,
    pub default_emotion: Option<String>,
}

pub use crate::expressions::GLOBAL_EXPRESSIONS as DEFAULT_EXPRESSIONS;

pub const VRM_EXPRESSIONS: &[&str] = &["happy", "angry", "sad", "relaxed", "surprised"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct AnimationInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModelInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub model_type: String,
    pub model_file: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(test, ts(optional))]
    pub animations: Option<Vec<AnimationInfo>>,
}

#[cfg(test)]
mod ipc_types_tests {
    use super::*;
    use ts_rs::TS;

    #[test]
    fn ipc_types_match_rust() {
        let generated = format!(
            "// Generated from Rust character/types.rs. Run npm run types:generate to update.\n\nexport {}\nexport {}\nexport {}\nexport {}\n",
            SourceType::decl(), CharacterSummary::decl(), AnimationInfo::decl(), ModelInfo::decl(),
        );
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../src/types/generated/character.ts");
        if std::env::var_os("MEUXE_UPDATE_TYPES").is_some() {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, &generated).unwrap();
        }
        let checked_in = std::fs::read_to_string(path).expect("Run npm run types:generate");
        assert_eq!(
            checked_in, generated,
            "IPC types are stale. Run npm run types:generate and rebuild the frontend."
        );
    }
}
