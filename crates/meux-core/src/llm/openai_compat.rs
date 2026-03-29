use std::pin::Pin;

use async_stream::try_stream;
use futures::Stream;
use reqwest::Client;
use serde_json::json;

use crate::error::{MeuxError, Result};

use super::types::*;

pub struct OpenAiCompatClient {
    client: Client,
}

impl OpenAiCompatClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Stream chat completions using SSE (Server-Sent Events).
    pub fn stream_chat(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
    ) -> Pin<Box<dyn Stream<Item = Result<StreamChunk>> + Send + '_>> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let body = json!({
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": true,
        });
        let api_key = config.api_key.clone();

        Box::pin(try_stream! {
            let response = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(MeuxError::Http)?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                Err(MeuxError::Llm(format!("HTTP {}: {}", status, text)))?;
                unreachable!();
            }

            let mut stream = response.bytes_stream();
            let mut buffer = String::new();

            use futures::StreamExt;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(MeuxError::Http)?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                // Process complete lines from the buffer
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    if line == "data: [DONE]" {
                        return;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
                        match serde_json::from_str::<ChatCompletionChunk>(data) {
                            Ok(chunk) => {
                                for choice in &chunk.choices {
                                    if let Some(ref content) = choice.delta.content {
                                        if !content.is_empty() {
                                            yield StreamChunk {
                                                text: content.clone(),
                                            };
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                Err(MeuxError::Llm(format!(
                                    "Failed to parse SSE chunk: {} — raw: {}",
                                    e, data
                                )))?;
                            }
                        }
                    }
                }
            }
        })
    }

    /// Non-streaming chat completion. Returns the full response text.
    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
    ) -> Result<String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let body = json!({
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": false,
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(MeuxError::Http)?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(MeuxError::Llm(format!("HTTP {}: {}", status, text)));
        }

        let completion: ChatCompletionResponse =
            response.json().await.map_err(MeuxError::Http)?;

        completion
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .ok_or_else(|| MeuxError::Llm("No content in response".to_string()))
    }
}

impl Default for OpenAiCompatClient {
    fn default() -> Self {
        Self::new()
    }
}
