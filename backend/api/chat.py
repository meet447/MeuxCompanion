from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.llm import chat
from backend.services.character import load_character, build_system_prompt, get_model_expressions
from backend.utils.emotion import parse_expression

router = APIRouter()

# In-memory chat histories keyed by character_id
chat_histories: dict[str, list[dict]] = {}


class ChatRequest(BaseModel):
    character_id: str
    message: str


class ChatResponse(BaseModel):
    text: str
    expression: str


@router.post("/api/chat", response_model=ChatResponse)
def send_message(req: ChatRequest):
    character = load_character(req.character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # Get available expressions from the Live2D model
    expressions = get_model_expressions(character.get("live2d_model", ""))

    system_prompt = build_system_prompt(character, expressions or None)

    # Get or create history for this character
    if req.character_id not in chat_histories:
        chat_histories[req.character_id] = []

    history = chat_histories[req.character_id]

    # Build messages for LLM
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-20:])  # Keep last 20 messages for context
    messages.append({"role": "user", "content": req.message})

    # Call LLM
    try:
        raw_response = chat(messages)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {str(e)}")

    # Parse expression from response
    expr, clean_text = parse_expression(raw_response, expressions or None)

    # Update history
    history.append({"role": "user", "content": req.message})
    history.append({"role": "assistant", "content": clean_text})

    return ChatResponse(text=clean_text, expression=expr)


@router.post("/api/chat/clear")
def clear_history(character_id: str = ""):
    if character_id:
        chat_histories.pop(character_id, None)
    else:
        chat_histories.clear()
    return {"status": "ok"}
