use crate::AppState;
use futures::StreamExt;
use meux_core::llm::types::LlmStreamConfig;
use regex::Regex;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

// ---------------------------------------------------------------------------
// Event payload structs
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
struct TextChunkEvent {
    text: String,
}

#[derive(Clone, serde::Serialize)]
struct SentenceEvent {
    index: u32,
    text: String,
    expression: String,
}

#[derive(Clone, serde::Serialize)]
struct AudioEvent {
    index: u32,
    data: String, // base64-encoded audio
}

#[derive(Clone, serde::Serialize)]
struct ChatDoneEvent {
    state_update: serde_json::Value,
}

#[derive(Clone, serde::Serialize)]
struct ChatErrorEvent {
    message: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn derive_user_id(config: &meux_core::config::types::AppConfig) -> String {
    let name = &config.user.name;
    if name.is_empty() {
        "default-user".to_string()
    } else {
        meux_core::character::slugify(name)
    }
}

/// Strip expression tags (<<tag>>, [expression:tag], or [tag]) from text.
fn clean_text(text: &str) -> String {
    let re = Regex::new(r"(<</?[^>]*>>)|(\[expression:\s*[^\]]+\])|(\[[a-zA-Z0-9_\-]+\])").expect("invalid regex");
    re.replace_all(text, "").to_string()
}

#[derive(Debug, Clone)]
enum TagAction {
    SetExpression(String),
    ResetExpression,
}

#[derive(Debug, Clone)]
struct TagMatch {
    start: usize,
    end: usize,
    action: TagAction,
}

fn find_next_tag(
    buffer: &str,
    open_re: &Regex,
    close_re: &Regex,
    square_re: &Regex,
) -> Option<TagMatch> {
    let mut earliest: Option<TagMatch> = None;

    if let Some(captures) = open_re.captures(buffer) {
        if let (Some(full), Some(name)) = (captures.get(0), captures.get(1)) {
            earliest = Some(TagMatch {
                start: full.start(),
                end: full.end(),
                action: TagAction::SetExpression(name.as_str().trim().to_string()),
            });
        }
    }

    if let Some(full) = close_re.find(buffer) {
        let candidate = TagMatch {
            start: full.start(),
            end: full.end(),
            action: TagAction::ResetExpression,
        };
        if earliest
            .as_ref()
            .map(|existing| candidate.start < existing.start)
            .unwrap_or(true)
        {
            earliest = Some(candidate);
        }
    }

    if let Some(captures) = square_re.captures(buffer) {
        if let (Some(full), Some(name)) = (captures.get(0), captures.get(1)) {
            let candidate = TagMatch {
                start: full.start(),
                end: full.end(),
                action: TagAction::SetExpression(name.as_str().trim().to_string()),
            };
            if earliest
                .as_ref()
                .map(|existing| candidate.start < existing.start)
                .unwrap_or(true)
            {
                earliest = Some(candidate);
            }
        }
    }

    earliest
}

fn find_sentence_boundary(text: &str, allow_end_boundary: bool) -> Option<usize> {
    let mut chars = text.char_indices().peekable();

    while let Some((idx, ch)) = chars.next() {
        if !matches!(ch, '.' | '!' | '?' | '…') {
            continue;
        }

        let mut end = idx + ch.len_utf8();
        while let Some(&(next_idx, next_ch)) = chars.peek() {
            if matches!(next_ch, '"' | '\'' | ')' | ']' | '}' | '”' | '’') {
                end = next_idx + next_ch.len_utf8();
                chars.next();
            } else {
                break;
            }
        }

        match chars.peek() {
            Some((_, next_ch)) if next_ch.is_whitespace() || matches!(next_ch, '<' | '[') => {
                return Some(end);
            }
            None if allow_end_boundary => return Some(end),
            _ => {}
        }
    }

    None
}

fn spawn_tts_for_sentence(
    app: &AppHandle,
    tts_config: &meux_core::config::types::TtsConfig,
    index: u32,
    text: String,
) {
    let tts_cfg = tts_config.clone();
    let app_tts = app.clone();

    tokio::spawn(async move {
        match meux_core::tts::generate_tts_auto(&text, &tts_cfg).await {
            Ok(audio_data) => {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&audio_data);
                let _ = app_tts.emit(
                    "chat:audio",
                    AudioEvent {
                        index,
                        data: b64,
                    },
                );
            }
            Err(e) => {
                eprintln!("TTS error for sentence {}: {}", index, e);
            }
        }
    });
}

fn emit_sentence_chunk(
    app: &AppHandle,
    state: &Arc<AppState>,
    model_id: &str,
    current_expression: &str,
    tts_config: &meux_core::config::types::TtsConfig,
    sentence_index: &mut u32,
    raw_text: &str,
) {
    let clean = clean_text(raw_text).trim().to_string();
    if clean.is_empty() {
        return;
    }

    let resolved = state.expressions.resolve(model_id, current_expression);
    let idx = *sentence_index;

    let _ = app.emit(
        "chat:sentence",
        SentenceEvent {
            index: idx,
            text: clean.clone(),
            expression: resolved,
        },
    );

    spawn_tts_for_sentence(app, tts_config, idx, clean);
    *sentence_index += 1;
}

fn emit_ready_sentences(
    app: &AppHandle,
    state: &Arc<AppState>,
    model_id: &str,
    current_expression: &str,
    tts_config: &meux_core::config::types::TtsConfig,
    sentence_index: &mut u32,
    text: &str,
    allow_end_boundary: bool,
    force_flush_remainder: bool,
) {
    let mut remaining = text.trim_start().to_string();

    while let Some(boundary) = find_sentence_boundary(&remaining, allow_end_boundary) {
        let sentence = remaining[..boundary].to_string();
        emit_sentence_chunk(
            app,
            state,
            model_id,
            current_expression,
            tts_config,
            sentence_index,
            &sentence,
        );
        remaining = remaining[boundary..].trim_start().to_string();
    }

    if force_flush_remainder {
        emit_sentence_chunk(
            app,
            state,
            model_id,
            current_expression,
            tts_config,
            sentence_index,
            &remaining,
        );
    }
}

fn drain_buffer_sentences(
    app: &AppHandle,
    state: &Arc<AppState>,
    model_id: &str,
    current_expression: &str,
    tts_config: &meux_core::config::types::TtsConfig,
    sentence_index: &mut u32,
    buffer: &mut String,
    allow_end_boundary: bool,
) {
    let mut working = buffer.trim_start().to_string();

    while let Some(boundary) = find_sentence_boundary(&working, allow_end_boundary) {
        let sentence = working[..boundary].to_string();
        emit_sentence_chunk(
            app,
            state,
            model_id,
            current_expression,
            tts_config,
            sentence_index,
            &sentence,
        );
        working = working[boundary..].trim_start().to_string();
    }

    *buffer = working;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    character_id: String,
    message: String,
) -> Result<(), String> {
    let state = Arc::clone(&state);
    let app_handle = app.clone();

    tokio::spawn(async move {
        if let Err(e) = run_chat_stream(app_handle.clone(), state, character_id, message).await {
            let _ = app_handle.emit(
                "chat:error",
                ChatErrorEvent {
                    message: e.to_string(),
                },
            );
        }
    });

    Ok(())
}

async fn run_chat_stream(
    app: AppHandle,
    state: Arc<AppState>,
    character_id: String,
    message: String,
) -> Result<(), String> {
    // 1. Load config, derive user_id
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = derive_user_id(&config);

    // Load character to get model_id for expression resolution
    let character = state
        .characters
        .load_character(&character_id)
        .map_err(|e| e.to_string())?;
    let model_id = character.live2d_model.clone();

    // 2. Build prompt
    let prompt_result = meux_core::prompt::build_chat_prompt(
        &state.characters,
        &state.sessions,
        &state.states,
        &state.memories,
        &state.expressions,
        &character_id,
        &user_id,
        &message,
        None,
        None,
    )
    .map_err(|e| e.to_string())?;

    // 3. Create LlmStreamConfig from config.llm
    let llm_config = LlmStreamConfig {
        base_url: config.llm.base_url.clone(),
        api_key: config.llm.api_key.clone().unwrap_or_default(),
        model: config.llm.model.clone(),
        temperature: 0.7,
        max_tokens: 1024,
    };

    // 4. Stream LLM response
    let mut stream = state.llm.stream_chat(prompt_result.messages, &llm_config);

    // 5. Expression tag regexes
    let open_re = Regex::new(r"<<([^/>][^>]*)>>").expect("invalid regex");
    let close_re = Regex::new(r"<</[^>]*>>").expect("invalid regex");
    // Matches [expression:name] or just [name]
    let square_re = Regex::new(r"\[(?:expression:\s*)?([a-zA-Z0-9_\-]+)\]").expect("invalid regex");

    let mut full_response = String::new();
    let mut buffer = String::new();
    let mut sentence_index: u32 = 0;
    let mut current_expression = "neutral".to_string();
    let tts_config = config.tts.clone();

    // 6. Process stream tokens
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| e.to_string())?;
        let token = &chunk.text;

        // Emit raw text chunk
        let _ = app.emit("chat:text-chunk", TextChunkEvent { text: token.clone() });

        full_response.push_str(token);
        buffer.push_str(token);

        // Flush any sentence that already looks complete, even before the next tag arrives.
        drain_buffer_sentences(
            &app,
            &state,
            &model_id,
            &current_expression,
            &tts_config,
            &mut sentence_index,
            &mut buffer,
            false,
        );

        // Check for expression tags in buffer
        loop {
            if let Some(tag_match) = find_next_tag(&buffer, &open_re, &close_re, &square_re) {
                let before_tag = buffer[..tag_match.start].to_string();

                emit_ready_sentences(
                    &app,
                    &state,
                    &model_id,
                    &current_expression,
                    &tts_config,
                    &mut sentence_index,
                    &before_tag,
                    true,
                    true,
                );

                match tag_match.action {
                    TagAction::SetExpression(tag_content) => {
                        current_expression = tag_content;
                    }
                    TagAction::ResetExpression => {
                        current_expression = "neutral".to_string();
                    }
                }

                buffer = buffer[tag_match.end..].to_string();
                continue;
            }

            break;
        }
    }

    // 7. Flush remaining buffer
    emit_ready_sentences(
        &app,
        &state,
        &model_id,
        &current_expression,
        &tts_config,
        &mut sentence_index,
        &buffer,
        true,
        true,
    );

    // 8. Save to session
    let cleaned_response = clean_text(&full_response);

    state
        .sessions
        .append_message(&character_id, &user_id, "user", &message, None)
        .map_err(|e| e.to_string())?;
    state
        .sessions
        .append_message(&character_id, &user_id, "assistant", &cleaned_response, None)
        .map_err(|e| e.to_string())?;

    // 9. Remember exchange (extract memories)
    let _ = meux_core::memory::remember_exchange(
        &state.memories,
        &character_id,
        &user_id,
        &message,
        &cleaned_response,
    );

    // 10. Update relationship state
    let updated_state = state
        .states
        .update_from_exchange(&character_id, &user_id, &message, &cleaned_response)
        .map_err(|e| e.to_string())?;

    let state_json = serde_json::to_value(&updated_state).unwrap_or(serde_json::Value::Null);

    let _ = app.emit(
        "chat:done",
        ChatDoneEvent {
            state_update: state_json,
        },
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::find_sentence_boundary;

    #[test]
    fn finds_sentence_before_next_text() {
        assert_eq!(find_sentence_boundary("Hello there. Next", false), Some(12));
    }

    #[test]
    fn waits_for_more_if_sentence_ends_at_buffer_end() {
        assert_eq!(find_sentence_boundary("Hello there.", false), None);
    }

    #[test]
    fn allows_terminal_boundary_when_flushing() {
        assert_eq!(find_sentence_boundary("Hello there.", true), Some(12));
    }

    #[test]
    fn handles_quote_after_punctuation() {
        assert_eq!(find_sentence_boundary("She said hi.\" Next", false), Some(13));
    }
}

// ---------------------------------------------------------------------------
// History & Clear commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn chat_history(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = derive_user_id(&config);

    let history = state
        .sessions
        .load_history(&character_id, &user_id, Some(50))
        .map_err(|e| e.to_string())?;

    let values: Vec<serde_json::Value> = history
        .into_iter()
        .map(|msg| serde_json::to_value(msg).unwrap_or(serde_json::Value::Null))
        .collect();

    Ok(values)
}

#[tauri::command]
pub fn chat_clear(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<(), String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = derive_user_id(&config);

    state
        .sessions
        .clear_history(&character_id, &user_id)
        .map_err(|e| e.to_string())
}
