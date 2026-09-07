//! Curated model marketplace helpers: URL allowlisting and local VRM install.

use crate::character::types::ModelInfo;
use crate::character::{list_models, slugify};
use crate::ids::validate_id;
use crate::{MeuxeError, Result};
use std::path::Path;

/// Hosts we are willing to download avatar files from.
const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &[
    "arweave.net",
    "www.arweave.net",
    "raw.githubusercontent.com",
    "github.com",
    "objects.githubusercontent.com",
    "cdn.jsdelivr.net",
    "opensourceavatars.com",
    "www.opensourceavatars.com",
];

const MAX_VRM_BYTES: usize = 80 * 1024 * 1024; // 80 MiB

/// Reject non-HTTPS or non-allowlisted download URLs.
pub fn validate_marketplace_download_url(url: &str) -> Result<()> {
    let url = url.trim();
    if url.is_empty() {
        return Err(MeuxeError::InvalidConfig("Download URL is empty".into()));
    }

    let parsed = reqwest::Url::parse(url)
        .map_err(|e| MeuxeError::InvalidConfig(format!("Invalid download URL: {e}")))?;

    if parsed.scheme() != "https" {
        return Err(MeuxeError::InvalidConfig(
            "Marketplace downloads must use HTTPS".into(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| MeuxeError::InvalidConfig("Download URL is missing a host".into()))?;

    let allowed = ALLOWED_DOWNLOAD_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed));
    if !allowed {
        return Err(MeuxeError::InvalidConfig(format!(
            "Download host is not allowlisted: {host}"
        )));
    }

    Ok(())
}

/// Install a VRM model from raw bytes into `{data_dir}/models/vrm/{model_id}/model.vrm`.
///
/// If the model id is already present, returns the existing listing without rewriting.
pub fn install_vrm_model(data_dir: &Path, model_id: &str, bytes: &[u8]) -> Result<ModelInfo> {
    let model_id = validate_id(model_id)?;
    if bytes.is_empty() {
        return Err(MeuxeError::InvalidConfig(
            "Downloaded model is empty".into(),
        ));
    }
    if bytes.len() > MAX_VRM_BYTES {
        return Err(MeuxeError::InvalidConfig(format!(
            "Model is too large ({} bytes; max {MAX_VRM_BYTES})",
            bytes.len()
        )));
    }

    let models_root = data_dir.join("models").join("vrm");
    std::fs::create_dir_all(&models_root)?;

    let target_dir = models_root.join(model_id);
    let target_file = target_dir.join("model.vrm");

    if target_file.is_file() {
        return find_model(data_dir, model_id);
    }

    std::fs::create_dir_all(&target_dir)?;
    std::fs::write(&target_file, bytes)?;

    find_model(data_dir, model_id)
}

/// Slug used when a marketplace listing omits a stable id.
pub fn marketplace_model_id(name: &str) -> String {
    let slug = slugify(name);
    if slug.is_empty() {
        "marketplace_model".into()
    } else {
        slug
    }
}

fn find_model(data_dir: &Path, model_id: &str) -> Result<ModelInfo> {
    list_models(data_dir)?
        .into_iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| {
            MeuxeError::InvalidConfig(format!(
                "Installed model '{model_id}' but could not index it"
            ))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn rejects_http_and_unknown_hosts() {
        assert!(validate_marketplace_download_url("http://arweave.net/x").is_err());
        assert!(validate_marketplace_download_url("https://evil.example/x.vrm").is_err());
        assert!(validate_marketplace_download_url("https://arweave.net/abc").is_ok());
        assert!(validate_marketplace_download_url(
            "https://raw.githubusercontent.com/org/repo/main/model.vrm"
        )
        .is_ok());
    }

    #[test]
    fn installs_vrm_bytes_and_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let bytes = b"vrm-binary-placeholder";
        let first = install_vrm_model(tmp.path(), "osa-olivia", bytes).unwrap();
        assert_eq!(first.id, "osa-olivia");
        assert_eq!(first.model_type, "vrm");
        assert!(first.path.contains("osa-olivia"));

        let second = install_vrm_model(tmp.path(), "osa-olivia", b"different").unwrap();
        assert_eq!(second.id, first.id);
        // Original bytes kept on second install
        let on_disk = std::fs::read(tmp.path().join("models/vrm/osa-olivia/model.vrm")).unwrap();
        assert_eq!(on_disk, bytes);
    }

    #[test]
    fn rejects_invalid_ids() {
        let tmp = TempDir::new().unwrap();
        assert!(install_vrm_model(tmp.path(), "../x", b"abc").is_err());
    }
}
