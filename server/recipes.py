from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)

SYSTEM_PROMPT = """You are Smart Chef, a practical home-cooking assistant.
Given a list of ingredients the user already has, suggest 3 recipes.
Prefer recipes that use as many of those ingredients as possible.
It is fine to need a few common pantry staples (salt, pepper, oil, water).
Keep recipes realistic for a home kitchen.

Respond with JSON only, no markdown, matching this schema:
{
  "recipes": [
    {
      "title": "string",
      "time_minutes": 30,
      "servings": 2,
      "ingredients_used": ["string"],
      "missing_ingredients": ["string"],
      "steps": ["string"]
    }
  ]
}
"""


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise
        return json.loads(match.group(0))


def _gemini_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates.")
    parts = candidates[0].get("content", {}).get("parts") or []
    chunks = [part.get("text", "") for part in parts if isinstance(part, dict)]
    text = "".join(chunks).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response.")
    return text


async def suggest_recipes(ingredients: list[str]) -> dict[str, Any]:
    cleaned = [item.strip() for item in ingredients if item and item.strip()]
    if not cleaned:
        raise ValueError("Add at least one ingredient before asking for recipes.")

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your environment or a .env file."
        )

    model = DEFAULT_MODEL
    user_prompt = (
        "Ingredients on hand:\n"
        + "\n".join(f"- {name}" for name in cleaned)
        + "\n\nSuggest 3 recipes."
    )

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "responseMimeType": "application/json",
        },
    }

    url = GEMINI_URL.format(model=model)
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, params={"key": api_key}, json=payload)
        if response.status_code >= 400:
            detail = response.text
            try:
                err = response.json().get("error", {})
                detail = err.get("message", detail)
            except Exception:  # noqa: BLE001
                pass
            raise RuntimeError(f"Gemini request failed: {detail}")
        data = response.json()

    content = _gemini_text(data)
    parsed = _extract_json(content)
    recipes = parsed.get("recipes")
    if not isinstance(recipes, list) or not recipes:
        raise RuntimeError("Model returned no recipes.")

    return {
        "ingredients": cleaned,
        "recipes": recipes,
        "model": model,
    }
