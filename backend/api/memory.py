from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.services.character import load_character
from backend.services.memory_engine import retrieve_relevant_memories
from backend.services.memory_store import clear_memories, ensure_memory_store, list_memories
from backend.services.state_store import (
    load_character_state,
    reset_character_state,
    save_character_state,
)

router = APIRouter()


def _require_character(character_id: str) -> None:
    if not load_character(character_id):
        raise HTTPException(status_code=404, detail="Character not found")


@router.get("/api/memory/{character_id}")
def get_character_memory(
    character_id: str,
    memory_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    _require_character(character_id)
    ensure_memory_store(character_id)
    return {
        "character_id": character_id,
        "state": load_character_state(character_id),
        "memories": list_memories(character_id, memory_type=memory_type, limit=limit),
    }


@router.get("/api/memory/{character_id}/search")
def search_character_memory(
    character_id: str,
    q: str = Query(..., min_length=1),
    limit: int = Query(default=8, ge=1, le=50),
):
    _require_character(character_id)
    ensure_memory_store(character_id)
    return {
        "character_id": character_id,
        "query": q,
        "results": retrieve_relevant_memories(character_id, q, limit=limit),
    }


class MemoryClearRequest(BaseModel):
    memory_type: str | None = None
    reset_state: bool = False


@router.post("/api/memory/{character_id}/clear")
def clear_character_memory(character_id: str, body: MemoryClearRequest):
    _require_character(character_id)
    clear_memories(character_id, memory_type=body.memory_type)
    state = None
    if body.reset_state:
        state = reset_character_state(character_id)
    return {"status": "ok", "character_id": character_id, "state": state}


@router.get("/api/state/{character_id}")
def get_character_state(character_id: str):
    _require_character(character_id)
    ensure_memory_store(character_id)
    return {"character_id": character_id, "state": load_character_state(character_id)}


class StateUpdateRequest(BaseModel):
    trust: float | None = None
    affection: float | None = None
    mood: str | None = None
    energy: float | None = None
    relationship_summary: str | None = None


@router.post("/api/state/{character_id}")
def update_character_state(character_id: str, body: StateUpdateRequest):
    _require_character(character_id)
    ensure_memory_store(character_id)
    updated = save_character_state(character_id, body.model_dump(exclude_none=True))
    return {"character_id": character_id, "state": updated}


@router.post("/api/state/{character_id}/reset")
def reset_state(character_id: str):
    _require_character(character_id)
    ensure_memory_store(character_id)
    return {"character_id": character_id, "state": reset_character_state(character_id)}
