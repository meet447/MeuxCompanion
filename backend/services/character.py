import json
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


def get_model_expressions(model_id: str) -> list[str]:
    """Get available expression names from a Live2D model."""
    if not model_id:
        return []
    model_dir = MODELS_DIR / model_id
    if not model_dir.exists():
        return []

    model3_path = _find_model3_json(model_dir)
    if not model3_path:
        return []

    model_data = json.loads(model3_path.read_text(encoding="utf-8"))
    expressions = model_data.get("FileReferences", {}).get("Expressions", [])
    return [e.get("Name", "") for e in expressions if e.get("Name")]


DEFAULT_EXPRESSIONS = ["neutral", "happy", "sad", "angry", "surprised", "embarrassed", "thinking", "excited"]


def build_system_prompt(character: dict, expressions: list[str] | None = None) -> str:
    """Build the full system prompt for the LLM."""
    name = character["name"]
    body = character["system_prompt"]

    available = expressions if expressions else DEFAULT_EXPRESSIONS
    expressions_str = ", ".join(available)

    return (
        f"You are {name}. Stay in character at all times.\n"
        f"Every response must start with an expression tag in this format: [expression: <name>]\n"
        f"Available expressions: {expressions_str}\n"
        f"Pick the expression that best matches the emotion of your response. "
        f"If none fits well, use the first one as the default.\n\n"
        f"{body}"
    )


DEFAULT_PARAMS = {
    "mouthOpen": "ParamMouthOpenY",
    "mouthForm": "ParamMouthForm",
    "eyeLeftOpen": "ParamEyeLOpen",
    "eyeRightOpen": "ParamEyeROpen",
    "breath": "ParamBreath",
    "bodyAngleX": "ParamBodyAngleX",
}

# Common expression name patterns mapped to our standard emotions
EXPRESSION_GUESSES = {
    "neutral": ["neutral", "normal", "default", "idle"],
    "happy": ["happy", "smile", "joy", "glad", "fun"],
    "sad": ["sad", "cry", "unhappy", "sorrow", "down", "伤心"],
    "angry": ["angry", "anger", "mad", "rage", "furious", "生气"],
    "surprised": ["surprise", "surprised", "shock", "shocked", "wow", "懵"],
    "embarrassed": ["embarrass", "shy", "blush", "fluster"],
    "thinking": ["think", "thinking", "ponder", "hmm", "wonder"],
    "excited": ["excite", "excited", "hype", "energetic", "cheer"],
}


def _find_model3_json(model_dir: Path) -> Path | None:
    """Find .model3.json, checking the directory and one level of subdirectories."""
    model_files = list(model_dir.glob("*.model3.json"))
    if model_files:
        return model_files[0]
    # Check subdirectories
    for subdir in model_dir.iterdir():
        if subdir.is_dir() and not subdir.name.startswith("."):
            model_files = list(subdir.glob("*.model3.json"))
            if model_files:
                return model_files[0]
    return None


def _auto_generate_mapping(model_dir: Path) -> dict:
    """Auto-generate a mapping.json by scanning the model's expressions."""
    model3_path = _find_model3_json(model_dir)
    if not model3_path:
        return {"emotions": {}, "params": DEFAULT_PARAMS}

    actual_dir = model3_path.parent
    model_data = json.loads(model3_path.read_text(encoding="utf-8"))
    expressions = model_data.get("FileReferences", {}).get("Expressions", [])
    motions = model_data.get("FileReferences", {}).get("Motions", {})

    # Auto-patch: find loose .exp3.json files and add them to model3.json
    # Only if the model has NO expressions at all (don't override curated lists)
    patched = False
    if not expressions:
        loose_exps = list(actual_dir.glob("*.exp3.json"))
        for exp_file in loose_exps:
            name = exp_file.stem.replace(".exp3", "")
            expressions.append({"Name": name, "File": exp_file.name})
            patched = True

    # Auto-patch: fix empty LipSync group if ParamMouthOpenY exists in the model
    groups = model_data.get("Groups", [])
    for g in groups:
        if g.get("Name") == "LipSync" and not g.get("Ids"):
            # Check if the model has a CDI file listing ParamMouthOpenY
            cdi_files = list(actual_dir.glob("*.cdi3.json"))
            if cdi_files:
                cdi_data = json.loads(cdi_files[0].read_text(encoding="utf-8"))
                param_ids = [p["Id"] for p in cdi_data.get("Parameters", [])]
                if "ParamMouthOpenY" in param_ids:
                    g["Ids"] = ["ParamMouthOpenY"]
                    patched = True

    if patched:
        model_data.setdefault("FileReferences", {})["Expressions"] = expressions
        model_data["Groups"] = groups
        model3_path.write_text(
            json.dumps(model_data, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    # Collect expression names
    available_names = [e.get("Name", "") for e in expressions]

    # Try to match expression names to our standard emotions
    emotion_map = {}

    for emotion, keywords in EXPRESSION_GUESSES.items():
        for name in available_names:
            name_lower = name.lower()
            if any(kw in name_lower for kw in keywords):
                emotion_map[emotion] = {"expression": name}
                break

    # If no keyword matches found, assign by index
    if not emotion_map and available_names:
        standard_emotions = list(EXPRESSION_GUESSES.keys())
        for i, name in enumerate(available_names):
            if i < len(standard_emotions):
                emotion_map[standard_emotions[i]] = {"expression": name}

    # Ensure neutral exists
    if "neutral" not in emotion_map and available_names:
        emotion_map["neutral"] = {"expression": available_names[0]}

    # Fill ALL 8 standard emotions — map missing ones to closest available
    if available_names and emotion_map:
        # Define fallback chains: if emotion X is missing, try these in order
        fallbacks = {
            "neutral": ["happy", "thinking"],
            "happy": ["excited", "neutral"],
            "sad": ["embarrassed", "neutral"],
            "angry": ["excited", "neutral"],
            "surprised": ["excited", "happy", "neutral"],
            "embarrassed": ["sad", "happy", "neutral"],
            "thinking": ["neutral", "sad"],
            "excited": ["happy", "surprised", "angry", "neutral"],
        }
        all_emotions = list(EXPRESSION_GUESSES.keys())
        for emo in all_emotions:
            if emo not in emotion_map:
                # Try fallback chain
                filled = False
                for fallback in fallbacks.get(emo, []):
                    if fallback in emotion_map:
                        emotion_map[emo] = {"expression": emotion_map[fallback]["expression"]}
                        filled = True
                        break
                if not filled:
                    # Last resort: use first available expression
                    emotion_map[emo] = {"expression": available_names[0]}

    # Add motions to expressive emotions if TapBody exists
    if "TapBody" in motions:
        tap_count = len(motions["TapBody"])
        motion_emotions = ["excited", "surprised", "angry", "happy", "embarrassed"]
        for i, emo in enumerate(motion_emotions):
            if emo in emotion_map and i < tap_count:
                emotion_map[emo]["motion"] = {"group": "TapBody", "index": i}

    mapping = {"emotions": emotion_map, "params": DEFAULT_PARAMS}

    # Save the auto-generated mapping for future use
    mapping_path = model_dir / "mapping.json"
    mapping_path.write_text(json.dumps(mapping, indent=2), encoding="utf-8")

    return mapping


def load_model_mapping(model_id: str) -> dict:
    """Load the mapping.json for a Live2D model, auto-generating if missing."""
    model_dir = MODELS_DIR / model_id
    if not model_dir.exists():
        return {"emotions": {}, "params": DEFAULT_PARAMS}

    # Check for mapping.json in the model dir
    mapping_path = model_dir / "mapping.json"
    if mapping_path.exists():
        mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
        # If mapping has no emotions, try regenerating (may have been empty placeholder)
        if mapping.get("emotions"):
            return mapping

    return _auto_generate_mapping(model_dir)


def list_live2d_models() -> list[dict]:
    """List available Live2D models by scanning for .model3.json files."""
    models = []
    if not MODELS_DIR.exists():
        return models

    for model_dir in sorted(MODELS_DIR.iterdir()):
        if not model_dir.is_dir():
            continue
        model3_path = _find_model3_json(model_dir)
        if model3_path:
            # Build the relative path from MODELS_DIR
            rel_path = model3_path.relative_to(MODELS_DIR)
            mapping = load_model_mapping(model_dir.name)
            models.append({
                "id": model_dir.name,
                "model_file": model3_path.name,
                "path": f"/static/live2d/{rel_path}",
                "mapping": mapping,
            })
    return models
