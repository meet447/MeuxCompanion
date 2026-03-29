pub mod expressions;
pub mod types;

pub use types::*;

use crate::{MeuxError, Result};
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::SystemTime;

/// Identifies a character source found on disk.
enum CharacterSource {
    /// A directory containing `character.yaml`.
    Directory { id: String, path: PathBuf },
    /// A standalone `.md` file with YAML frontmatter.
    Markdown { id: String, path: PathBuf },
}

/// Cached character keyed by id, storing the mtime signature used to
/// invalidate.
struct CachedCharacter {
    mtime: SystemTime,
    character: Character,
}

pub struct CharacterLoader {
    characters_dir: PathBuf,
    cache: RwLock<HashMap<String, CachedCharacter>>,
}

impl CharacterLoader {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            characters_dir: data_dir.join("characters"),
            cache: RwLock::new(HashMap::new()),
        }
    }

    /// List all available characters (summary only).
    pub fn list_characters(&self) -> Result<Vec<CharacterSummary>> {
        let sources = self.iter_character_sources()?;
        let mut summaries = Vec::new();
        for src in sources {
            match src {
                CharacterSource::Directory { id, path } => {
                    let yaml_path = path.join("character.yaml");
                    let raw = fs::read_to_string(&yaml_path)?;
                    let yaml: CharacterYaml = serde_yaml::from_str(&raw)?;
                    summaries.push(CharacterSummary {
                        id,
                        name: yaml.name.unwrap_or_default(),
                        live2d_model: yaml.live2d_model.unwrap_or_default(),
                        voice: yaml.voice.unwrap_or_default(),
                        default_emotion: yaml
                            .default_emotion
                            .unwrap_or_else(|| "neutral".to_string()),
                        source_type: SourceType::Directory,
                    });
                }
                CharacterSource::Markdown { id, path } => {
                    let raw = fs::read_to_string(&path)?;
                    let (frontmatter, _body) = parse_md_frontmatter(&raw)?;
                    let yaml: CharacterYaml = serde_yaml::from_str(&frontmatter)?;
                    summaries.push(CharacterSummary {
                        id,
                        name: yaml.name.unwrap_or_default(),
                        live2d_model: yaml.live2d_model.unwrap_or_default(),
                        voice: yaml.voice.unwrap_or_default(),
                        default_emotion: yaml
                            .default_emotion
                            .unwrap_or_else(|| "neutral".to_string()),
                        source_type: SourceType::Markdown,
                    });
                }
            }
        }
        Ok(summaries)
    }

    /// Load a full character, using a cache invalidated by file mtime.
    pub fn load_character(&self, character_id: &str) -> Result<Character> {
        let sources = self.iter_character_sources()?;
        let source = sources
            .into_iter()
            .find(|s| match s {
                CharacterSource::Directory { id, .. } => id == character_id,
                CharacterSource::Markdown { id, .. } => id == character_id,
            })
            .ok_or_else(|| MeuxError::CharacterNotFound(character_id.to_string()))?;

        let (mtime_path, source_type_tag) = match &source {
            CharacterSource::Directory { path, .. } => {
                (path.join("character.yaml"), "directory")
            }
            CharacterSource::Markdown { path, .. } => (path.clone(), "markdown"),
        };

        let mtime = fs::metadata(&mtime_path)?.modified().unwrap_or(SystemTime::UNIX_EPOCH);

        // Check cache
        {
            let cache = self.cache.read().unwrap();
            if let Some(cached) = cache.get(character_id) {
                if cached.mtime == mtime {
                    return Ok(cached.character.clone());
                }
            }
        }

        let character = match source {
            CharacterSource::Directory { id, path } => load_from_directory(&id, &path)?,
            CharacterSource::Markdown { id, path } => load_from_markdown(&id, &path)?,
        };

        // Store in cache
        {
            let mut cache = self.cache.write().unwrap();
            cache.insert(
                character_id.to_string(),
                CachedCharacter {
                    mtime,
                    character: character.clone(),
                },
            );
        }

        let _ = source_type_tag; // used for clarity only
        Ok(character)
    }

    /// Create a new character from basic parameters. Returns the character id.
    pub fn create_character(
        &self,
        name: &str,
        personality: &str,
        model_id: &str,
        voice: &str,
        user_name: &str,
        user_about: &str,
    ) -> Result<String> {
        let id = slugify(name);
        let char_dir = self.characters_dir.join(&id);
        fs::create_dir_all(&char_dir)?;
        fs::create_dir_all(char_dir.join("examples"))?;

        // character.yaml
        let yaml_content = format!(
            "name: \"{name}\"\nlive2d_model: \"{model_id}\"\nvoice: \"{voice}\"\ndefault_emotion: \"neutral\"\n",
        );
        fs::write(char_dir.join("character.yaml"), &yaml_content)?;

        // soul.md
        let soul = format!(
            "# Soul\n\nYou are {name}. {personality}\n",
        );
        fs::write(char_dir.join("soul.md"), &soul)?;

        // style.md
        let style = "# Style\n\nSpeak naturally and conversationally.\n";
        fs::write(char_dir.join("style.md"), style)?;

        // rules.md
        let rules = "# Rules\n\nBe helpful, honest, and respectful.\n";
        fs::write(char_dir.join("rules.md"), rules)?;

        // context.md
        let context = format!(
            "# Context\n\nYou are talking to {user_name}. {user_about}\n",
        );
        fs::write(char_dir.join("context.md"), &context)?;

        // examples/chat_examples.md
        let examples = format!(
            "# Chat Examples\n\nUser: Hi {name}!\n{name}: Hey there! How are you doing?\n",
        );
        fs::write(char_dir.join("examples/chat_examples.md"), &examples)?;

        Ok(id)
    }

    /// Iterate over character sources in the characters directory.
    fn iter_character_sources(&self) -> Result<Vec<CharacterSource>> {
        let mut sources = Vec::new();
        if !self.characters_dir.exists() {
            return Ok(sources);
        }
        let entries = fs::read_dir(&self.characters_dir)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if path.join("character.yaml").exists() {
                    let id = path
                        .file_name()
                        .unwrap()
                        .to_string_lossy()
                        .to_string();
                    sources.push(CharacterSource::Directory { id, path });
                }
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                let id = path
                    .file_stem()
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                sources.push(CharacterSource::Markdown { id, path });
            }
        }
        Ok(sources)
    }
}

/// Load a character from a directory containing character.yaml and prompt .md
/// files.
fn load_from_directory(id: &str, dir: &Path) -> Result<Character> {
    let yaml_path = dir.join("character.yaml");
    let raw = fs::read_to_string(&yaml_path)?;
    let yaml: CharacterYaml = serde_yaml::from_str(&raw)?;

    let name = yaml.name.unwrap_or_else(|| id.to_string());
    let live2d_model = yaml.live2d_model.unwrap_or_default();
    let voice = yaml.voice.unwrap_or_default();
    let default_emotion = yaml
        .default_emotion
        .unwrap_or_else(|| "neutral".to_string());

    let read_section = |filename: &str| -> String {
        let p = dir.join(filename);
        fs::read_to_string(&p).unwrap_or_default().trim().to_string()
    };

    let sections = PromptSections {
        soul: read_section("soul.md"),
        style: read_section("style.md"),
        rules: read_section("rules.md"),
        context: read_section("context.md"),
        lorebook: read_section("lorebook.md"),
        examples: read_section("examples/chat_examples.md"),
        legacy: String::new(),
    };

    let system_prompt = build_system_prompt_from_sections(&name, &sections, DEFAULT_EXPRESSIONS);

    Ok(Character {
        id: id.to_string(),
        name,
        live2d_model,
        voice,
        default_emotion,
        system_prompt,
        prompt_sections: sections,
        source_type: SourceType::Directory,
    })
}

/// Load a character from a single markdown file with YAML frontmatter.
fn load_from_markdown(id: &str, path: &Path) -> Result<Character> {
    let raw = fs::read_to_string(path)?;
    let (frontmatter, body) = parse_md_frontmatter(&raw)?;
    let yaml: CharacterYaml = serde_yaml::from_str(&frontmatter)?;

    let name = yaml.name.unwrap_or_else(|| id.to_string());
    let live2d_model = yaml.live2d_model.unwrap_or_default();
    let voice = yaml.voice.unwrap_or_default();
    let default_emotion = yaml
        .default_emotion
        .unwrap_or_else(|| "neutral".to_string());

    let sections = PromptSections {
        legacy: body.trim().to_string(),
        ..Default::default()
    };

    let system_prompt = build_system_prompt_from_sections(&name, &sections, DEFAULT_EXPRESSIONS);

    Ok(Character {
        id: id.to_string(),
        name,
        live2d_model,
        voice,
        default_emotion,
        system_prompt,
        prompt_sections: sections,
        source_type: SourceType::Markdown,
    })
}

/// Parse YAML frontmatter from a markdown string.
/// Returns (frontmatter_yaml, body).
pub fn parse_md_frontmatter(input: &str) -> Result<(String, String)> {
    let re = Regex::new(r"(?s)^---\s*\n(.*?)\n---\s*\n(.*)").unwrap();
    let caps = re.captures(input).ok_or_else(|| {
        MeuxError::InvalidConfig("Missing YAML frontmatter in markdown file".to_string())
    })?;
    let frontmatter = caps.get(1).unwrap().as_str().to_string();
    let body = caps.get(2).unwrap().as_str().to_string();
    Ok((frontmatter, body))
}

/// Convert a string to a URL/filesystem-safe slug.
pub fn slugify(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

/// Build a full system prompt from character sections and expression list.
pub fn build_system_prompt(character: &Character, expressions: &[&str]) -> String {
    build_system_prompt_from_sections(
        &character.name,
        &character.prompt_sections,
        expressions,
    )
}

fn build_system_prompt_from_sections(
    name: &str,
    sections: &PromptSections,
    expressions: &[&str],
) -> String {
    let mut parts = Vec::new();

    let sections_body = build_prompt_sections_body(name, sections);
    if !sections_body.is_empty() {
        parts.push(sections_body);
    }

    // Expression rules
    let expr_list = expressions
        .iter()
        .map(|e| format!("- {e}"))
        .collect::<Vec<_>>()
        .join("\n");
    let expression_block = format!(
        "## EXPRESSION RULES\n\n\
         You MUST include an expression tag in every response.\n\
         Available expressions:\n{expr_list}\n\n\
         Format: [expression:NAME] placed at the start of your response."
    );
    parts.push(expression_block);

    parts.join("\n\n")
}

/// Join non-empty prompt sections with markdown headers.
fn build_prompt_sections_body(name: &str, sections: &PromptSections) -> String {
    let mut parts = Vec::new();

    let named_sections: &[(&str, &str)] = &[
        ("Soul", &sections.soul),
        ("Style", &sections.style),
        ("Rules", &sections.rules),
        ("Context", &sections.context),
        ("Lorebook", &sections.lorebook),
        ("Examples", &sections.examples),
    ];

    for (header, content) in named_sections {
        if !content.is_empty() {
            parts.push(format!("## {header}\n\n{content}"));
        }
    }

    // Legacy content (from markdown single-file characters) goes in directly
    if !sections.legacy.is_empty() {
        parts.push(sections.legacy.clone());
    }

    if parts.is_empty() {
        return String::new();
    }

    format!("# {name}\n\n{}", parts.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_list_empty_characters() {
        let tmp = TempDir::new().unwrap();
        let loader = CharacterLoader::new(tmp.path());
        let list = loader.list_characters().unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_create_and_load_character() {
        let tmp = TempDir::new().unwrap();
        let loader = CharacterLoader::new(tmp.path());

        let id = loader
            .create_character(
                "Aria Nova",
                "A cheerful AI assistant.",
                "aria_live2d",
                "en-US-1",
                "Alice",
                "Loves coding.",
            )
            .unwrap();

        assert_eq!(id, "aria_nova");

        // List should return the character
        let list = loader.list_characters().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Aria Nova");
        assert_eq!(list[0].live2d_model, "aria_live2d");

        // Load should return full character with prompt
        let character = loader.load_character("aria_nova").unwrap();
        assert_eq!(character.name, "Aria Nova");
        assert!(character.system_prompt.contains("Aria Nova"));
        assert!(character.system_prompt.contains("EXPRESSION RULES"));
        assert!(!character.prompt_sections.soul.is_empty());
    }

    #[test]
    fn test_load_from_markdown() {
        let tmp = TempDir::new().unwrap();
        let chars_dir = tmp.path().join("characters");
        fs::create_dir_all(&chars_dir).unwrap();

        let md_content = "---\nname: Luna\nlive2d_model: luna_model\nvoice: en-GB-1\ndefault_emotion: happy\n---\nYou are Luna, a mystical guide.\n";
        fs::write(chars_dir.join("luna.md"), md_content).unwrap();

        let loader = CharacterLoader::new(tmp.path());
        let list = loader.list_characters().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Luna");
        assert_eq!(list[0].default_emotion, "happy");

        let character = loader.load_character("luna").unwrap();
        assert_eq!(character.name, "Luna");
        assert!(character.prompt_sections.legacy.contains("mystical guide"));
        assert!(character.system_prompt.contains("mystical guide"));
    }

    #[test]
    fn test_build_system_prompt_with_expressions() {
        let character = Character {
            id: "test".to_string(),
            name: "TestBot".to_string(),
            live2d_model: String::new(),
            voice: String::new(),
            default_emotion: "neutral".to_string(),
            system_prompt: String::new(),
            prompt_sections: PromptSections {
                soul: "A friendly bot.".to_string(),
                ..Default::default()
            },
            source_type: SourceType::Directory,
        };

        let expressions = &["happy", "sad", "angry"];
        let prompt = build_system_prompt(&character, expressions);

        assert!(prompt.contains("TestBot"));
        assert!(prompt.contains("A friendly bot."));
        assert!(prompt.contains("EXPRESSION RULES"));
        assert!(prompt.contains("- happy"));
        assert!(prompt.contains("- sad"));
        assert!(prompt.contains("- angry"));
        assert!(prompt.contains("[expression:NAME]"));
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Aria Nova"), "aria_nova");
        assert_eq!(slugify("Hello World!"), "hello_world");
        assert_eq!(slugify("test123"), "test123");
        assert_eq!(slugify("My--Character"), "my__character");
    }

    #[test]
    fn test_parse_md_frontmatter() {
        let input = "---\nname: Luna\nvoice: en-GB\n---\nBody content here.\n";
        let (fm, body) = parse_md_frontmatter(input).unwrap();
        assert!(fm.contains("name: Luna"));
        assert!(fm.contains("voice: en-GB"));
        assert!(body.contains("Body content here."));
    }
}
