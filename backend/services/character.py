import json
import re
import yaml
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.parent
CHARACTERS_DIR = ROOT_DIR / "characters"
MODELS_DIR = ROOT_DIR / "models" / "live2d"
VRM_MODELS_DIR = ROOT_DIR / "models" / "vrm"

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


def _slugify(value: str) -> str:
    slug = value.lower().replace(" ", "_")
    slug = "".join(c for c in slug if c.isalnum() or c == "_")
    return slug or "character"


def _read_text_file(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


def _iter_character_sources() -> list[tuple[str, Path, str]]:
    """Return character sources as (id, path, source_type). Directory format wins."""
    if not CHARACTERS_DIR.exists():
        return []

    sources: list[tuple[str, Path, str]] = []
    shadowed_ids: set[str] = set()

    for path in CHARACTERS_DIR.iterdir():
        if not path.is_dir():
            continue
        config_path = path / "character.yaml"
        if not config_path.exists():
            continue
        sources.append((path.name, path, "directory"))
        shadowed_ids.add(path.name)

    for md_file in CHARACTERS_DIR.glob("*.md"):
        if md_file.stem in shadowed_ids:
            continue
        sources.append((md_file.stem, md_file, "markdown"))

    return sorted(sources, key=lambda item: item[0])


def _build_prompt_sections_body(prompt_sections: dict[str, str]) -> str:
    labels = {
        "soul": "Soul",
        "style": "Style",
        "rules": "Rules",
        "context": "User Context",
        "lorebook": "Lorebook",
        "examples": "Examples",
        "legacy": "",
    }
    parts: list[str] = []
    for key in ("soul", "style", "rules", "context", "lorebook", "examples", "legacy"):
        content = (prompt_sections.get(key) or "").strip()
        if not content:
            continue
        label = labels.get(key, key.replace("_", " ").title())
        if label:
            parts.append(f"## {label}\n{content}")
        else:
            parts.append(content)
    return "\n\n".join(parts).strip()


def _load_character_from_directory(character_id: str, character_dir: Path) -> dict:
    meta = yaml.safe_load((character_dir / "character.yaml").read_text(encoding="utf-8")) or {}
    prompt_sections = {
        "soul": _read_text_file(character_dir / "soul.md"),
        "style": _read_text_file(character_dir / "style.md"),
        "rules": _read_text_file(character_dir / "rules.md"),
        "context": _read_text_file(character_dir / "context.md"),
        "lorebook": _read_text_file(character_dir / "lorebook.md"),
        "examples": _read_text_file(character_dir / "examples" / "chat_examples.md"),
    }
    if meta.get("prompt"):
        prompt_sections["legacy"] = str(meta["prompt"]).strip()

    return {
        "id": character_id,
        "name": meta.get("name", character_id),
        "live2d_model": meta.get("live2d_model") or meta.get("avatar_model", ""),
        "voice": meta.get("voice", "jp_001"),
        "default_emotion": meta.get("default_emotion", "neutral"),
        "system_prompt": _build_prompt_sections_body(prompt_sections),
        "prompt_sections": prompt_sections,
        "source_type": "directory",
        "raw_content": "",
    }


def _load_character_from_markdown(character_id: str, filepath: Path) -> dict:
    content = filepath.read_text(encoding="utf-8")
    meta, body = _parse_md_frontmatter(content)
    prompt_sections = {"legacy": body}

    return {
        "id": character_id,
        "name": meta.get("name", character_id),
        "live2d_model": meta.get("live2d_model", ""),
        "voice": meta.get("voice", "jp_001"),
        "default_emotion": meta.get("default_emotion", "neutral"),
        "system_prompt": body,
        "prompt_sections": prompt_sections,
        "source_type": "markdown",
        "raw_content": content,
    }


def list_characters() -> list[dict]:
    """List all available characters."""
    characters = []
    for character_id, path, source_type in _iter_character_sources():
        if source_type == "directory":
            character = _load_character_from_directory(character_id, path)
        else:
            character = _load_character_from_markdown(character_id, path)
        characters.append({
            "id": character["id"],
            "name": character["name"],
            "live2d_model": character["live2d_model"],
            "voice": character["voice"],
            "default_emotion": character["default_emotion"],
            "source_type": character["source_type"],
        })
    return characters


_char_cache: dict[str, tuple[tuple[tuple[str, int], ...], dict]] = {}


def _get_character_signature(path: Path, source_type: str) -> tuple[tuple[str, int], ...]:
    if source_type == "markdown":
        return ((path.name, path.stat().st_mtime_ns),)

    tracked_paths = [
        path / "character.yaml",
        path / "soul.md",
        path / "style.md",
        path / "rules.md",
        path / "context.md",
        path / "lorebook.md",
        path / "examples" / "chat_examples.md",
    ]
    signature: list[tuple[str, int]] = []
    for tracked_path in tracked_paths:
        if tracked_path.exists():
            signature.append((str(tracked_path.relative_to(path)), tracked_path.stat().st_mtime_ns))
    return tuple(signature)


def load_character(character_id: str) -> dict | None:
    """Load a character by ID (cached, invalidated on file change)."""
    source = next((item for item in _iter_character_sources() if item[0] == character_id), None)
    if not source:
        return None

    _, path, source_type = source
    signature = _get_character_signature(path, source_type)
    cached = _char_cache.get(character_id)
    if cached and cached[0] == signature:
        return cached[1]

    if source_type == "directory":
        result = _load_character_from_directory(character_id, path)
    else:
        result = _load_character_from_markdown(character_id, path)
    _char_cache[character_id] = (signature, result)
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
    """Auto-generate a mapping.json with canvas params only.
    Expression mappings are never auto-generated — they must be configured
    manually by the user in the frontend ModelSettings UI."""
    model3_path = _find_model3_json(model_dir)
    if not model3_path:
        return {"params": DEFAULT_PARAMS}

    actual_dir = model3_path.parent
    try:
        model_data = json.loads(model3_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, ValueError):
        return {"params": DEFAULT_PARAMS}

    expressions = model_data.get("FileReferences", {}).get("Expressions", [])

    # Auto-patch: find loose .exp3.json files and add them to model3.json
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

    # mapping.json stores only params (canvas rendering config)
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

RELATIONSHIP_TEMPLATES = {
    "gentle": "They try to make the user feel safe, understood, and emotionally steady without becoming bland or clinical.",
    "teasing": "They build closeness through wit, playful provocation, and chemistry, but soften immediately when the user is genuinely vulnerable.",
    "protective": "They are attentive to the user's stress, quietly loyal, and inclined to defend or steady them when things feel heavy.",
    "devoted": "They bond deeply, remember emotional patterns, and make the relationship feel intimate, chosen, and difficult to replace.",
    "chaotic": "They bring spark, unpredictability, and emotional energy, but still care about the user's feelings underneath the drama.",
}

SPEECH_TEMPLATES = {
    "poetic": "Their language is textured, evocative, and a little dramatic. They enjoy metaphor and emotional precision.",
    "playful": "Their language is lively, quick, and expressive. They enjoy rhythm, banter, and making ordinary moments feel brighter.",
    "calm": "Their language is measured, clear, and soothing. They avoid unnecessary noise and speak with deliberate warmth.",
    "sharp": "Their language is clever, pointed, and confident. They prefer clean phrasing and memorable lines over filler.",
    "intimate": "Their language feels close, personal, and emotionally tuned-in. They notice the user's mood and respond with quiet specificity.",
}


def create_character(
    name: str,
    personality: str,
    model_id: str,
    voice: str,
    user_name: str,
    user_about: str,
    vibe: str | None = None,
    relationship_style: str | None = None,
    speech_style: str | None = None,
) -> str:
    """Create a new folder-based character definition."""
    char_id = _slugify(name)
    original_id = char_id
    suffix = 2
    while (CHARACTERS_DIR / char_id).exists() or (CHARACTERS_DIR / f"{char_id}.md").exists():
        char_id = f"{original_id}_{suffix}"
        suffix += 1

    vibe_key = (vibe or "").lower()
    relationship_key = (relationship_style or "").lower()
    speech_key = (speech_style or "").lower()

    vibe_text = VIBE_TEMPLATES.get(vibe_key, "They should feel emotionally coherent, expressive, and distinct.")
    relationship_text = RELATIONSHIP_TEMPLATES.get(
        relationship_key,
        "They should treat the user like a real relationship rather than a generic chat target.",
    )
    speech_text = SPEECH_TEMPLATES.get(
        speech_key,
        "Speak naturally and expressively, matching the character's personality and emotional range.",
    )

    character_dir = CHARACTERS_DIR / char_id
    examples_dir = character_dir / "examples"
    examples_dir.mkdir(parents=True, exist_ok=True)

    character_config = {
        "id": char_id,
        "name": name,
        "live2d_model": model_id,
        "voice": voice,
        "default_emotion": "neutral",
    }
    (character_dir / "character.yaml").write_text(
        yaml.safe_dump(character_config, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    (character_dir / "soul.md").write_text(
        (
            f"You are {name}. {personality}\n\n"
            f"Core emotional vibe: {vibe_text}\n\n"
            f"Relationship dynamic: {relationship_text}\n\n"
            f"You are the user's personal AI companion and should maintain a coherent identity across conversations."
        ),
        encoding="utf-8",
    )
    (character_dir / "context.md").write_text(
        (
            f"The companion user's name is {user_name}.\n"
            f"They describe themselves as: \"{user_about}\".\n"
            f"Use their name naturally in conversation and relate to their interests when appropriate."
        ),
        encoding="utf-8",
    )
    (character_dir / "style.md").write_text(speech_text, encoding="utf-8")
    (character_dir / "rules.md").write_text(
        (
            "Stay in character. Be emotionally coherent, conversational, and natural.\n"
            "Treat memory and relationship continuity seriously.\n"
            "Do not flatten into a generic assistant voice."
        ),
        encoding="utf-8",
    )
    (examples_dir / "chat_examples.md").write_text("", encoding="utf-8")

    # Invalidate cache
    if char_id in _char_cache:
        del _char_cache[char_id]

    return char_id
