import json
import re
import threading
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from queue import Queue, Empty

from backend.services.llm import chat_stream
from backend.services.tts import generate_tts_auto
from backend.services.character import load_character
from backend.services.expressions import GLOBAL_EXPRESSIONS, resolve_expression
from backend.services.memory_engine import remember_exchange
from backend.services.prompt_builder import build_chat_prompt
from backend.services.session_store import (
    append_session_message,
    clear_session_history,
    load_session_history,
)
from backend.services.state_store import update_character_state_from_exchange
from backend.utils.emotion import _validate_expression

router = APIRouter()

EXPR_TAG = re.compile(r'<<([^/>][^>]*)>>')
CLOSING_TAG = re.compile(r'<</[^>]*>>')


class ChatRequest(BaseModel):
    character_id: str
    message: str


def _extract_expression(text: str, available: list[str] | None) -> tuple[str, str]:
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


@router.get("/api/chat/history/{character_id}")
def get_history(character_id: str, limit: int = 50):
    character = load_character(character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return {"character_id": character_id, "messages": load_session_history(character_id, limit=limit)}


@router.post("/api/chat/stream")
def stream_message(req: ChatRequest):
    if not load_character(req.character_id):
        raise HTTPException(status_code=404, detail="Character not found")

    prompt = build_chat_prompt(req.character_id, req.message)
    character = prompt["character"]
    messages = prompt["messages"]
    model_id = character.get("live2d_model", "")
    append_session_message(req.character_id, "user", req.message)

    available = GLOBAL_EXPRESSIONS

    def map_expr(expr: str) -> str:
        return resolve_expression(model_id, expr)

    def generate():
        # Event queue — both LLM stream and TTS threads push events here
        # This allows TTS audio to be sent as soon as it's ready
        event_queue: Queue[str | None] = Queue()
        all_clean_text: list[str] = []
        sentence_index_counter = [0]
        current_expression = [available[0]]
        pending_text = [""]
        tts_thread_count = [0]
        tts_lock = threading.Lock()
        llm_done = threading.Event()

        def emit(event_str: str):
            event_queue.put(event_str)

        def process_segment(text: str, expression: str):
            """Process a complete text segment — send sentence + start TTS."""
            clean = re.sub(r'<<[^>]+>>\s*', '', text).strip()
            clean = CLOSING_TAG.sub('', clean).strip()
            if not clean or len(clean) < 2:
                return

            idx = sentence_index_counter[0]
            sentence_index_counter[0] += 1
            mapped = map_expr(expression)
            all_clean_text.append(clean)

            emit(f"data: {json.dumps({'type': 'sentence', 'index': idx, 'expression': mapped, 'text': clean})}\n\n")

            # Generate TTS in background — emit audio event when done
            with tts_lock:
                tts_thread_count[0] += 1

            def tts_work():
                audio = generate_tts_auto(clean)
                if audio:
                    emit(f"data: {json.dumps({'type': 'audio', 'index': idx, 'audio': audio})}\n\n")
                with tts_lock:
                    tts_thread_count[0] -= 1
                    should_signal = llm_done.is_set() and tts_thread_count[0] <= 0
                if should_signal:
                    emit(None)

            t = threading.Thread(target=tts_work, daemon=True)
            t.start()

        def llm_worker():
            """Stream LLM tokens, extract sentences on expression boundaries."""
            buffer = ""

            for chunk in chat_stream(messages):
                buffer += chunk
                buffer = CLOSING_TAG.sub('', buffer)

                # Send raw text for live display
                emit(f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n")

                # Check for expression tags — each one starts a new segment
                while True:
                    match = EXPR_TAG.search(buffer)
                    if not match:
                        break

                    before = buffer[:match.start()].strip()
                    new_expr = _validate_expression(match.group(1).strip(), available)
                    buffer = buffer[match.end():]

                    # Flush previous segment
                    combined = (pending_text[0] + " " + before).strip()
                    if combined:
                        process_segment(combined, current_expression[0])
                    pending_text[0] = ""
                    current_expression[0] = new_expr

                pending_text[0] += buffer
                buffer = ""

            # Flush final segment
            final = pending_text[0].strip()
            if final:
                process_segment(final, current_expression[0])

            llm_done.set()

            # If no TTS threads are running, signal done immediately
            if tts_thread_count[0] <= 0:
                emit(None)

        # Start LLM streaming in a background thread
        llm_thread = threading.Thread(target=llm_worker, daemon=True)
        llm_thread.start()

        # Yield events as they arrive from any thread
        while True:
            try:
                event = event_queue.get(timeout=30)
                if event is None:
                    break
                yield event
            except Empty:
                break

        assistant_text = " ".join(all_clean_text)
        append_session_message(req.character_id, "assistant", assistant_text)
        remember_exchange(req.character_id, req.message, assistant_text)
        update_character_state_from_exchange(req.character_id, req.message, assistant_text)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/api/chat/clear")
def clear_history(character_id: str = ""):
    clear_session_history(character_id=character_id)
    return {"status": "ok"}
