import json
import os
import re
import yaml
from pathlib import Path

CHARACTERS_DIR = Path(__file__).parent.parent.parent / "characters"
MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "live2d"
VRM_MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "vrm"

# Standard VRM blend shape expressions
VRM_EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised"]


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


def _detect_model_type(model_id: str) -> str | None:
    """Detect if a model_id refers to a Live2D or VRM model."""
    # Check Live2D first
    live2d_dir = MODELS_DIR / model_id
    if live2d_dir.exists() and _find_model3_json(live2d_dir):
        return "live2d"
    # Check VRM
    vrm_path = VRM_MODELS_DIR / f"{model_id}.vrm"
    if vrm_path.exists():
        return "vrm"
    # Check VRM in subfolder
    vrm_dir = VRM_MODELS_DIR / model_id
    if vrm_dir.exists():
        vrm_files = list(vrm_dir.glob("*.vrm"))
        if vrm_files:
            return "vrm"
    return None


def _are_names_readable(names: list[str]) -> bool:
    """Check if expression names are human-readable."""
    if not names:
        return False
    for name in names:
        if len(name) <= 2 and name.isascii():
            return False
    return True


def get_model_expressions(model_id: str) -> tuple[list[str], dict[str, str] | None]:
    """Get expression names for the LLM and an optional mapping to actual IDs.

    Returns (llm_names, mapping_dict).
    - llm_names: what the LLM sees and picks from
    - mapping_dict: if not None, maps llm_name -> actual expression ID for the frontend
    """
    if not model_id:
        return DEFAULT_EXPRESSIONS, None

    model_type = _detect_model_type(model_id)

    if model_type == "vrm":
        return VRM_EXPRESSIONS, None

    if model_type == "live2d":
        model_dir = MODELS_DIR / model_id
        model3_path = _find_model3_json(model_dir)
        if not model3_path:
            return DEFAULT_EXPRESSIONS, None
        try:
            model_data = json.loads(model3_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, ValueError):
            return DEFAULT_EXPRESSIONS, None
        expressions = model_data.get("FileReferences", {}).get("Expressions", [])
        names = [e.get("Name", "") for e in expressions if e.get("Name")]

        if _are_names_readable(names):
            # Names like 圈圈眼, happy, F01 — LLM can use directly
            return names, None

        # Names like 0, y, 7 — LLM uses readable names, we map back
        mapping = load_model_mapping(model_dir.name)
        emotion_map = mapping.get("emotions", {})
        # Build reverse map: readable name -> actual expression ID
        reverse = {}
        for emo_name, config in emotion_map.items():
            if config.get("expression"):
                reverse[emo_name] = config["expression"]

        if reverse:
            return list(reverse.keys()), reverse

        return DEFAULT_EXPRESSIONS, None

    return DEFAULT_EXPRESSIONS, None


DEFAULT_EXPRESSIONS = ["neutral", "happy", "sad", "angry", "surprised", "embarrassed", "thinking", "excited"]


def build_system_prompt(character: dict, expressions: list[str] | None = None) -> str:
    """Build the full system prompt for the LLM."""
    name = character["name"]
    body = character["system_prompt"]

    available = expressions if expressions else DEFAULT_EXPRESSIONS
    expressions_str = ", ".join(available)

    return (
        f"You are {name}. Stay in character at all times.\n\n"
        f"EXPRESSION RULES:\n"
        f"- Insert <<name>> tags to change your facial expression as you speak.\n"
        f"- Available: {expressions_str}\n"
        f"- Start EVERY response with an expression tag.\n"
        f"- Change expression multiple times to match the emotion of each part.\n"
        f"- Tags are opening only. NEVER use closing tags like <</name>>.\n"
        f"- Use ONLY the exact names listed above.\n\n"
        f"Example response:\n"
        f"<<happy>> Hey, that's awesome! <<surprised>> Wait, you did that all by yourself? <<happy>> I'm so proud of you!\n\n"
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
    try:
        model_data = json.loads(model3_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, ValueError):
        return {"emotions": {}, "params": DEFAULT_PARAMS}
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


def list_all_models() -> list[dict]:
    """List all available models (Live2D + VRM)."""
    models = []

    # Scan Live2D models
    if MODELS_DIR.exists():
        for model_dir in sorted(MODELS_DIR.iterdir()):
            if not model_dir.is_dir():
                continue
            model3_path = _find_model3_json(model_dir)
            if model3_path:
                rel_path = model3_path.relative_to(MODELS_DIR)
                mapping = load_model_mapping(model_dir.name)
                models.append({
                    "id": model_dir.name,
                    "type": "live2d",
                    "model_file": model3_path.name,
                    "path": f"/static/live2d/{rel_path}",
                    "mapping": mapping,
                })

    # Scan VRM models
    if VRM_MODELS_DIR.exists():
        # Check for .vrm files directly in the folder
        for vrm_file in sorted(VRM_MODELS_DIR.glob("*.vrm")):
            model_id = vrm_file.stem
            models.append({
                "id": model_id,
                "type": "vrm",
                "model_file": vrm_file.name,
                "path": f"/static/vrm/{vrm_file.name}",
                "mapping": None,
            })
        # Check for .vrm files in subfolders
        for subdir in sorted(VRM_MODELS_DIR.iterdir()):
            if not subdir.is_dir():
                continue
            vrm_files = list(subdir.glob("*.vrm"))
            if vrm_files:
                vrm_file = vrm_files[0]
                # Scan for animation files
                animations = []
                anim_dir = subdir / "animations"
                if anim_dir.exists():
                    for anim_file in sorted(anim_dir.glob("*.fbx")):
                        animations.append({
                            "name": anim_file.stem,
                            "path": f"/static/vrm/{subdir.name}/animations/{anim_file.name}",
                        })
                models.append({
                    "id": subdir.name,
                    "type": "vrm",
                    "model_file": vrm_file.name,
                    "path": f"/static/vrm/{subdir.name}/{vrm_file.name}",
                    "mapping": None,
                    "animations": animations,
                })

    return models
