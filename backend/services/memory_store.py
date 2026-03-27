import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from uuid import uuid4

from backend.services.session_store import get_default_user_id

ROOT_DIR = Path(__file__).parent.parent.parent
DATA_DIR = ROOT_DIR / "data"
_MEMORY_LOCK = RLock()
MEMORY_FILES = {
    "episodic": "episodic.jsonl",
    "semantic": "semantic.jsonl",
    "reflections": "reflections.jsonl",
}


def get_memory_dir(character_id: str, user_id: str | None = None) -> Path:
    resolved_user_id = user_id or get_default_user_id()
    memory_dir = DATA_DIR / "users" / resolved_user_id / "memories" / character_id
    memory_dir.mkdir(parents=True, exist_ok=True)
    return memory_dir


def ensure_memory_store(character_id: str, user_id: str | None = None) -> Path:
    memory_dir = get_memory_dir(character_id, user_id)
    with _MEMORY_LOCK:
        for filename in MEMORY_FILES.values():
            path = memory_dir / filename
            if not path.exists():
                path.write_text("", encoding="utf-8")

        summary_path = memory_dir / "summary.md"
        if not summary_path.exists():
            summary_path.write_text("", encoding="utf-8")

        state_path = memory_dir / "state.json"
        if not state_path.exists():
            state_path.write_text(
                json.dumps(
                    {
                        "trust": 0.0,
                        "affection": 0.0,
                        "mood": "neutral",
                        "updated_at": None,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

    return memory_dir


def append_memory(
    character_id: str,
    memory_type: str,
    summary: str,
    user_id: str | None = None,
    importance: float = 0.5,
    tags: list[str] | None = None,
    metadata: dict | None = None,
) -> dict:
    if memory_type not in MEMORY_FILES:
        raise ValueError(f"Unsupported memory type: {memory_type}")

    memory_dir = ensure_memory_store(character_id, user_id)
    record = {
        "id": f"mem_{uuid4().hex[:12]}",
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": memory_type,
        "summary": summary,
        "importance": importance,
        "tags": tags or [],
        "metadata": metadata or {},
    }

    target_path = memory_dir / MEMORY_FILES[memory_type]
    with _MEMORY_LOCK:
        with target_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    return record


def list_memories(
    character_id: str,
    user_id: str | None = None,
    memory_type: str | None = None,
    limit: int = 50,
) -> list[dict]:
    memory_dir = ensure_memory_store(character_id, user_id)
    filenames = [MEMORY_FILES[memory_type]] if memory_type else list(MEMORY_FILES.values())

    memories: list[dict] = []
    with _MEMORY_LOCK:
        for filename in filenames:
            path = memory_dir / filename
            if not path.exists():
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    memories.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    memories.sort(key=lambda item: item.get("ts", ""))
    if limit > 0:
        return memories[-limit:]
    return memories


def clear_memories(
    character_id: str,
    user_id: str | None = None,
    memory_type: str | None = None,
) -> None:
    memory_dir = ensure_memory_store(character_id, user_id)
    filenames = [MEMORY_FILES[memory_type]] if memory_type else list(MEMORY_FILES.values())

    with _MEMORY_LOCK:
        for filename in filenames:
            path = memory_dir / filename
            if path.exists():
                path.write_text("", encoding="utf-8")
