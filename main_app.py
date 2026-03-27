import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.api.chat import router as chat_router
from backend.api.tts import router as tts_router
from backend.api.characters import router as characters_router
from backend.api.expressions import router as expressions_router

app = FastAPI(title="MeuxCompanion")

# CORS for dev mode (React on port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(chat_router)
app.include_router(tts_router)
app.include_router(characters_router)
app.include_router(expressions_router)

# Serve Live2D models as static files
models_dir = Path(__file__).parent / "models" / "live2d"
if models_dir.exists():
    app.mount("/static/live2d", StaticFiles(directory=str(models_dir)), name="live2d")

# Serve VRM models as static files
vrm_dir = Path(__file__).parent / "models" / "vrm"
if vrm_dir.exists():
    app.mount("/static/vrm", StaticFiles(directory=str(vrm_dir)), name="vrm")

# Serve built frontend in production
frontend_dist = Path(__file__).parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
