from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / ".env")

from inference import predict_image
from server.pantry import pantry
from server.recipes import suggest_recipes

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
    add_to_pantry: bool = True


class PantryAdd(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    label: str | None = None
    predicted: str | None = None
    confidence: float | None = None
    is_custom: bool = False


class RecipeRequest(BaseModel):
    ingredients: list[str] | None = None


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
        "predicted": body.predicted,
        "predicted_display": body.predicted_display,
        "confidence": body.confidence,
        "confirmed_label": label,
        "confirmed_display": display,
        "is_custom": body.is_custom,
        "agreed_with_model": body.agreed_with_model,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with CONFIRMATIONS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")

    pantry_item = None
    if body.add_to_pantry:
        pantry_item = pantry.add(
            display,
            label=label,
            predicted=body.predicted,
            confidence=body.confidence,
            is_custom=body.is_custom,
        )

    return {
        "status": "ok",
        "confirmation": record,
        "pantry_item": pantry_item,
        "pantry": pantry.list_items(),
    }


@app.get("/api/pantry")
def get_pantry() -> dict:
    return {"items": pantry.list_items()}


@app.post("/api/pantry/items")
def add_pantry_item(body: PantryAdd) -> dict:
    try:
        item = pantry.add(
            body.name,
            label=body.label,
            predicted=body.predicted,
            confidence=body.confidence,
            is_custom=body.is_custom,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item, "items": pantry.list_items()}


@app.delete("/api/pantry/items/{item_id}")
def delete_pantry_item(item_id: str) -> dict:
    if not pantry.remove(item_id):
        raise HTTPException(status_code=404, detail="Pantry item not found.")
    return {"status": "ok", "items": pantry.list_items()}


@app.delete("/api/pantry")
def clear_pantry() -> dict:
    pantry.clear()
    return {"status": "ok", "items": []}


@app.post("/api/recipes")
async def recipes(body: RecipeRequest | None = None) -> dict:
    ingredients = list(body.ingredients or []) if body else []
    if not ingredients:
        ingredients = pantry.names()
    try:
        return await suggest_recipes(ingredients)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
