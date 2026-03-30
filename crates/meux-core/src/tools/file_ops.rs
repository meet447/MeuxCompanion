use async_trait::async_trait;
use serde_json::json;
use std::path::Path;

use crate::error::{MeuxError, Result};

use super::types::*;
use super::Tool;

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

pub struct ReadFileTool;

#[async_trait]
impl Tool for ReadFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "read_file".to_string(),
            description: "Read the contents of a file. Returns the text content. Limited to ~100KB."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute or relative path to the file to read"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let path = Path::new(&expanded);

        if !path.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("File not found: {}", path.display()),
                success: false,
            });
        }

        let metadata = std::fs::metadata(path).map_err(|e| MeuxError::Tool(e.to_string()))?;
        if metadata.len() > 100_000 {
            // Read first 100KB
            let content = std::fs::read_to_string(path).map_err(|e| MeuxError::Tool(e.to_string()))?;
            let truncated: String = content.chars().take(100_000).collect();
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("{}\n\n[File truncated — showing first 100KB of {}]", truncated, metadata.len()),
                success: true,
            });
        }

        let content = std::fs::read_to_string(path).map_err(|e| MeuxError::Tool(e.to_string()))?;
        Ok(ToolResult {
            tool_call_id: String::new(),
            content,
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// list_directory
// ---------------------------------------------------------------------------

pub struct ListDirectoryTool;

#[async_trait]
impl Tool for ListDirectoryTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "list_directory".to_string(),
            description: "List files and directories at a given path. Returns names with type indicators (/ for dirs)."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path to list"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let dir = Path::new(&expanded);

        if !dir.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Directory not found: {}", dir.display()),
                success: false,
            });
        }

        let mut entries = Vec::new();
        let read_dir = std::fs::read_dir(dir).map_err(|e| MeuxError::Tool(e.to_string()))?;

        for entry in read_dir {
            let entry = entry.map_err(|e| MeuxError::Tool(e.to_string()))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let file_type = entry.file_type().map_err(|e| MeuxError::Tool(e.to_string()))?;
            if file_type.is_dir() {
                entries.push(format!("{}/", name));
            } else {
                entries.push(name);
            }
        }

        entries.sort();
        Ok(ToolResult {
            tool_call_id: String::new(),
            content: entries.join("\n"),
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// summarize_file
// ---------------------------------------------------------------------------

pub struct SummarizeFileTool;

#[async_trait]
impl Tool for SummarizeFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "summarize_file".to_string(),
            description: "Read a file and return its content for summarization. The content is truncated to fit context. Use this when the user asks you to summarize a document."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to summarize"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let path = Path::new(&expanded);

        if !path.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("File not found: {}", path.display()),
                success: false,
            });
        }

        let content = std::fs::read_to_string(path).map_err(|e| MeuxError::Tool(e.to_string()))?;
        // Truncate to ~50K chars to leave room for LLM to summarize
        let truncated: String = content.chars().take(50_000).collect();
        let was_truncated = content.len() > 50_000;

        let result = if was_truncated {
            format!(
                "File: {}\nSize: {} bytes (truncated to first 50K chars)\n\n---\n{}",
                path.display(),
                content.len(),
                truncated
            )
        } else {
            format!(
                "File: {}\nSize: {} bytes\n\n---\n{}",
                path.display(),
                content.len(),
                truncated
            )
        };

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: result,
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// move_file
// ---------------------------------------------------------------------------

pub struct MoveFileTool;

#[async_trait]
impl Tool for MoveFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "move_file".to_string(),
            description: "Move or rename a file or directory from one path to another.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "Source path"
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination path"
                    }
                },
                "required": ["source", "destination"]
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let source = arguments["source"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'source' argument".to_string()))?;
        let destination = arguments["destination"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'destination' argument".to_string()))?;

        let src = shellexpand::tilde(source).to_string();
        let dst = shellexpand::tilde(destination).to_string();

        std::fs::rename(&src, &dst).map_err(|e| MeuxError::Tool(e.to_string()))?;

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("Moved {} → {}", src, dst),
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

pub struct DeleteFileTool;

#[async_trait]
impl Tool for DeleteFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "delete_file".to_string(),
            description: "Delete a file or empty directory. Use with caution.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to delete"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let path = Path::new(&expanded);

        if !path.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Path not found: {}", path.display()),
                success: false,
            });
        }

        if path.is_dir() {
            std::fs::remove_dir(path).map_err(|e| MeuxError::Tool(e.to_string()))?;
        } else {
            std::fs::remove_file(path).map_err(|e| MeuxError::Tool(e.to_string()))?;
        }

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("Deleted: {}", path.display()),
            success: true,
        })
    }
}
