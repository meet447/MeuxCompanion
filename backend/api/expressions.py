from fastapi import APIRouter
from pydantic import BaseModel

from backend.services.expressions import (
    GLOBAL_EXPRESSIONS,
    get_expression_mapping,
    save_expression_mapping,
    get_model_raw_expressions,
)

router = APIRouter()


class SaveMappingRequest(BaseModel):
    model_id: str
    mapping: dict[str, str]  # {global_name: model_expression_id}


@router.get("/api/expressions/global")
def get_global_expressions():
    """Get the list of standard global expressions."""
    return GLOBAL_EXPRESSIONS


@router.get("/api/expressions/model/{model_id}")
def get_model_expressions_api(model_id: str):
    """Get a model's raw expression names (for the mapping UI)."""
    return get_model_raw_expressions(model_id)


@router.get("/api/expressions/mapping/{model_id}")
def get_mapping(model_id: str):
    """Get the current expression mapping for a model."""
    return get_expression_mapping(model_id)


@router.post("/api/expressions/mapping")
def save_mapping(req: SaveMappingRequest):
    """Save expression mapping for a model."""
    save_expression_mapping(req.model_id, req.mapping)
    return {"status": "ok"}


@router.get("/api/expressions/configured/{model_id}")
def is_configured(model_id: str):
    """Check if a model has expression mapping configured.
    VRM models and models with no expressions don't need mapping.
    Live2D models need an expression_mappings/{model_id}.json file."""
    from backend.services.character import _detect_model_type

    # VRM models use blend shapes directly — no mapping needed
    model_type = _detect_model_type(model_id)
    if model_type == "vrm":
        return {"configured": True, "neutral": "neutral"}

    # Live2D models with no expressions don't need mapping
    raw_exprs = get_model_raw_expressions(model_id)
    if not raw_exprs:
        return {"configured": True, "neutral": "neutral"}

    # Check expression_mappings/{model_id}.json
    mapping = get_expression_mapping(model_id)
    if mapping and any(v for v in mapping.values()):
        neutral = mapping.get("neutral", "neutral")
        return {"configured": True, "neutral": neutral}

    # No mapping yet — trigger auto-generation (regenerates mapping.json
    # which now writes expressions to expression_mappings/)
    from backend.services.character import load_model_mapping, MODELS_DIR
    model_dir = MODELS_DIR / model_id
    if model_dir.exists():
        from backend.services.character import _auto_generate_mapping
        _auto_generate_mapping(model_dir)
        # Re-check after generation
        from backend.services.expressions import _mapping_cache
        _mapping_cache.pop(model_id, None)
        mapping = get_expression_mapping(model_id)
        if mapping and any(v for v in mapping.values()):
            neutral = mapping.get("neutral", "neutral")
            return {"configured": True, "neutral": neutral}

    return {"configured": False, "neutral": "neutral"}
