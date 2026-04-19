import json
import re
from datetime import datetime, timezone

from backend.services.memory_store import ensure_memory_store, get_memory_dir

POSITIVE_TOKENS = {"thanks", "thank", "love", "great", "awesome", "helpful", "sweet", "nice"}
NEGATIVE_TOKENS = {"hate", "annoying", "bad", "upset", "angry", "frustrated", "sad"}
ATTACHMENT_TOKENS = {"remember", "miss", "stay", "together", "companion", "care"}


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _to_float(value: object, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _state_path(character_id: str, user_id: str | None = None):
    ensure_memory_store(character_id, user_id)
    return get_memory_dir(character_id, user_id) / "state.json"


def load_character_state(character_id: str, user_id: str | None = None) -> dict:
    path = _state_path(character_id, user_id)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        data = {}

    return {
        "trust": _to_float(data.get("trust"), 0.0),
        "affection": _to_float(data.get("affection"), 0.0),
        "mood": str(data.get("mood", "neutral")),
        "energy": _to_float(data.get("energy"), 0.7),
        "relationship_summary": str(data.get("relationship_summary", "")).strip(),
        "updated_at": data.get("updated_at"),
    }


def save_character_state(character_id: str, state: dict, user_id: str | None = None) -> dict:
    current = load_character_state(character_id, user_id)
    merged = {
        "trust": _clamp(_to_float(state.get("trust", current["trust"]), current["trust"])),
        "affection": _clamp(_to_float(state.get("affection", current["affection"]), current["affection"])),
        "mood": str(state.get("mood", current["mood"])) or "neutral",
        "energy": _clamp(_to_float(state.get("energy", current["energy"]), current["energy"])),
        "relationship_summary": str(state.get("relationship_summary", current["relationship_summary"])).strip(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _state_path(character_id, user_id).write_text(json.dumps(merged, indent=2), encoding="utf-8")
    return merged


def reset_character_state(character_id: str, user_id: str | None = None) -> dict:
    return save_character_state(
        character_id,
        {
            "trust": 0.0,
            "affection": 0.0,
            "mood": "neutral",
            "energy": 0.7,
            "relationship_summary": "",
        },
        user_id=user_id,
    )


def update_character_state_from_exchange(
    character_id: str,
    user_message: str,
    assistant_message: str,
    user_id: str | None = None,
) -> dict:
    state = load_character_state(character_id, user_id)
    user_tokens = {token.lower() for token in re.findall(r"[a-zA-Z0-9']+", user_message)}
    assistant_tokens = {token.lower() for token in re.findall(r"[a-zA-Z0-9']+", assistant_message)}

    trust = state["trust"]
    affection = state["affection"]
    energy = state["energy"]
    mood = state["mood"]
    summary = state["relationship_summary"]

    if user_tokens & POSITIVE_TOKENS:
        trust += 0.04
        affection += 0.05
        mood = "warm"
    if user_tokens & NEGATIVE_TOKENS:
        trust -= 0.01
        energy = max(0.35, energy - 0.03)
        mood = "concerned"
    if user_tokens & ATTACHMENT_TOKENS:
        affection += 0.03
        trust += 0.02
    if "proud" in assistant_tokens or "glad" in assistant_tokens:
        affection += 0.01

    if trust >= 0.7 and affection >= 0.7:
        summary = "The relationship feels close, trusting, and emotionally open."
    elif trust >= 0.4 or affection >= 0.4:
        summary = "The relationship is growing warmer and more familiar over time."
    elif summary == "":
        summary = "The relationship is still early and getting to know each other."

    return save_character_state(
        character_id,
        {
            "trust": trust,
            "affection": affection,
            "mood": mood,
            "energy": energy,
            "relationship_summary": summary,
        },
        user_id=user_id,
    )


def format_state_prompt(state: dict) -> str:
    relationship_summary = state.get("relationship_summary", "").strip()
    lines = [
        "Current relational state:",
        f"- Mood: {state.get('mood', 'neutral')}",
        f"- Trust: {state.get('trust', 0.0):.2f}",
        f"- Affection: {state.get('affection', 0.0):.2f}",
        f"- Energy: {state.get('energy', 0.7):.2f}",
    ]
    if relationship_summary:
        lines.append(f"- Relationship summary: {relationship_summary}")
    lines.append("Let this influence tone naturally, but do not mention numeric values directly.")
    return "\n".join(lines)
