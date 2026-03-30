use async_trait::async_trait;
use serde_json::json;
use std::collections::HashMap;

use crate::error::{MeuxError, Result};

use super::types::*;
use super::Tool;

// ---------------------------------------------------------------------------
// open_application
// ---------------------------------------------------------------------------

pub struct OpenApplicationTool;

#[async_trait]
impl Tool for OpenApplicationTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "open_application".to_string(),
            description: "Open an application by name on the user's computer.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The application name (e.g., 'Safari', 'Visual Studio Code', 'Finder')"
                    }
                },
                "required": ["name"]
            }),
            permission_level: PermissionLevel::Cautious,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let name = arguments["name"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'name' argument".to_string()))?;

        let output = tokio::process::Command::new("open")
            .arg("-a")
            .arg(name)
            .output()
            .await
            .map_err(|e| MeuxError::Tool(e.to_string()))?;

        if output.status.success() {
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Opened application: {}", name),
                success: true,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Failed to open {}: {}", name, stderr),
                success: false,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// open_url
// ---------------------------------------------------------------------------

pub struct OpenUrlTool;

#[async_trait]
impl Tool for OpenUrlTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "open_url".to_string(),
            description: "Open a URL in the user's default web browser.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to open (e.g., 'https://example.com')"
                    }
                },
                "required": ["url"]
            }),
            permission_level: PermissionLevel::Cautious,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let url = arguments["url"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'url' argument".to_string()))?;

        let output = tokio::process::Command::new("open")
            .arg(url)
            .output()
            .await
            .map_err(|e| MeuxError::Tool(e.to_string()))?;

        if output.status.success() {
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Opened URL: {}", url),
                success: true,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Failed to open URL {}: {}", url, stderr),
                success: false,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// organize_desktop
// ---------------------------------------------------------------------------

pub struct OrganizeDesktopTool;

#[async_trait]
impl Tool for OrganizeDesktopTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "organize_desktop".to_string(),
            description: "Organize files on the Desktop by moving them into categorized folders (Images, Documents, Videos, Music, Archives, Code, Other)."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, _arguments: serde_json::Value) -> Result<ToolResult> {
        let desktop = dirs::desktop_dir()
            .ok_or_else(|| MeuxError::Tool("Could not find Desktop directory".to_string()))?;

        let category_map = build_extension_map();
        let mut moved: Vec<String> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        let entries = std::fs::read_dir(&desktop).map_err(|e| MeuxError::Tool(e.to_string()))?;

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    errors.push(e.to_string());
                    continue;
                }
            };

            let path = entry.path();

            // Skip directories and hidden files
            if path.is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }

            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let category = category_map
                .get(ext.as_str())
                .cloned()
                .unwrap_or("Other");

            let target_dir = desktop.join(category);
            if let Err(e) = std::fs::create_dir_all(&target_dir) {
                errors.push(format!("Failed to create {}: {}", target_dir.display(), e));
                continue;
            }

            let target = target_dir.join(entry.file_name());
            match std::fs::rename(&path, &target) {
                Ok(_) => moved.push(format!(
                    "{} → {}/",
                    entry.file_name().to_string_lossy(),
                    category
                )),
                Err(e) => errors.push(format!(
                    "Failed to move {}: {}",
                    entry.file_name().to_string_lossy(),
                    e
                )),
            }
        }

        let mut result = String::new();
        if !moved.is_empty() {
            result.push_str(&format!("Organized {} files:\n", moved.len()));
            for m in &moved {
                result.push_str(&format!("  {}\n", m));
            }
        } else {
            result.push_str("No files to organize on the Desktop.\n");
        }
        if !errors.is_empty() {
            result.push_str(&format!("\n{} errors:\n", errors.len()));
            for e in &errors {
                result.push_str(&format!("  {}\n", e));
            }
        }

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: result,
            success: errors.is_empty(),
        })
    }
}

fn build_extension_map() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    // Images
    for ext in &["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff", "heic"] {
        m.insert(*ext, "Images");
    }
    // Documents
    for ext in &["pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "ppt", "pptx", "csv", "md", "pages", "numbers", "key"] {
        m.insert(*ext, "Documents");
    }
    // Videos
    for ext in &["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "m4v"] {
        m.insert(*ext, "Videos");
    }
    // Music
    for ext in &["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"] {
        m.insert(*ext, "Music");
    }
    // Archives
    for ext in &["zip", "tar", "gz", "rar", "7z", "dmg", "iso", "bz2", "xz"] {
        m.insert(*ext, "Archives");
    }
    // Code
    for ext in &["rs", "py", "js", "ts", "jsx", "tsx", "html", "css", "json", "yaml", "yml", "toml", "sh", "go", "java", "c", "cpp", "h", "swift"] {
        m.insert(*ext, "Code");
    }
    m
}
