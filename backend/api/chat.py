import json
import re
import threading
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from queue import Queue

from backend.services.llm import chat_stream
from backend.services.tts import generate_tts
from backend.services.character import load_character, build_system_prompt, get_model_expressions
from backend.utils.emotion import _validate_expression

router = APIRouter()

chat_histories: dict[str, list[dict]] = {}

SENTENCE_END = re.compile(r'[.!?。！？\n]+\s*')


class ChatRequest(BaseModel):
    character_id: str
    message: str


def _split_buffer(buffer: str) -> tuple[list[str], str]:
    sentences = []
    last_end = 0
    for match in SENTENCE_END.finditer(buffer):
        end_pos = match.end()
        sentence = buffer[last_end:end_pos].strip()
        if sentence:
            sentences.append(sentence)
        last_end = end_pos
    return sentences, buffer[last_end:]


def _extract_expression(text: str, available: list[str] | None) -> tuple[str, str]:
    """Extract <<expression>> tag from start of text."""
    # Match <<name>> format
    match = re.match(r'<<([^>]+)>>\s*', text)
    if match:
        expr = match.group(1).strip()
        clean = text[match.end():]
        return _validate_expression(expr, available), clean
    # Also support [expression: name] as fallback
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

    expressions = get_model_expressions(character.get("live2d_model", ""))
    system_prompt = build_system_prompt(character, expressions or None)
    voice = character.get("voice", "jp_001")

    if req.character_id not in chat_histories:
        chat_histories[req.character_id] = []

    history = chat_histories[req.character_id]
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-20:])
    messages.append({"role": "user", "content": req.message})
    history.append({"role": "user", "content": req.message})

    available = expressions or None

    def generate():
        buffer = ""
        sentence_index = 0
        current_expression = available[0] if available else "neutral"
        all_clean_text = []

        # Queue for TTS results — each thread puts (index, audio) when done
        audio_queue: Queue[tuple[int, str | None]] = Queue()
        tts_threads: list[threading.Thread] = []

        def generate_tts_async(idx: int, text: str, v: str):
            """Generate TTS in a separate thread and put result in queue."""
            audio = generate_tts(text, v)
            audio_queue.put((idx, audio))

        # Pending audio results — may arrive out of order
        pending_audio: dict[int, str | None] = {}
        next_audio_to_send = 0

        def flush_audio():
            """Send any audio results that are ready in order."""
            nonlocal next_audio_to_send
            results = []
            while next_audio_to_send in pending_audio:
                audio = pending_audio.pop(next_audio_to_send)
                if audio:
                    results.append(
                        f"data: {json.dumps({'type': 'audio', 'index': next_audio_to_send, 'audio': audio})}\n\n"
                    )
                next_audio_to_send += 1
            return results

        def collect_completed_tts():
            """Non-blocking collection of completed TTS results."""
            while not audio_queue.empty():
                idx, audio = audio_queue.get_nowait()
                pending_audio[idx] = audio

        for chunk in chat_stream(messages):
            buffer += chunk
            yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"

            # Split complete sentences
            sentences, buffer = _split_buffer(buffer)

            for sentence in sentences:
                expr, clean_text = _extract_expression(sentence, available)
                if clean_text != sentence:
                    current_expression = expr

                # Strip any remaining expression tags
                clean_text = re.sub(r'<<[^>]+>>\s*', '', clean_text).strip()
                if not clean_text or len(clean_text) < 2:
                    continue

                all_clean_text.append(clean_text)

                # Send sentence event immediately
                yield f"data: {json.dumps({'type': 'sentence', 'index': sentence_index, 'expression': current_expression, 'text': clean_text})}\n\n"

                # Start TTS in background thread immediately
                t = threading.Thread(
                    target=generate_tts_async,
                    args=(sentence_index, clean_text, voice),
                    daemon=True,
                )
                t.start()
                tts_threads.append(t)
                sentence_index += 1

            # Check if any TTS completed and send audio
            collect_completed_tts()
            for event in flush_audio():
                yield event

        # Flush remaining buffer
        if buffer.strip():
            expr, clean_text = _extract_expression(buffer.strip(), available)
            if clean_text != buffer.strip():
                current_expression = expr
            clean_text = re.sub(r'<<[^>]+>>\s*', '', clean_text).strip()
            if clean_text and len(clean_text) >= 2:
                all_clean_text.append(clean_text)
                yield f"data: {json.dumps({'type': 'sentence', 'index': sentence_index, 'expression': current_expression, 'text': clean_text})}\n\n"
                t = threading.Thread(
                    target=generate_tts_async,
                    args=(sentence_index, clean_text, voice),
                    daemon=True,
                )
                t.start()
                tts_threads.append(t)
                sentence_index += 1

        # Wait for all TTS threads to complete and send remaining audio
        for t in tts_threads:
            t.join(timeout=15)

        collect_completed_tts()
        for event in flush_audio():
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
