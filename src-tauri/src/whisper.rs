use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use whisper_rs::{WhisperContext, WhisperContextParameters};

pub const WHISPER_MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin";

/// SHA-256 of `ggml-tiny.bin` from the official whisper.cpp Hugging Face repo.
pub const WHISPER_MODEL_SHA256: &str =
    "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21";

static WHISPER_CTX: RwLock<Option<Arc<WhisperContext>>> = RwLock::new(None);
static DOWNLOAD_IN_FLIGHT: std::sync::Mutex<bool> = std::sync::Mutex::new(false);

#[derive(Debug, Clone, Serialize)]
pub struct WhisperStatus {
    pub present: bool,
    pub loaded: bool,
    pub path: Option<String>,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WhisperDownloadProgress {
    pub received: u64,
    pub total: Option<u64>,
}

pub fn model_candidates(data_dir: &Path) -> Vec<PathBuf> {
    vec![
        data_dir.join("models/whisper/ggml-tiny.bin"),
        PathBuf::from("models/whisper/ggml-tiny.bin"),
        PathBuf::from("../models/whisper/ggml-tiny.bin"),
    ]
}

pub fn model_path(data_dir: &Path) -> PathBuf {
    data_dir.join("models/whisper/ggml-tiny.bin")
}

pub fn resolve_model_path(data_dir: &Path) -> Option<PathBuf> {
    model_candidates(data_dir).into_iter().find(|p| p.is_file())
}

#[cfg(test)]
pub fn sha256_hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
pub fn verify_sha256_bytes(data: &[u8], expected: &str) -> Result<(), String> {
    let actual = sha256_hex(data);
    if actual.eq_ignore_ascii_case(expected.trim()) {
        Ok(())
    } else {
        Err(format!(
            "SHA-256 mismatch: expected {expected}, got {actual}"
        ))
    }
}

pub fn verify_file_sha256(path: &Path, expected: &str) -> Result<(), String> {
    use std::io::Read;

    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open {} for verification: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if actual.eq_ignore_ascii_case(expected.trim()) {
        Ok(())
    } else {
        Err(format!(
            "SHA-256 mismatch for {}: expected {expected}, got {actual}",
            path.display()
        ))
    }
}

pub fn is_loaded() -> bool {
    WHISPER_CTX
        .read()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub fn get_ctx() -> Result<Arc<WhisperContext>, String> {
    WHISPER_CTX
        .read()
        .map_err(|_| "Whisper context lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| {
            "whisper_model_missing: On-device transcription needs the Whisper model. Download it in Settings.".into()
        })
}

fn set_ctx(ctx: Arc<WhisperContext>) {
    if let Ok(mut guard) = WHISPER_CTX.write() {
        *guard = Some(ctx);
    }
}

pub fn load_whisper_model(data_dir: &Path) -> Option<Arc<WhisperContext>> {
    if let Ok(guard) = WHISPER_CTX.read() {
        if let Some(ctx) = guard.clone() {
            return Some(ctx);
        }
    }

    let path = resolve_model_path(data_dir)?;
    let path_str = path.to_string_lossy().to_string();
    match WhisperContext::new_with_params(&path_str, WhisperContextParameters::default()) {
        Ok(ctx) => {
            let arc = Arc::new(ctx);
            set_ctx(arc.clone());
            println!("Whisper model loaded from: {path_str}");
            Some(arc)
        }
        Err(e) => {
            eprintln!("Failed to load whisper model from {path_str}: {e}");
            None
        }
    }
}

pub fn whisper_status(data_dir: &Path) -> WhisperStatus {
    let path = resolve_model_path(data_dir);
    let present = path.is_some();
    let size_bytes = path
        .as_ref()
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len());
    WhisperStatus {
        present,
        loaded: is_loaded(),
        path: path.map(|p| p.to_string_lossy().into_owned()),
        size_bytes,
    }
}

pub async fn download_whisper_model(app: &AppHandle, data_dir: &Path) -> Result<(), String> {
    {
        let mut in_flight = DOWNLOAD_IN_FLIGHT
            .lock()
            .map_err(|_| "Whisper download lock poisoned".to_string())?;
        if *in_flight {
            return Err("Whisper model download is already in progress.".into());
        }
        *in_flight = true;
    }

    let result = download_whisper_model_inner(app, data_dir).await;

    if let Ok(mut in_flight) = DOWNLOAD_IN_FLIGHT.lock() {
        *in_flight = false;
    }

    result
}

async fn download_whisper_model_inner(app: &AppHandle, data_dir: &Path) -> Result<(), String> {
    let dest = model_path(data_dir);
    if dest.is_file() {
        verify_file_sha256(&dest, WHISPER_MODEL_SHA256)?;
        load_whisper_model(data_dir);
        return Ok(());
    }

    let parent = dest
        .parent()
        .ok_or_else(|| "Invalid whisper model path".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;

    let part_path = dest.with_extension("bin.part");
    if part_path.exists() {
        let _ = std::fs::remove_file(&part_path);
    }

    let client = reqwest::Client::new();
    let response = client
        .get(WHISPER_MODEL_URL)
        .send()
        .await
        .map_err(|e| format!("Whisper model download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Whisper model download failed: HTTP {}",
            response.status()
        ));
    }

    let total = response.content_length();
    let mut received = 0u64;
    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", part_path.display()))?;

    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Whisper model download stream error: {e}"))?;
        received += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write {}: {e}", part_path.display()))?;
        let _ = app.emit(
            "whisper:download-progress",
            WhisperDownloadProgress { received, total },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush {}: {e}", part_path.display()))?;

    verify_file_sha256(&part_path, WHISPER_MODEL_SHA256)?;

    if dest.exists() {
        std::fs::remove_file(&dest)
            .map_err(|e| format!("Failed to replace existing model: {e}"))?;
    }
    std::fs::rename(&part_path, &dest)
        .map_err(|e| format!("Failed to finalize whisper model download: {e}"))?;

    load_whisper_model(data_dir)
        .ok_or_else(|| "Whisper model downloaded but failed to load.".to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_hex_matches_known_digest() {
        assert_eq!(
            sha256_hex(b"test"),
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        );
    }

    #[test]
    fn verify_sha256_bytes_accepts_matching_digest() {
        verify_sha256_bytes(
            b"test",
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        )
        .unwrap();
    }

    #[test]
    fn verify_sha256_bytes_rejects_mismatch() {
        let err = verify_sha256_bytes(b"test", "deadbeef").unwrap_err();
        assert!(err.contains("SHA-256 mismatch"));
    }
}
