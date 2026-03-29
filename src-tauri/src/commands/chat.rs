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

/// Strip expression tags (<<tag>> and [expression:tag]) from text.
fn clean_text(text: &str) -> String {
    let re = Regex::new(r"(<</?[^>]*>>)|(\[expression:\s*[^\]]+\])").expect("invalid regex");
    re.replace_all(text, "").to_string()
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
    let square_re = Regex::new(r"\[expression:\s*([^\]]+)\]").expect("invalid regex");

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

        // Check for expression tags in buffer
        loop {
            // Look for opening expression tag
            if let Some(open_match) = open_re.find(&buffer) {
                let before_tag = buffer[..open_match.start()].to_string();
                let tag_content = open_re
                    .captures(&buffer)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default();

                // Flush text before the tag as a sentence
                let clean = clean_text(&before_tag).trim().to_string();
                if !clean.is_empty() {
                    let resolved = state
                        .expressions
                        .resolve(&model_id, &current_expression);

                    let _ = app.emit(
                        "chat:sentence",
                        SentenceEvent {
                            index: sentence_index,
                            text: clean.clone(),
                            expression: resolved.clone(),
                        },
                    );

                    // Spawn TTS task
                    let tts_cfg = tts_config.clone();
                    let app_tts = app.clone();
                    let idx = sentence_index;
                    let tts_text = clean;
                    tokio::spawn(async move {
                        match meux_core::tts::generate_tts_auto(&tts_text, &tts_cfg).await {
                            Ok(audio_data) => {
                                use base64::Engine;
                                let b64 = base64::engine::general_purpose::STANDARD.encode(&audio_data);
                                let _ = app_tts.emit(
                                    "chat:audio",
                                    AudioEvent {
                                        index: idx,
                                        data: b64,
                                    },
                                );
                            }
                            Err(e) => {
                                eprintln!("TTS error for sentence {}: {}", idx, e);
                            }
                        }
                    });

                    sentence_index += 1;
                }

                // Update current expression
                current_expression = tag_content;

                // Remove everything up to and including the tag from buffer
                buffer = buffer[open_match.end()..].to_string();
                continue;
            }

            // Look for closing expression tag
            if let Some(close_match) = close_re.find(&buffer) {
                let before_tag = buffer[..close_match.start()].to_string();

                // Flush text before closing tag as a sentence
                let clean = clean_text(&before_tag).trim().to_string();
                if !clean.is_empty() {
                    let resolved = state
                        .expressions
                        .resolve(&model_id, &current_expression);

                    let _ = app.emit(
                        "chat:sentence",
                        SentenceEvent {
                            index: sentence_index,
                            text: clean.clone(),
                            expression: resolved.clone(),
                        },
                    );

                    // Spawn TTS task
                    let tts_cfg = tts_config.clone();
                    let app_tts = app.clone();
                    let idx = sentence_index;
                    let tts_text = clean;
                    tokio::spawn(async move {
                        match meux_core::tts::generate_tts_auto(&tts_text, &tts_cfg).await {
                            Ok(audio_data) => {
                                use base64::Engine;
                                let b64 = base64::engine::general_purpose::STANDARD.encode(&audio_data);
                                let _ = app_tts.emit(
                                    "chat:audio",
                                    AudioEvent {
                                        index: idx,
                                        data: b64,
                                    },
                                );
                            }
                            Err(e) => {
                                eprintln!("TTS error for sentence {}: {}", idx, e);
                            }
                        }
                    });

                    sentence_index += 1;
                }

                // Reset expression to neutral after closing tag
                current_expression = "neutral".to_string();
                buffer = buffer[close_match.end()..].to_string();
                continue;
            }

            // Look for bracketed expression tag [expression:name]
            if let Some(sq_match) = square_re.find(&buffer) {
                let before_tag = buffer[..sq_match.start()].to_string();
                let tag_content = square_re
                    .captures(&buffer)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_default();

                let clean = clean_text(&before_tag).trim().to_string();
                if !clean.is_empty() {
                    let resolved = state.expressions.resolve(&model_id, &current_expression);
                    let _ = app.emit("chat:sentence", SentenceEvent {
                        index: sentence_index,
                        text: clean.clone(),
                        expression: resolved,
                    });

                    // TTS
                    let tts_cfg = tts_config.clone();
                    let app_tts = app.clone();
                    let idx = sentence_index;
                    let tts_text = clean;
                    tokio::spawn(async move {
                        if let Ok(audio_data) = meux_core::tts::generate_tts_auto(&tts_text, &tts_cfg).await {
                             use base64::Engine;
                             let b64 = base64::engine::general_purpose::STANDARD.encode(&audio_data);
                             let _ = app_tts.emit("chat:audio", AudioEvent { index: idx, data: b64 });
                        }
                    });
                    sentence_index += 1;
                }

                current_expression = tag_content;
                buffer = buffer[sq_match.end()..].to_string();
                continue;
            }

            break;
        }
    }

    // 7. Flush remaining buffer
    let remaining = clean_text(&buffer).trim().to_string();
    if !remaining.is_empty() {
        let resolved = state
            .expressions
            .resolve(&model_id, &current_expression);

        let _ = app.emit(
            "chat:sentence",
            SentenceEvent {
                index: sentence_index,
                text: remaining.clone(),
                expression: resolved.clone(),
            },
        );

        // TTS for final sentence
        let tts_cfg = tts_config.clone();
        let app_tts = app.clone();
        let idx = sentence_index;
        let tts_text = remaining;
        tokio::spawn(async move {
            match meux_core::tts::generate_tts_auto(&tts_text, &tts_cfg).await {
                Ok(audio_data) => {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&audio_data);
                    let _ = app_tts.emit(
                        "chat:audio",
                        AudioEvent {
                            index: idx,
                            data: b64,
                        },
                    );
                }
                Err(e) => {
                    eprintln!("TTS error for sentence {}: {}", idx, e);
                }
            }
        });
    }

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
