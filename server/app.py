from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inference import predict_image

STATIC_DIR = Path(__file__).resolve().parent / "static"
DATA_DIR = ROOT / "data"
CONFIRMATIONS_PATH = DATA_DIR / "confirmations.jsonl"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}

app = FastAPI(title="Smart Chef", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class Confirmation(BaseModel):
    predicted: str | None = None
    predicted_display: str | None = None
    confidence: float | None = None
    confirmed_label: str = Field(min_length=1, max_length=120)
    confirmed_display: str = Field(min_length=1, max_length=120)
    is_custom: bool = False
    agreed_with_model: bool = False


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


@app.post("/api/confirm")
async def confirm(body: Confirmation) -> dict:
    label = body.confirmed_label.strip()
    display = body.confirmed_display.strip()
    if not label or not display:
        raise HTTPException(status_code=400, detail="Confirmed label is required.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        **body.model_dump(),
        "confirmed_label": label,
        "confirmed_display": display,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with CONFIRMATIONS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")

    return {"status": "ok", "confirmation": record}
