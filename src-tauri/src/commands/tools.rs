use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[derive(serde::Serialize)]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub permission: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn tools_list(state: State<Arc<AppState>>) -> Result<Vec<ToolInfo>, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let disabled = &config.disabled_tools;

    let tools: Vec<ToolInfo> = state
        .tool_registry
        .list_all()
        .into_iter()
        .map(|def| ToolInfo {
            enabled: !disabled.contains(&def.name),
            permission: format!("{:?}", def.permission_level),
            name: def.name,
            description: def.description,
        })
        .collect();

    Ok(tools)
}
