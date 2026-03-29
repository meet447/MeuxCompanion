use std::sync::OnceLock;

use base64::Engine;
use reqwest::Client;
use serde_json::Value;

use super::VoiceInfo;
use crate::error::MeuxError;
use crate::Result;

const ENDPOINTS: &[&str] = &[
    "https://tiktok-tts.weilnet.workers.dev/api/generation",
    "https://tiktoktts.com/api/tiktok-tts",
];

const TEXT_BYTE_LIMIT: usize = 300;

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(Client::new)
}

/// Generate TTS audio for the given text, splitting into chunks if needed.
pub async fn generate(text: &str, voice: &str) -> Result<Vec<u8>> {
    let voice = if voice.is_empty() { "en_us_001" } else { voice };
    let chunks = split_text(text, TEXT_BYTE_LIMIT);
    let mut audio = Vec::new();

    for chunk in &chunks {
        let data = generate_chunk(chunk, voice).await?;
        audio.extend_from_slice(&data);
    }

    Ok(audio)
}

async fn generate_chunk(text: &str, voice: &str) -> Result<Vec<u8>> {
    let mut last_err = None;
    for endpoint in ENDPOINTS {
        match try_endpoint(endpoint, text, voice).await {
            Ok(data) => return Ok(data),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| MeuxError::Tts("All TikTok TTS endpoints failed".into())))
}

async fn try_endpoint(endpoint: &str, text: &str, voice: &str) -> Result<Vec<u8>> {
    let body = serde_json::json!({
        "text": text,
        "voice": voice,
    });

    let resp = client()
        .post(endpoint)
        .json(&body)
        .send()
        .await?
        .error_for_status()
        .map_err(|e| MeuxError::Tts(format!("TikTok TTS request failed: {e}")))?;

    let json: Value = resp.json().await?;

    let b64 = json
        .get("data")
        .or_else(|| json.get("audio"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| MeuxError::Tts("No audio data in TikTok TTS response".into()))?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| MeuxError::Tts(format!("Base64 decode error: {e}")))?;

    Ok(bytes)
}

/// Split text into chunks that fit within the byte limit, splitting on word boundaries.
pub fn split_text(text: &str, chunk_size: usize) -> Vec<String> {
    if text.len() <= chunk_size {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut remaining = text;

    while !remaining.is_empty() {
        if remaining.len() <= chunk_size {
            chunks.push(remaining.to_string());
            break;
        }

        // Find the last space within the chunk_size limit
        let split_at = remaining[..chunk_size]
            .rfind(' ')
            .map(|i| i + 1) // include the space in the first chunk
            .unwrap_or(chunk_size); // no space found, hard split

        let (chunk, rest) = remaining.split_at(split_at);
        chunks.push(chunk.trim().to_string());
        remaining = rest.trim_start();
    }

    chunks
}

pub fn list_voices() -> Vec<VoiceInfo> {
    [
        ("jp_001", "Japanese Female"),
        ("jp_006", "Japanese Male"),
        ("en_us_001", "English US Female"),
        ("en_us_006", "English US Male 1"),
        ("en_us_010", "English US Male 2"),
        ("en_uk_001", "English UK Male"),
        ("en_au_001", "English AU Female"),
        ("fr_001", "French Male"),
        ("de_001", "German Female"),
        ("kr_002", "Korean Male"),
        ("en_male_narration", "English Male Narration"),
        ("en_female_emotional", "English Female Emotional"),
    ]
    .into_iter()
    .map(|(id, name)| VoiceInfo {
        id: id.to_string(),
        name: name.to_string(),
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_text_short() {
        let text = "Hello world";
        let chunks = split_text(text, 300);
        assert_eq!(chunks, vec!["Hello world"]);
    }

    #[test]
    fn test_split_text_long() {
        let text = "word ".repeat(100);
        let text = text.trim();
        let chunks = split_text(text, 300);
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert!(chunk.len() <= 300);
        }
        // Verify all words are preserved
        let rejoined = chunks.join(" ");
        assert_eq!(rejoined, text);
    }
}
