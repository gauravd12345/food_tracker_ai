from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from threading import Lock


@dataclass
class PantryItem:
    id: str
    name: str
    label: str | None = None
    predicted: str | None = None
    confidence: float | None = None
    is_custom: bool = False
    added_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return asdict(self)


class PantryStore:
    """Process-local pantry for the current Smart Chef session."""

    def __init__(self) -> None:
        self._items: list[PantryItem] = []
        self._lock = Lock()

    def list_items(self) -> list[dict]:
        with self._lock:
            return [item.to_dict() for item in self._items]

    def add(
        self,
        name: str,
        *,
        label: str | None = None,
        predicted: str | None = None,
        confidence: float | None = None,
        is_custom: bool = False,
    ) -> dict:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("Ingredient name is required.")

        item = PantryItem(
            id=str(uuid.uuid4()),
            name=cleaned,
            label=label,
            predicted=predicted,
            confidence=confidence,
            is_custom=is_custom,
        )
        with self._lock:
            self._items.append(item)
        return item.to_dict()

    def remove(self, item_id: str) -> bool:
        with self._lock:
            before = len(self._items)
            self._items = [item for item in self._items if item.id != item_id]
            return len(self._items) < before

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def names(self) -> list[str]:
        with self._lock:
            return [item.name for item in self._items]


pantry = PantryStore()
