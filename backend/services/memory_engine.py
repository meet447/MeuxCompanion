import re
from datetime import datetime, timezone

from backend.services.memory_store import append_memory, list_memories

SENTENCE_SPLIT_RE = re.compile(r"[.!?\n]+")
TOKEN_RE = re.compile(r"[a-zA-Z0-9']+")
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from",
    "had", "has", "have", "he", "her", "hers", "him", "his", "i", "if", "in", "into",
    "is", "it", "its", "me", "my", "of", "on", "or", "our", "ours", "she", "so",
    "that", "the", "their", "theirs", "them", "they", "this", "to", "too", "us",
    "was", "we", "were", "with", "you", "your", "yours",
}


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _normalize_for_compare(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _extract_tokens(text: str) -> set[str]:
    tokens = {token.lower() for token in TOKEN_RE.findall(text)}
    return {token for token in tokens if token not in STOPWORDS and len(token) > 1}


def _sentence_candidates(text: str) -> list[str]:
    parts = [_normalize_text(part) for part in SENTENCE_SPLIT_RE.split(text)]
    return [part for part in parts if len(part) >= 8]


def _build_memory_from_sentence(sentence: str) -> dict | None:
    lower = sentence.lower()
    cleaned = sentence.rstrip(". ")

    direct_patterns = [
        ("my name is ", "semantic", 1.0, ["identity", "user_profile"]),
        ("i am building ", "semantic", 0.95, ["project", "user_goal"]),
        ("i'm building ", "semantic", 0.95, ["project", "user_goal"]),
        ("i am working on ", "semantic", 0.9, ["project", "user_goal"]),
        ("i'm working on ", "semantic", 0.9, ["project", "user_goal"]),
        ("i study ", "semantic", 0.85, ["education", "user_profile"]),
        ("i am ", "semantic", 0.75, ["identity", "user_profile"]),
        ("i'm ", "semantic", 0.75, ["identity", "user_profile"]),
        ("i like ", "semantic", 0.8, ["preferences"]),
        ("i love ", "semantic", 0.85, ["preferences"]),
        ("i enjoy ", "semantic", 0.8, ["preferences"]),
        ("i prefer ", "semantic", 0.8, ["preferences"]),
        ("i hate ", "semantic", 0.85, ["preferences"]),
        ("i don't like ", "semantic", 0.85, ["preferences"]),
        ("i do not like ", "semantic", 0.85, ["preferences"]),
        ("my favorite ", "semantic", 0.8, ["preferences"]),
        ("i want ", "semantic", 0.75, ["desire"]),
        ("i need ", "semantic", 0.7, ["desire"]),
    ]

    for prefix, memory_type, importance, tags in direct_patterns:
        if lower.startswith(prefix):
            return {
                "type": memory_type,
                "summary": cleaned[0].upper() + cleaned[1:] + ".",
                "importance": importance,
                "tags": tags + sorted(_extract_tokens(sentence))[:4],
            }

    if "remember" in lower:
        return {
            "type": "episodic",
            "summary": cleaned[0].upper() + cleaned[1:] + ".",
            "importance": 0.95,
            "tags": ["explicit_memory"] + sorted(_extract_tokens(sentence))[:4],
        }

    if any(term in lower for term in ("backend", "frontend", "client", "local file", "memory system", "character")):
        return {
            "type": "episodic",
            "summary": cleaned[0].upper() + cleaned[1:] + ".",
            "importance": 0.68,
            "tags": ["project_context"] + sorted(_extract_tokens(sentence))[:4],
        }

    return None


def remember_exchange(
    character_id: str,
    user_message: str,
    assistant_message: str,
    user_id: str | None = None,
) -> list[dict]:
    existing = {
        _normalize_for_compare(memory.get("summary", ""))
        for memory in list_memories(character_id, user_id=user_id, limit=200)
    }
    created: list[dict] = []

    for sentence in _sentence_candidates(user_message):
        candidate = _build_memory_from_sentence(sentence)
        if not candidate:
            continue
        normalized = _normalize_for_compare(candidate["summary"])
        if not normalized or normalized in existing:
            continue
        record = append_memory(
            character_id=character_id,
            memory_type=candidate["type"],
            summary=candidate["summary"],
            user_id=user_id,
            importance=candidate["importance"],
            tags=candidate["tags"],
            metadata={
                "source": "user_message",
                "assistant_context": assistant_message[:240],
            },
        )
        existing.add(normalized)
        created.append(record)

    if len(_extract_tokens(user_message) & {"thanks", "thank", "helped", "helpful"}) and assistant_message:
        reflection = "The user responded positively to the companion's help in a recent conversation."
        normalized = _normalize_for_compare(reflection)
        if normalized not in existing:
            record = append_memory(
                character_id=character_id,
                memory_type="reflections",
                summary=reflection,
                user_id=user_id,
                importance=0.55,
                tags=["relationship", "positive_feedback"],
                metadata={"source": "heuristic_reflection"},
            )
            existing.add(normalized)
            created.append(record)

    return created


def retrieve_relevant_memories(
    character_id: str,
    query: str,
    user_id: str | None = None,
    limit: int = 4,
) -> list[dict]:
    query_tokens = _extract_tokens(query)
    if not query_tokens:
        return []

    now = datetime.now(timezone.utc)
    scored: list[tuple[float, dict]] = []

    for memory in list_memories(character_id, user_id=user_id, limit=300):
        summary = memory.get("summary", "")
        memory_tokens = _extract_tokens(summary)
        overlap = len(query_tokens & memory_tokens)
        if overlap <= 0 and not any(token in summary.lower() for token in query_tokens):
            continue

        importance = float(memory.get("importance", 0.5))
        tags = {str(tag).lower() for tag in memory.get("tags", [])}
        tag_overlap = len(query_tokens & tags)

        recency_bonus = 0.0
        ts_value = memory.get("ts")
        if isinstance(ts_value, str):
            try:
                created_at = datetime.fromisoformat(ts_value)
                age_days = max((now - created_at).total_seconds() / 86400, 0.0)
                recency_bonus = max(0.0, 0.3 - min(age_days / 365, 0.3))
            except ValueError:
                recency_bonus = 0.0

        score = (overlap * 1.6) + (tag_overlap * 1.2) + importance + recency_bonus
        scored.append((score, memory))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [memory for _, memory in scored[:limit]]


def format_memory_prompt(memories: list[dict]) -> str:
    if not memories:
        return ""

    lines = [
        "You have relevant long-term memories about this user and relationship.",
        "Use them naturally when helpful, but do not quote them awkwardly or repeat them if they are not relevant.",
        "",
    ]
    for memory in memories:
        memory_type = str(memory.get("type", "memory")).lower()
        summary = str(memory.get("summary", "")).strip()
        if summary:
            lines.append(f"- [{memory_type}] {summary}")
    return "\n".join(lines).strip()
