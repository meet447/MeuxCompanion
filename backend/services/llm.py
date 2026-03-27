from typing import Generator
from openai import OpenAI

from backend.services.config import load_config

_cached_client: OpenAI | None = None
_cached_key: str = ""


def _get_client() -> tuple[OpenAI, str]:
    """Get or create an OpenAI client from config.json."""
    global _cached_client, _cached_key

    config = load_config()
    llm = config.get("llm", {})
    base_url = llm.get("base_url", "")
    api_key = llm.get("api_key") or "not-needed"
    cache_key = f"{base_url}|{api_key}"

    if _cached_client and _cached_key == cache_key:
        return _cached_client, llm.get("model", "")

    _cached_client = OpenAI(base_url=base_url, api_key=api_key)
    _cached_key = cache_key
    return _cached_client, llm.get("model", "")


def chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """Send a non-streaming chat completion request."""
    client, default_model = _get_client()
    response = client.chat.completions.create(
        model=model or default_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
    )
    return response.choices[0].message.content or ""


def chat_stream(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> Generator[str, None, None]:
    """Send a streaming chat completion request, yielding text chunks."""
    client, default_model = _get_client()
    stream = client.chat.completions.create(
        model=model or default_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )

    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
