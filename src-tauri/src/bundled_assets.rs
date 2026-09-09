use std::fs;
use std::path::Path;

/// Recursively copy a directory tree from `source` to `target`.
pub fn copy_dir_recursive(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::create_dir_all(target)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let destination = target.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &destination)?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&path, &destination)?;
        }
    }

    Ok(())
}

/// Copy bundled model assets from the app resource directory into app data when missing.
/// Never overwrites existing files or directories.
pub fn seed_bundled_models(resource_dir: &Path, data_dir: &Path) -> std::io::Result<()> {
    seed_dir_if_missing(
        &resource_dir.join("models/live2d/haru"),
        &data_dir.join("models/live2d/haru"),
    )?;
    seed_dir_if_missing(
        &resource_dir.join("models/vrm/utsuwa"),
        &data_dir.join("models/vrm/utsuwa"),
    )?;
    seed_dir_if_missing(
        &resource_dir.join("models/animations/vrm"),
        &data_dir.join("models/animations/vrm"),
    )?;
    seed_expression_mappings(
        &resource_dir.join("models/expression_mappings"),
        &data_dir.join("models/expression_mappings"),
    )?;
    Ok(())
}

fn seed_dir_if_missing(source: &Path, target: &Path) -> std::io::Result<()> {
    if !source.is_dir() {
        return Ok(());
    }
    if target.exists() {
        return Ok(());
    }
    copy_dir_recursive(source, target)
}

fn seed_expression_mappings(source_dir: &Path, target_dir: &Path) -> std::io::Result<()> {
    if !source_dir.is_dir() {
        return Ok(());
    }

    fs::create_dir_all(target_dir)?;

    for entry in fs::read_dir(source_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        if extension != "json" {
            continue;
        }

        let destination = target_dir.join(entry.file_name());
        if destination.exists() {
            continue;
        }
        fs::copy(&path, &destination)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_json(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn seed_bundled_models_copies_when_missing() {
        let resource = TempDir::new().unwrap();
        let data = TempDir::new().unwrap();

        let haru_source = resource.path().join("models/live2d/haru");
        fs::create_dir_all(haru_source.join("expressions")).unwrap();
        fs::write(haru_source.join("Haru.model3.json"), b"{}").unwrap();
        fs::write(haru_source.join("expressions/F01.exp3.json"), b"{}").unwrap();

        let shared = resource.path().join("models/animations/vrm");
        fs::create_dir_all(&shared).unwrap();
        fs::write(shared.join("idle.vrma"), b"default idle").unwrap();
        fs::write(shared.join("LICENSE"), b"MIT License").unwrap();

        let utsuwa_source = resource.path().join("models/vrm/utsuwa");
        fs::create_dir_all(&utsuwa_source).unwrap();
        fs::write(utsuwa_source.join("utsuwa.vrm"), b"vrm").unwrap();

        write_json(
            &resource.path().join("models/expression_mappings/haru.json"),
            r#"{"happy":"F05"}"#,
        );
        write_json(
            &resource
                .path()
                .join("models/expression_mappings/utsuwa.json"),
            r#"{"happy":"happy"}"#,
        );

        seed_bundled_models(resource.path(), data.path()).unwrap();

        assert!(data
            .path()
            .join("models/live2d/haru/Haru.model3.json")
            .is_file());
        assert!(data
            .path()
            .join("models/live2d/haru/expressions/F01.exp3.json")
            .is_file());
        assert!(data.path().join("models/vrm/utsuwa/utsuwa.vrm").is_file());
        assert!(data
            .path()
            .join("models/animations/vrm/idle.vrma")
            .is_file());
        assert!(data.path().join("models/animations/vrm/LICENSE").is_file());
        assert!(data
            .path()
            .join("models/expression_mappings/haru.json")
            .is_file());
        assert!(data
            .path()
            .join("models/expression_mappings/utsuwa.json")
            .is_file());
    }

    #[test]
    fn seed_bundled_models_skips_when_present() {
        let resource = TempDir::new().unwrap();
        let data = TempDir::new().unwrap();

        let haru_source = resource.path().join("models/live2d/haru");
        fs::create_dir_all(&haru_source).unwrap();
        fs::write(haru_source.join("Haru.model3.json"), b"from-resource").unwrap();

        let haru_target = data.path().join("models/live2d/haru");
        fs::create_dir_all(&haru_target).unwrap();
        fs::write(haru_target.join("Haru.model3.json"), b"existing").unwrap();

        seed_bundled_models(resource.path(), data.path()).unwrap();

        let contents = fs::read_to_string(haru_target.join("Haru.model3.json")).unwrap();
        assert_eq!(contents, "existing");
    }

    #[test]
    fn seed_bundled_models_preserves_user_modified_haru_json() {
        let resource = TempDir::new().unwrap();
        let data = TempDir::new().unwrap();

        write_json(
            &resource.path().join("models/expression_mappings/haru.json"),
            r#"{"happy":"F05"}"#,
        );

        let user_mapping = data.path().join("models/expression_mappings/haru.json");
        write_json(&user_mapping, r#"{"happy":"USER_CUSTOM"}"#);

        seed_bundled_models(resource.path(), data.path()).unwrap();

        let contents = fs::read_to_string(user_mapping).unwrap();
        assert!(contents.contains("USER_CUSTOM"));
        assert!(!contents.contains("F05"));
    }
}
