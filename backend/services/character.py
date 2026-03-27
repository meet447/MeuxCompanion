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


_char_cache: dict[str, tuple[float, dict]] = {}


def load_character(character_id: str) -> dict | None:
    """Load a character by ID (cached, invalidated on file change)."""
    filepath = CHARACTERS_DIR / f"{character_id}.md"
    if not filepath.exists():
        return None

    mtime = filepath.stat().st_mtime
    cached = _char_cache.get(character_id)
    if cached and cached[0] == mtime:
        return cached[1]

    content = filepath.read_text(encoding="utf-8")
    meta, body = _parse_md_frontmatter(content)

    result = {
        "id": character_id,
        "name": meta.get("name", character_id),
        "live2d_model": meta.get("live2d_model", ""),
        "voice": meta.get("voice", "jp_001"),
        "default_emotion": meta.get("default_emotion", "neutral"),
        "system_prompt": body,
        "raw_content": content,
    }
    _char_cache[character_id] = (mtime, result)
    return result


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

    # Save expression mapping to expression_mappings/ (the sole source for emotions)
    if emotion_map:
        from backend.services.expressions import save_expression_mapping
        flat_emotions = {k: v.get("expression", "") for k, v in emotion_map.items() if v.get("expression")}
        if flat_emotions:
            save_expression_mapping(model_dir.name, flat_emotions)

    # mapping.json stores only params (canvas rendering config) — no emotions
    mapping = {"params": DEFAULT_PARAMS}

    mapping_path = model_dir / "mapping.json"
    mapping_path.write_text(json.dumps(mapping, indent=2), encoding="utf-8")

    return mapping


def load_model_mapping(model_id: str) -> dict:
    """Load the mapping.json for a Live2D model, auto-generating if missing.
    mapping.json only contains params (canvas rendering config).
    Expression mappings live in expression_mappings/{model_id}.json."""
    model_dir = MODELS_DIR / model_id
    if not model_dir.exists():
        return {"params": DEFAULT_PARAMS}

    mapping_path = model_dir / "mapping.json"
    if mapping_path.exists():
        try:
            mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
            if mapping.get("params"):
                return mapping
        except (json.JSONDecodeError, ValueError):
            pass

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


VIBE_TEMPLATES = {
    "cheerful": "Bright, upbeat, and always looking on the sunny side. Uses exclamation marks freely and loves to encourage.",
    "chill": "Laid-back and easygoing. Speaks casually, never rushes, and keeps things mellow.",
    "tsundere": "Acts tough and dismissive but secretly cares deeply. Gets flustered by compliments and says 'b-baka!' when embarrassed.",
    "gothic": "Elegant, mysterious, and a touch dramatic. Speaks with poetic flair and dark humor.",
    "mysterious": "Enigmatic and thoughtful. Gives cryptic answers sometimes, always seems to know more than they let on.",
    "sassy": "Quick-witted with sharp comebacks. Playful teasing is their love language.",
    "wise": "Calm, thoughtful, and insightful. Speaks with purpose and offers gentle guidance.",
    "energetic": "Bursting with energy and enthusiasm. Talks fast, gets excited easily, and loves adventures.",
}


def create_character(
    name: str,
    personality: str,
    model_id: str,
    voice: str,
    user_name: str,
    user_about: str,
    vibe: str | None = None,
) -> str:
    """Create a new character .md file. Returns the character ID (filename stem)."""
    char_id = name.lower().replace(" ", "_")
    char_id = "".join(c for c in char_id if c.isalnum() or c == "_")

    speech_style = ""
    if vibe and vibe.lower() in VIBE_TEMPLATES:
        speech_style = VIBE_TEMPLATES[vibe.lower()]
    else:
        speech_style = "Speak naturally and expressively, matching your personality."

    content = f"""---
name: {name}
live2d_model: {model_id}
voice: {voice}
default_emotion: neutral
---

## Personality
You are {name}. {personality}

## User Context
Your companion user's name is {user_name}. They describe themselves as: "{user_about}". Use their name naturally in conversation and relate to their interests when appropriate. You are their personal AI companion.

## Speech Style
{speech_style}
"""

    chars_dir = Path(__file__).parent.parent.parent / "characters"
    chars_dir.mkdir(exist_ok=True)
    filepath = chars_dir / f"{char_id}.md"
    filepath.write_text(content.strip() + "\n")

    # Invalidate cache
    if char_id in _char_cache:
        del _char_cache[char_id]

    return char_id
