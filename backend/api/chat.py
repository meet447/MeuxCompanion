import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.services.llm import chat_stream
from backend.services.character import load_character, build_system_prompt, get_model_expressions
from backend.utils.emotion import parse_expression

router = APIRouter()

# In-memory chat histories keyed by character_id
chat_histories: dict[str, list[dict]] = {}


class ChatRequest(BaseModel):
    character_id: str
    message: str


@router.post("/api/chat/stream")
def stream_message(req: ChatRequest):
    character = load_character(req.character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    expressions = get_model_expressions(character.get("live2d_model", ""))
    system_prompt = build_system_prompt(character, expressions or None)

    if req.character_id not in chat_histories:
        chat_histories[req.character_id] = []

    history = chat_histories[req.character_id]

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-20:])
    messages.append({"role": "user", "content": req.message})

    # Add user message to history immediately
    history.append({"role": "user", "content": req.message})

    available_expressions = expressions or None

    def generate():
        full_response = ""
        expression_parsed = False
        expression = ""

        for chunk in chat_stream(messages):
            full_response += chunk

            # Try to parse expression tag from the accumulated response
            if not expression_parsed and "]" in full_response:
                expr, clean_so_far = parse_expression(full_response, available_expressions)
                expression = expr
                expression_parsed = True
                # Send expression event
                yield f"data: {json.dumps({'type': 'expression', 'expression': expression})}\n\n"
                # Send the clean text accumulated so far
                if clean_so_far:
                    yield f"data: {json.dumps({'type': 'text', 'text': clean_so_far})}\n\n"
            elif expression_parsed:
                # Stream text chunks directly
                yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"

        # If expression was never parsed (no tag in response)
        if not expression_parsed:
            expr, clean_text = parse_expression(full_response, available_expressions)
            expression = expr
            yield f"data: {json.dumps({'type': 'expression', 'expression': expression})}\n\n"
            yield f"data: {json.dumps({'type': 'text', 'text': clean_text})}\n\n"

        # Final clean text for history
        _, final_text = parse_expression(full_response, available_expressions)
        history.append({"role": "assistant", "content": final_text})

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/api/chat/clear")
def clear_history(character_id: str = ""):
    if character_id:
        chat_histories.pop(character_id, None)
    else:
        chat_histories.clear()
    return {"status": "ok"}
