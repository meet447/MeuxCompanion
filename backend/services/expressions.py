import json
from pathlib import Path

MAPPINGS_DIR = Path(__file__).parent.parent.parent / "models" / "expression_mappings"

# Standard global expressions the LLM always picks from
GLOBAL_EXPRESSIONS = [
    "neutral",
    "happy",
    "sad",
    "angry",
    "surprised",
    "excited",
    "embarrassed",
    "thinking",
    "blush",
    "smirk",
    "scared",
    "disgusted",
]


def ensure_mappings_dir():
    MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)


def get_expression_mapping(model_id: str) -> dict[str, str]:
    """Load expression mapping for a model. Returns {global_name: model_expression_id}."""
    ensure_mappings_dir()
    path = MAPPINGS_DIR / f"{model_id}.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, ValueError):
            pass
    return {}


def save_expression_mapping(model_id: str, mapping: dict[str, str]):
    """Save expression mapping for a model."""
    ensure_mappings_dir()
    path = MAPPINGS_DIR / f"{model_id}.json"
    path.write_text(json.dumps(mapping, indent=2, ensure_ascii=False), encoding="utf-8")


def resolve_expression(model_id: str, global_name: str) -> str:
    """Resolve a global expression name to the actual model expression ID."""
    mapping = get_expression_mapping(model_id)
    if global_name in mapping and mapping[global_name]:
        return mapping[global_name]
    # If no mapping, return the global name as-is (works for models with readable names)
    return global_name


def get_model_raw_expressions(model_id: str) -> list[str]:
    """Get the raw expression names from a model's files (for the mapping UI)."""
    from backend.services.character import _find_model3_json, MODELS_DIR, VRM_MODELS_DIR, _detect_model_type

    model_type = _detect_model_type(model_id)

    if model_type == "live2d":
        model_dir = MODELS_DIR / model_id
        model3_path = _find_model3_json(model_dir)
        if not model3_path:
            return []
        try:
            data = json.loads(model3_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, ValueError):
            return []
        exprs = data.get("FileReferences", {}).get("Expressions", [])
        return [e.get("Name", "") for e in exprs if e.get("Name")]

    if model_type == "vrm":
        return ["happy", "angry", "sad", "relaxed", "surprised", "neutral",
                "aa", "ih", "ou", "ee", "oh", "blink"]

    return []
