import re

VALID_EMOTIONS = [
    "neutral", "happy", "sad", "angry",
    "surprised", "embarrassed", "thinking", "excited",
]

DEFAULT_EMOTION = "neutral"


def parse_emotion(text: str) -> tuple[str, str]:
    """Parse emotion tag from LLM response.

    Returns (emotion, clean_text) tuple.
    Example: "[emotion: happy] Hello!" -> ("happy", "Hello!")
    """
    match = re.match(r"\[emotion:\s*(\w+)\]\s*", text)
    if match:
        emotion = match.group(1).lower()
        clean_text = text[match.end():]
        if emotion not in VALID_EMOTIONS:
            emotion = DEFAULT_EMOTION
        return emotion, clean_text
    return DEFAULT_EMOTION, text
