from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inference import predict_image

STATIC_DIR = Path(__file__).resolve().parent / "static"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}

app = FastAPI(title="Smart Chef", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/classes")
def classes() -> dict:
    from inference.labels import CLASS_NAMES, DISPLAY_NAMES

    return {
        "classes": [
            {"label": name, "display_name": DISPLAY_NAMES.get(name, name.title())}
            for name in CLASS_NAMES
        ]
    }


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)) -> dict:
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Please upload a JPEG, PNG, WebP, GIF, or BMP image.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        from io import BytesIO

        result = predict_image(BytesIO(data), top_k=5)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not classify image: {exc}") from exc

    return result
