import re


def extract_expression_from_text(text: str, available: list[str] | None = None) -> tuple[str, str]:
    """Extract the first [expression] tag from text.

    Returns (expression_name, clean_text) with the tag removed.
    Supports [name], [expression: name], and [emotion: name] formats.
    """
    # Try [expression: X] or [emotion: X] format first
    match = re.match(r"\[(?:expression|emotion):\s*([^\]]+)\]\s*", text)
    if match:
        expr = match.group(1).strip()
        clean = text[match.end():]
        return _validate_expression(expr, available), clean

    # Try simple [name] format — match against available expressions
    if available:
        for expr in available:
            pattern = re.escape(f"[{expr}]")
            if re.match(pattern, text, re.IGNORECASE):
                clean = text[len(f"[{expr}]"):].lstrip()
                return expr, clean

    # Try generic [word] at start
    match = re.match(r"\[([^\]]+)\]\s*", text)
    if match:
        expr = match.group(1).strip()
        clean = text[match.end():]
        return _validate_expression(expr, available), clean

    default = available[0] if available else "neutral"
    return default, text


def _validate_expression(expr: str, available: list[str] | None) -> str:
    """Validate expression against available list."""
    if not available:
        return expr
    # Exact match
    if expr in available:
        return expr
    # Case-insensitive
    for a in available:
        if a.lower() == expr.lower():
            return a
    return available[0]


def split_sentences(text: str) -> list[str]:
    """Split text into sentences, preserving expression tags with the sentence they precede."""
    # Split on sentence-ending punctuation followed by a space or end
    parts = re.split(r'(?<=[.!?。！？])\s+', text)
    return [p.strip() for p in parts if p.strip()]


def extract_inline_expressions(text: str, available: list[str] | None = None) -> list[tuple[str, str]]:
    """Parse text with inline expression tags into a list of (expression, sentence) pairs.

    Input: "[happy] Hey, that's great! [surprised] Wait, really?"
    Output: [("happy", "Hey, that's great!"), ("surprised", "Wait, really?")]
    """
    if not available:
        available = ["neutral"]

    # Build regex pattern matching any [expression_name] tag
    # Match both [name] and [expression: name] formats
    tag_pattern = r'\[(?:expression:\s*)?([^\]]+)\]'

    # Split text by expression tags, keeping the tag content
    parts = re.split(tag_pattern, text)

    results: list[tuple[str, str]] = []
    current_expr = available[0]  # default expression

    i = 0
    while i < len(parts):
        part = parts[i].strip()

        if i + 1 < len(parts):
            # Check if next part is a captured expression name
            next_part = parts[i + 1].strip()
            validated = _validate_expression(next_part, available)

            if validated != available[0] or next_part.lower() in [a.lower() for a in available]:
                # This part is text before the next tag
                if part:
                    # Split into sentences
                    sentences = split_sentences(part)
                    for s in sentences:
                        results.append((current_expr, s))
                current_expr = validated
                i += 2
                continue

        # Regular text
        if part:
            sentences = split_sentences(part)
            for s in sentences:
                results.append((current_expr, s))
        i += 1

    return results if results else [(available[0], text)]
