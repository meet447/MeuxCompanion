import json
import re
import threading
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from queue import Queue, Empty

from backend.services.llm import chat_stream
from backend.services.tts import generate_tts
from backend.services.character import load_character, build_system_prompt
from backend.services.expressions import GLOBAL_EXPRESSIONS, resolve_expression
from backend.utils.emotion import _validate_expression

router = APIRouter()

chat_histories: dict[str, list[dict]] = {}

EXPR_TAG = re.compile(r'<<([^/>][^>]*)>>')  # Match <<name>> but not <</name>>
CLOSING_TAG = re.compile(r'<</[^>]*>>')    # Match closing tags to strip them


class ChatRequest(BaseModel):
    character_id: str
    message: str


def _extract_expression(text: str, available: list[str] | None) -> tuple[str, str]:
    """Extract <<expression>> tag from text."""
    match = re.match(r'<<([^>]+)>>\s*', text)
    if match:
        expr = match.group(1).strip()
        clean = text[match.end():]
        return _validate_expression(expr, available), clean
    match = re.match(r'\[expression:\s*([^\]]+)\]\s*', text)
    if match:
        expr = match.group(1).strip()
        clean = text[match.end():]
        return _validate_expression(expr, available), clean
    default = available[0] if available else "neutral"
    return default, text


@router.post("/api/chat/stream")
def stream_message(req: ChatRequest):
    character = load_character(req.character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    model_id = character.get("live2d_model", "")
    # LLM always picks from global expressions
    system_prompt = build_system_prompt(character, GLOBAL_EXPRESSIONS)
    voice = character.get("voice", "jp_001")

    if req.character_id not in chat_histories:
        chat_histories[req.character_id] = []

    history = chat_histories[req.character_id]
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-20:])
    messages.append({"role": "user", "content": req.message})
    history.append({"role": "user", "content": req.message})

    available = GLOBAL_EXPRESSIONS

    def map_expression(expr: str) -> str:
        """Map global expression name to actual model expression ID."""
        return resolve_expression(model_id, expr)

    def generate():
        buffer = ""
        sentence_index = 0
        current_expression = available[0] if available else "neutral"
        all_clean_text = []

        # Audio results queue — TTS threads put results here
        audio_ready: Queue[tuple[int, str | None]] = Queue()
        pending_audio: dict[int, str | None] = {}
        next_audio_to_send = 0
        active_threads: list[threading.Thread] = []

        def tts_worker(idx: int, text: str, v: str):
            audio = generate_tts(text, v)
            audio_ready.put((idx, audio))

        def try_send_audio():
            """Collect completed TTS and yield any that are next in order."""
            nonlocal next_audio_to_send
            # Collect all completed results
            while True:
                try:
                    idx, audio = audio_ready.get_nowait()
                    pending_audio[idx] = audio
                except Empty:
                    break
            # Send in order
            events = []
            while next_audio_to_send in pending_audio:
                audio = pending_audio.pop(next_audio_to_send)
                if audio:
                    events.append(
                        f"data: {json.dumps({'type': 'audio', 'index': next_audio_to_send, 'audio': audio})}\n\n"
                    )
                next_audio_to_send += 1
            return events

        def process_sentence(raw_sentence: str):
            nonlocal sentence_index, current_expression

            # Extract expression tag
            expr, clean = _extract_expression(raw_sentence, available)
            if clean != raw_sentence:
                current_expression = expr

            # Strip remaining tags
            clean = re.sub(r'<<[^>]+>>\s*', '', clean).strip()
            if not clean or len(clean) < 2:
                return

            all_clean_text.append(clean)

            return {
                "index": sentence_index,
                "expression": current_expression,
                "text": clean,
            }

        # === MAIN STREAMING LOOP ===
        # Split on <<expression>> tags — each tag starts a new segment
        # Buffer accumulates tokens until the next tag or end of stream
        pending_text = ""  # text for current expression segment

        for chunk in chat_stream(messages):
            buffer += chunk

            # Strip closing tags like <</name>>
            buffer = CLOSING_TAG.sub('', buffer)

            # Stream raw text for live display
            yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"

            # Check if buffer contains a new <<expression>> tag
            # Split: "text before <<expr>> text after"
            while True:
                match = EXPR_TAG.search(buffer)
                if not match:
                    break

                # Everything before this tag belongs to the previous segment
                before = buffer[:match.start()].strip()
                new_expr = _validate_expression(match.group(1).strip(), available)
                buffer = buffer[match.end():]

                # Flush the previous segment
                if pending_text or before:
                    segment_text = (pending_text + " " + before).strip()
                    segment_text = re.sub(r'<<[^>]+>>\s*', '', segment_text).strip()

                    if segment_text and len(segment_text) >= 2:
                        all_clean_text.append(segment_text)

                        yield f"data: {json.dumps({'type': 'sentence', 'index': sentence_index, 'expression': map_expression(current_expression), 'text': segment_text})}\n\n"

                        t = threading.Thread(
                            target=tts_worker,
                            args=(sentence_index, segment_text, voice),
                            daemon=True,
                        )
                        t.start()
                        active_threads.append(t)
                        sentence_index += 1

                    pending_text = ""

                # Update expression for the next segment
                current_expression = new_expr

            # Accumulate remaining buffer as pending text
            pending_text += buffer
            buffer = ""

            # Check if any TTS finished and send audio
            for event in try_send_audio():
                yield event

        # Flush final segment
        final_text = re.sub(r'<<[^>]+>>\s*', '', pending_text).strip()
        if final_text and len(final_text) >= 2:
            all_clean_text.append(final_text)

            yield f"data: {json.dumps({'type': 'sentence', 'index': sentence_index, 'expression': map_expression(current_expression), 'text': final_text})}\n\n"

            t = threading.Thread(
                target=tts_worker,
                args=(sentence_index, final_text, voice),
                daemon=True,
            )
            t.start()
            active_threads.append(t)
            sentence_index += 1

        # Wait for remaining TTS and send audio
        for t in active_threads:
            t.join(timeout=15)

        for event in try_send_audio():
            yield event

        history.append({"role": "assistant", "content": " ".join(all_clean_text)})
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/api/chat/clear")
def clear_history(character_id: str = ""):
    if character_id:
        chat_histories.pop(character_id, None)
    else:
        chat_histories.clear()
    return {"status": "ok"}
