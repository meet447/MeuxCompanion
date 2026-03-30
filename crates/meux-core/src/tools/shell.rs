use async_trait::async_trait;
use serde_json::json;
use std::process::Stdio;
use tokio::process::Command;

use crate::error::{MeuxError, Result};

use super::types::*;
use super::Tool;

pub struct RunCommandTool;

#[async_trait]
impl Tool for RunCommandTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "run_command".to_string(),
            description:
                "Execute a shell command and return its output (stdout + stderr). Has a 30-second timeout."
                    .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute"
                    }
                },
                "required": ["command"]
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let command = arguments["command"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'command' argument".to_string()))?;

        let output = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            Command::new("sh")
                .arg("-c")
                .arg(command)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output(),
        )
        .await
        .map_err(|_| MeuxError::Tool("Command timed out after 30 seconds".to_string()))?
        .map_err(|e| MeuxError::Tool(e.to_string()))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let exit_code = output.status.code().unwrap_or(-1);

        let content = if stderr.is_empty() {
            format!("Exit code: {}\n\n{}", exit_code, stdout)
        } else {
            format!(
                "Exit code: {}\n\nStdout:\n{}\n\nStderr:\n{}",
                exit_code, stdout, stderr
            )
        };

        // Truncate if output is very large
        let content = if content.len() > 50_000 {
            format!(
                "{}\n\n[Output truncated — showing first 50KB]",
                &content[..50_000]
            )
        } else {
            content
        };

        Ok(ToolResult {
            tool_call_id: String::new(),
            content,
            success: output.status.success(),
        })
    }
}
