use async_trait::async_trait;
use serde_json::json;
use std::process::Stdio;
use tokio::process::Command;

use crate::error::{MeuxError, Result};

use super::types::*;
use super::Tool;

#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn run(&self, command: &str) -> Result<std::process::Output>;
}

pub struct RealCommandRunner;

#[async_trait]
impl CommandRunner for RealCommandRunner {
    async fn run(&self, command: &str) -> Result<std::process::Output> {
        tokio::time::timeout(
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
        .map_err(|e| MeuxError::Tool(e.to_string()))
    }
}

pub struct RunCommandTool {
    runner: Box<dyn CommandRunner>,
}

impl RunCommandTool {
    pub fn new() -> Self {
        Self {
            runner: Box::new(RealCommandRunner),
        }
    }

    #[cfg(test)]
    pub fn with_runner(runner: Box<dyn CommandRunner>) -> Self {
        Self { runner }
    }
}

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

        let output = self.runner.run(command).await?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::os::unix::process::ExitStatusExt;
    use std::process::{ExitStatus, Output};

    struct MockCommandRunner {
        stdout: Vec<u8>,
        stderr: Vec<u8>,
        exit_code: i32,
        should_fail: bool,
    }

    #[async_trait]
    impl CommandRunner for MockCommandRunner {
        async fn run(&self, _command: &str) -> Result<Output> {
            if self.should_fail {
                return Err(MeuxError::Tool("Mocked runner error".to_string()));
            }

            Ok(Output {
                status: ExitStatus::from_raw(self.exit_code << 8), // Standard Unix encoding for exit code
                stdout: self.stdout.clone(),
                stderr: self.stderr.clone(),
            })
        }
    }

    #[tokio::test]
    async fn test_run_command_success() {
        let runner = Box::new(MockCommandRunner {
            stdout: b"Hello world".to_vec(),
            stderr: Vec::new(),
            exit_code: 0,
            should_fail: false,
        });

        let tool = RunCommandTool::with_runner(runner);
        let args = json!({"command": "echo 'Hello world'"});

        let result = tool.execute(args).await.unwrap();

        assert!(result.success);
        assert_eq!(result.content, "Exit code: 0\n\nHello world");
    }

    #[tokio::test]
    async fn test_run_command_with_stderr() {
        let runner = Box::new(MockCommandRunner {
            stdout: b"Standard output".to_vec(),
            stderr: b"Standard error".to_vec(),
            exit_code: 1,
            should_fail: false,
        });

        let tool = RunCommandTool::with_runner(runner);
        let args = json!({"command": "some_failing_command"});

        let result = tool.execute(args).await.unwrap();

        assert!(!result.success);
        assert_eq!(
            result.content,
            "Exit code: 1\n\nStdout:\nStandard output\n\nStderr:\nStandard error"
        );
    }

    #[tokio::test]
    async fn test_run_command_truncation() {
        let large_stdout = vec![b'A'; 60_000];
        let runner = Box::new(MockCommandRunner {
            stdout: large_stdout,
            stderr: Vec::new(),
            exit_code: 0,
            should_fail: false,
        });

        let tool = RunCommandTool::with_runner(runner);
        let args = json!({"command": "cat /dev/urandom"});

        let result = tool.execute(args).await.unwrap();

        assert!(result.success);
        assert!(result.content.contains("[Output truncated — showing first 50KB]"));
        assert_eq!(result.content.len(), 50_043);
    }

    #[tokio::test]
    async fn test_run_command_missing_argument() {
        let runner = Box::new(MockCommandRunner {
            stdout: Vec::new(),
            stderr: Vec::new(),
            exit_code: 0,
            should_fail: false,
        });

        let tool = RunCommandTool::with_runner(runner);
        let args = json!({}); // Missing "command"

        let result = tool.execute(args).await;

        assert!(result.is_err());
        if let Err(MeuxError::Tool(msg)) = result {
            assert_eq!(msg, "Missing 'command' argument");
        } else {
            panic!("Expected Tool error");
        }
    }

    #[tokio::test]
    async fn test_run_command_runner_error() {
        let runner = Box::new(MockCommandRunner {
            stdout: Vec::new(),
            stderr: Vec::new(),
            exit_code: 0,
            should_fail: true,
        });

        let tool = RunCommandTool::with_runner(runner);
        let args = json!({"command": "sleep 100"});

        let result = tool.execute(args).await;

        assert!(result.is_err());
        if let Err(MeuxError::Tool(msg)) = result {
            assert_eq!(msg, "Mocked runner error");
        } else {
            panic!("Expected Tool error");
        }
    }
}
