use crate::character::{self, CharacterLoader};
use crate::error::Result;
use crate::expressions::{ExpressionManager, GLOBAL_EXPRESSIONS};
use crate::llm::types::ChatMessage;
use crate::memory::retriever;
use crate::memory::store::MemoryStore;
use crate::session::SessionStore;

pub const DEFAULT_HISTORY_LIMIT: usize = 20;
pub const DEFAULT_MEMORY_LIMIT: usize = 4;

pub struct ChatPromptResult {
    pub messages: Vec<ChatMessage>,
    pub system_prompt: String,
    pub memory_prompt: String,
}

pub fn build_chat_prompt(
    character_loader: &CharacterLoader,
    session_store: &SessionStore,
    memory_store: &MemoryStore,
    _expression_manager: &ExpressionManager,
    character_id: &str,
    user_id: &str,
    user_message: &str,
    history_limit: Option<usize>,
    memory_limit: Option<usize>,
) -> Result<ChatPromptResult> {
    let history_limit = history_limit.unwrap_or(DEFAULT_HISTORY_LIMIT);
    let memory_limit = memory_limit.unwrap_or(DEFAULT_MEMORY_LIMIT);

    // 1. Load character
    let char_data = character_loader.load_character(character_id)?;

    // 2. Build system prompt with global expressions
    let global_exprs: Vec<&str> = GLOBAL_EXPRESSIONS.to_vec();
    let system_prompt = character::build_system_prompt(&char_data, &global_exprs);

    // 3. Ensure memory store exists, list all memories, retrieve relevant ones
    let _ = memory_store.ensure_store(character_id, user_id);
    let all_memories = memory_store.list(character_id, user_id, None, 100)?;
    let relevant = retriever::retrieve_relevant(user_message, &all_memories, memory_limit);

    // 4. Format memory prompt
    let memory_prompt = retriever::format_memory_prompt(&relevant);

    // 5. Load session history
    let history = session_store.load_history(character_id, user_id, Some(history_limit))?;

    // 6. Assemble messages array
    let mut messages = Vec::new();

    // System message (system_prompt + tools context)
    let tools_context = "\n\n## TOOL CAPABILITIES\n\nYou have access to tools that let you interact with the user's computer. You can read files, write files, search the web, run commands, organize the desktop, and more. Use tools when the user asks you to do something on their machine, or when you need information to answer their question.\n\nIMPORTANT RULES:\n- ALWAYS use the provided tool functions to perform actions. NEVER write out function calls as text.\n- When you need to perform an action, call the appropriate tool directly — do not describe what you would call.\n- You can call multiple tools in a single response if needed.\n- When using tools, maintain your personality and expressions. Briefly explain what you're about to do before calling a tool.\n- For multi-step tasks, call one tool at a time and use the result to decide the next step.\n- After completing a task, briefly suggest 1-2 related follow-up actions the user might want. For example: after organizing the desktop, suggest cleaning Downloads too. After reading a file, suggest summarizing or editing it. Keep suggestions short and natural — one sentence max.";
    let full_system = format!("{}{}", system_prompt, tools_context);
    messages.push(ChatMessage::text("system", &full_system));

    // System message (memory_prompt) — only if non-empty
    if !memory_prompt.is_empty() {
        messages.push(ChatMessage::text("system", &memory_prompt));
    }

    // All history messages
    for msg in &history {
        messages.push(ChatMessage::text(&msg.role, &msg.content));
    }

    // Current user message
    messages.push(ChatMessage::text("user", user_message));

    Ok(ChatPromptResult {
        messages,
        system_prompt,
        memory_prompt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_build_chat_prompt() {
        let tmp = TempDir::new().unwrap();
        let char_loader = CharacterLoader::new(tmp.path());
        let session_store = SessionStore::new(tmp.path());
        let memory_store = MemoryStore::new(tmp.path().to_path_buf());
        let expr_mgr = ExpressionManager::new(tmp.path());

        char_loader
            .create_character("Test", "A helpful companion", "model1", "jp_001", "friendly", "casual", "natural", "User", "A dev")
            .unwrap();

        let result = build_chat_prompt(
            &char_loader,
            &session_store,
            &memory_store,
            &expr_mgr,
            "test",
            "default-user",
            "Hello there!",
            None,
            None,
        )
        .unwrap();

        assert!(result.messages.len() >= 2); // system + user at minimum
        assert_eq!(result.messages[0].role, "system");
        assert_eq!(result.messages.last().unwrap().role, "user");
        assert_eq!(result.messages.last().unwrap().content_str(), "Hello there!");
        assert!(result.system_prompt.contains("EXPRESSION RULES"));
    }
}
