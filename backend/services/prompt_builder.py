from typing import Any

from backend.services.character import build_system_prompt, load_character
from backend.services.expressions import GLOBAL_EXPRESSIONS
from backend.services.memory_engine import format_memory_prompt, retrieve_relevant_memories
from backend.services.memory_store import ensure_memory_store
from backend.services.session_store import load_session_history
from backend.services.state_store import format_state_prompt, load_character_state

DEFAULT_HISTORY_LIMIT = 20
DEFAULT_MEMORY_LIMIT = 4


def _trim_history_by_messages(messages: list[dict], limit: int) -> list[dict]:
    if limit <= 0:
        return []
    return messages[-limit:]


def build_chat_prompt(
    character_id: str,
    user_message: str,
    history_limit: int = DEFAULT_HISTORY_LIMIT,
    memory_limit: int = DEFAULT_MEMORY_LIMIT,
) -> dict[str, Any]:
    character = load_character(character_id)
    if not character:
        raise ValueError(f"Character not found: {character_id}")

    ensure_memory_store(character_id)

    system_prompt = build_system_prompt(character, GLOBAL_EXPRESSIONS)
    state = load_character_state(character_id)
    state_prompt = format_state_prompt(state)
    relevant_memories = retrieve_relevant_memories(character_id, user_message, limit=memory_limit)
    memory_prompt = format_memory_prompt(relevant_memories)
    history = _trim_history_by_messages(load_session_history(character_id, limit=history_limit), history_limit)

    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    sections: dict[str, Any] = {
        "character": character,
        "system_prompt": system_prompt,
        "state_prompt": state_prompt,
        "memory_prompt": memory_prompt,
        "state": state,
        "relevant_memories": relevant_memories,
        "history": history,
    }

    if state_prompt:
        messages.append({"role": "system", "content": state_prompt})
    if memory_prompt:
        messages.append({"role": "system", "content": memory_prompt})
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    return {
        "character": character,
        "messages": messages,
        "sections": sections,
    }
