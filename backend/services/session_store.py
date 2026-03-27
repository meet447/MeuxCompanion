import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from backend.services.config import load_config

ROOT_DIR = Path(__file__).parent.parent.parent
DATA_DIR = ROOT_DIR / "data"
_SESSION_LOCK = RLock()


def _slugify(value: str) -> str:
    slug = value.lower().replace(" ", "-")
    slug = "".join(c for c in slug if c.isalnum() or c in {"-", "_"})
    return slug.strip("-_") or "default-user"


def get_default_user_id() -> str:
    config = load_config()
    user = config.get("user", {})
    if user.get("name"):
        return _slugify(str(user["name"]))
    return "default-user"


def get_session_path(character_id: str, user_id: str | None = None) -> Path:
    resolved_user_id = user_id or get_default_user_id()
    session_dir = DATA_DIR / "users" / resolved_user_id / "sessions"
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir / f"{character_id}.jsonl"


def load_session_history(
    character_id: str,
    user_id: str | None = None,
    limit: int | None = None,
) -> list[dict]:
    path = get_session_path(character_id, user_id)
    if not path.exists():
        return []

    messages: list[dict] = []
    with _SESSION_LOCK:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            role = record.get("role")
            content = record.get("content")
            if role and isinstance(content, str):
                messages.append({"role": role, "content": content})

    if limit is not None and limit > 0:
        return messages[-limit:]
    return messages


def append_session_message(
    character_id: str,
    role: str,
    content: str,
    user_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    path = get_session_path(character_id, user_id)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "role": role,
        "content": content,
    }
    if metadata:
        record["metadata"] = metadata

    with _SESSION_LOCK:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def clear_session_history(character_id: str = "", user_id: str | None = None) -> None:
    resolved_user_id = user_id or get_default_user_id()
    session_dir = DATA_DIR / "users" / resolved_user_id / "sessions"
    if not session_dir.exists():
        return

    with _SESSION_LOCK:
        if character_id:
            path = session_dir / f"{character_id}.jsonl"
            if path.exists():
                path.unlink()
            return

        for session_file in session_dir.glob("*.jsonl"):
            session_file.unlink()
