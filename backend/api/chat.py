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


@router.post("/api/chat/stream")
def stream_message(req: ChatRequest):
    character = load_character(req.character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    model_id = character.get("live2d_model", "")
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
            tts_thread_count[0] += 1

            def tts_work():
                audio = generate_tts(clean, voice)
                if audio:
                    emit(f"data: {json.dumps({'type': 'audio', 'index': idx, 'audio': audio})}\n\n")
                tts_thread_count[0] -= 1
                # If LLM is done and all TTS threads finished, signal completion
                if llm_done.is_set() and tts_thread_count[0] <= 0:
                    emit(None)  # sentinel to end the event stream

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

        # Save to history
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
