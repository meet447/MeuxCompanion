pub mod types;
pub mod desktop;
pub mod file_ops;
pub mod shell;
pub mod web_search;

use std::collections::HashMap;

use async_trait::async_trait;
use serde_json::json;

use crate::error::{MeuxError, Result};

// Re-export core types
pub use types::{PermissionLevel, ToolCallRequest, ToolDefinition, ToolResult};

/// Trait that all tools must implement.
#[async_trait]
pub trait Tool: Send + Sync {
    fn definition(&self) -> ToolDefinition;
    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult>;
}

/// Registry that holds all available tools and dispatches execution.
pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// Create a registry with all built-in tools registered.
    pub fn with_defaults() -> Self {
        let mut registry = Self::new();
        // File tools
        registry.register(Box::new(file_ops::ReadFileTool));
        registry.register(Box::new(file_ops::ListDirectoryTool));
        registry.register(Box::new(file_ops::SummarizeFileTool));
        registry.register(Box::new(file_ops::MoveFileTool));
        registry.register(Box::new(file_ops::DeleteFileTool));
        // Shell
        registry.register(Box::new(shell::RunCommandTool));
        // Desktop
        registry.register(Box::new(desktop::OpenApplicationTool));
        registry.register(Box::new(desktop::OrganizeDesktopTool));
        // Web
        registry.register(Box::new(web_search::WebSearchTool));
        registry
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        let def = tool.definition();
        self.tools.insert(def.name.clone(), tool);
    }

    /// Get all tool definitions.
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools.values().map(|t| t.definition()).collect()
    }

    /// Format tool definitions as the OpenAI `tools` array for the API request.
    pub fn openai_tools_json(&self) -> Vec<serde_json::Value> {
        self.tools
            .values()
            .map(|tool| {
                let def = tool.definition();
                json!({
                    "type": "function",
                    "function": {
                        "name": def.name,
                        "description": def.description,
                        "parameters": def.parameters,
                    }
                })
            })
            .collect()
    }

    /// Execute a tool call by name.
    pub async fn execute(&self, call: &ToolCallRequest) -> Result<ToolResult> {
        let tool = self
            .tools
            .get(&call.name)
            .ok_or_else(|| MeuxError::Tool(format!("Unknown tool: {}", call.name)))?;

        tool.execute(call.arguments.clone()).await
    }

    /// Get the permission level for a tool by name.
    pub fn permission_level(&self, name: &str) -> Option<PermissionLevel> {
        self.tools.get(name).map(|t| t.definition().permission_level)
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}
