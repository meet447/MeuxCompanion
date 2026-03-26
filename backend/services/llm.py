import requests

NECTARA_URL = "https://api-nectara.chipling.xyz/v1/chat/completions"
DEFAULT_MODEL = "llama3.1-8B"


def chat(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """Send a chat completion request to Nectara API."""
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
