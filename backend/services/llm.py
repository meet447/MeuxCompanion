import json
import requests
from typing import Generator

NECTARA_URL = "https://api-nectara.chipling.xyz/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-20b"


def chat(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """Send a non-streaming chat completion request."""
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer nct_rloww3grx7ebfch",
    }

    response = requests.post(NECTARA_URL, json=payload, headers=headers, timeout=30)
    response.raise_for_status()

    data = response.json()
    return data["choices"][0]["message"]["content"]


def chat_stream(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> Generator[str, None, None]:
    """Send a streaming chat completion request, yielding text chunks."""
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer nct_rloww3grx7ebfch",
    }

    response = requests.post(
        NECTARA_URL, json=payload, headers=headers, timeout=60, stream=True
    )
    response.raise_for_status()

    for line in response.iter_lines():
        if not line:
            continue
        line_str = line.decode("utf-8")
        if not line_str.startswith("data: "):
            continue
        data_str = line_str[6:]
        if data_str.strip() == "[DONE]":
            break
        try:
            data = json.loads(data_str)
            delta = data.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content", "")
            if content:
                yield content
        except json.JSONDecodeError:
            continue
