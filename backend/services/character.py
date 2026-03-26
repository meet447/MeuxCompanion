import os
import re
import yaml
from pathlib import Path

CHARACTERS_DIR = Path(__file__).parent.parent.parent / "characters"
MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "live2d"


def _parse_md_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from markdown content."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", content, re.DOTALL)
    if match:
        frontmatter = yaml.safe_load(match.group(1)) or {}
        body = match.group(2).strip()
        return frontmatter, body
    return {}, content.strip()


def list_characters() -> list[dict]:
    """List all available characters."""
    characters = []
    if not CHARACTERS_DIR.exists():
        return characters

    for md_file in sorted(CHARACTERS_DIR.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        meta, _ = _parse_md_frontmatter(content)
        characters.append({
            "id": md_file.stem,
            "name": meta.get("name", md_file.stem),
            "live2d_model": meta.get("live2d_model", ""),
            "voice": meta.get("voice", "jp_001"),
            "default_emotion": meta.get("default_emotion", "neutral"),
        })
    return characters


def load_character(character_id: str) -> dict | None:
    """Load a character by ID (filename without extension)."""
    filepath = CHARACTERS_DIR / f"{character_id}.md"
    if not filepath.exists():
        return None

    content = filepath.read_text(encoding="utf-8")
    meta, body = _parse_md_frontmatter(content)

    return {
        "id": character_id,
        "name": meta.get("name", character_id),
        "live2d_model": meta.get("live2d_model", ""),
        "voice": meta.get("voice", "jp_001"),
        "default_emotion": meta.get("default_emotion", "neutral"),
        "system_prompt": body,
        "raw_content": content,
    }


def build_system_prompt(character: dict) -> str:
    """Build the full system prompt for the LLM."""
    name = character["name"]
    body = character["system_prompt"]
    return (
        f"You are {name}. Stay in character at all times.\n"
        f"Every response must start with an emotion tag in this format: [emotion: <emotion>]\n"
        f"Valid emotions: neutral, happy, sad, angry, surprised, embarrassed, thinking, excited\n\n"
        f"{body}"
    )


def list_live2d_models() -> list[dict]:
    """List available Live2D models by scanning for .model3.json files."""
    models = []
    if not MODELS_DIR.exists():
        return models

    for model_dir in sorted(MODELS_DIR.iterdir()):
        if not model_dir.is_dir():
            continue
        model_files = list(model_dir.glob("*.model3.json"))
        if model_files:
            models.append({
                "id": model_dir.name,
                "model_file": model_files[0].name,
                "path": f"/static/live2d/{model_dir.name}/{model_files[0].name}",
            })
    return models
