use crate::AppState;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use meux_core::config::types::AppConfig;
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::State;

#[derive(Clone)]
struct TranscriptionBackend {
    label: String,
    provider: String,
    base_url: String,
    api_key: String,
}

fn transcription_model_candidates(provider: &str, base_url: &str) -> Vec<&'static str> {
    let provider = provider.to_lowercase();
    let base_url = base_url.to_lowercase();

    if provider.contains("groq") || base_url.contains("groq.com") {
        vec![
            "whisper-large-v3-turbo",
            "whisper-large-v3",
            "distil-whisper-large-v3-en",
        ]
    } else {
        vec!["gpt-4o-mini-transcribe", "whisper-1"]
    }
}

fn audio_extension(mime_type: &str) -> &'static str {
    match mime_type {
        "audio/mp4" | "audio/x-m4a" => "m4a",
        "audio/mpeg" => "mp3",
        "audio/ogg" | "audio/webm;codecs=opus" | "audio/webm" => "webm",
        "audio/wav" => "wav",
        _ => "webm",
    }
}

fn push_backend(
    backends: &mut Vec<TranscriptionBackend>,
    seen: &mut HashSet<String>,
    label: String,
    provider: String,
    base_url: String,
    api_key: String,
) {
    let trimmed_base_url = base_url.trim().trim_end_matches('/').to_string();
    if trimmed_base_url.is_empty() {
        return;
    }

    let fingerprint = format!("{provider}|{trimmed_base_url}|{}", api_key.is_empty());
    if !seen.insert(fingerprint) {
        return;
    }

    backends.push(TranscriptionBackend {
        label,
        provider,
        base_url: trimmed_base_url,
        api_key,
    });
}

fn transcription_backends(config: &AppConfig) -> Vec<TranscriptionBackend> {
    let mut backends = Vec::new();
    let mut seen = HashSet::new();

    push_backend(
        &mut backends,
        &mut seen,
        format!("active provider ({})", config.llm.provider),
        config.llm.provider.clone(),
        config.llm.base_url.clone(),
        config.llm.api_key.clone().unwrap_or_default(),
    );

    for provider_name in ["openai", "groq"] {
        if let Some(provider) = config.llm_providers.get(provider_name) {
            push_backend(
                &mut backends,
                &mut seen,
                format!("configured {provider_name} provider"),
                provider_name.to_string(),
                provider.base_url.clone(),
                provider.api_key.clone().unwrap_or_default(),
            );
        }
    }

    backends
}

#[tauri::command]
pub async fn voice_transcribe(
    state: State<'_, Arc<AppState>>,
    audio_base64: String,
    mime_type: String,
) -> Result<String, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;

    let backends = transcription_backends(&config);
    if backends.is_empty() {
        return Err("Configure an LLM provider before using voice input.".to_string());
    }

    let audio_bytes = STANDARD
        .decode(audio_base64.trim())
        .map_err(|e| format!("Invalid audio payload: {e}"))?;

    let extension = audio_extension(&mime_type);
    let file_name = format!("voice-input.{extension}");
    let client = Client::new();
    let mut last_error = String::new();

    for backend in backends {
        let endpoint = format!("{}/audio/transcriptions", backend.base_url);
        let models = transcription_model_candidates(&backend.provider, &backend.base_url);

        for model in models {
            let part = Part::bytes(audio_bytes.clone())
                .file_name(file_name.clone())
                .mime_str(&mime_type)
                .map_err(|e| e.to_string())?;
            let form = Form::new()
                .part("file", part)
                .text("model", model.to_string());

            let mut request = client.post(&endpoint).multipart(form);
            if !backend.api_key.is_empty() {
                request = request.bearer_auth(&backend.api_key);
            }

            let response = match request.send().await {
                Ok(response) => response,
                Err(err) => {
                    last_error = format!("{} request failed: {err}", backend.label);
                    continue;
                }
            };

            let status = response.status();
            let body = response.text().await.unwrap_or_default();

            if status.is_success() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                    if let Some(text) = json.get("text").and_then(|value| value.as_str()) {
                        return Ok(text.trim().to_string());
                    }
                }

                let text = body.trim().trim_matches('"').to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }

            last_error = format!("{} returned HTTP {status}: {body}", backend.label);
        }
    }

    Err(if last_error.is_empty() {
        "Voice transcription failed. Configure OpenAI or Groq for voice input.".to_string()
    } else {
        format!("Voice transcription failed: {last_error}")
    })
}
