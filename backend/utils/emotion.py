import re


def parse_expression(text: str, available: list[str] | None = None) -> tuple[str, str]:
    """Parse expression tag from LLM response.

    Supports both [expression: X] and [emotion: X] formats.
    Returns (expression_name, clean_text) tuple.
    """
    # Try [expression: ...] first, then [emotion: ...]
    match = re.match(r"\[(?:expression|emotion):\s*([^\]]+)\]\s*", text)
    if match:
        expr = match.group(1).strip()
        clean_text = text[match.end():]

        # If we have a list of available expressions, validate against it
        if available:
            # Exact match
            if expr in available:
                return expr, clean_text
            # Case-insensitive match
            for a in available:
                if a.lower() == expr.lower():
                    return a, clean_text
            # No match — use first available as default
            return available[0], clean_text

        return expr, clean_text

    # No tag found — return first available or "neutral"
    default = available[0] if available else "neutral"
    return default, text
