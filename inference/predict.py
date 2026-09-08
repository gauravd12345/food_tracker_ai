from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import BinaryIO

import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

from .labels import CLASS_NAMES, DISPLAY_NAMES
from .model import GroceryCNN

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WEIGHTS = ROOT / "models" / "grocery_cnn.pth"

_preprocess = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
    ]
)


@lru_cache(maxsize=1)
def load_model(weights_path: str | None = None) -> tuple[GroceryCNN, torch.device]:
    path = Path(weights_path) if weights_path else DEFAULT_WEIGHTS
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = GroceryCNN(num_classes=len(CLASS_NAMES))
    state = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model, device


def _open_image(source: Image.Image | Path | str | BinaryIO) -> Image.Image:
    if isinstance(source, Image.Image):
        return source.convert("RGB")
    return Image.open(source).convert("RGB")


def predict_image(
    source: Image.Image | Path | str | BinaryIO,
    *,
    top_k: int = 5,
    weights_path: str | None = None,
) -> dict:
    model, device = load_model(weights_path)
    image = _open_image(source)
    tensor = _preprocess(image).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(tensor)
        probs = F.softmax(logits, dim=1)[0]

    k = min(top_k, len(CLASS_NAMES))
    values, indices = torch.topk(probs, k)

    predictions = []
    for score, idx in zip(values.tolist(), indices.tolist()):
        label = CLASS_NAMES[idx]
        predictions.append(
            {
                "label": label,
                "display_name": DISPLAY_NAMES.get(label, label.title()),
                "confidence": round(score, 4),
            }
        )

    top = predictions[0]
    return {
        "prediction": top["label"],
        "display_name": top["display_name"],
        "confidence": top["confidence"],
        "top_k": predictions,
    }
