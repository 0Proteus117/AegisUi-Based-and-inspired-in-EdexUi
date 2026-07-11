"""CAD result containers keep CAD objects out of the API layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CADModelResult:
    model: Any
    profile: list[tuple[float, float]]
    geometry: dict
    warnings: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class CADAssemblyResult:
    assembly: Any
    parts: dict[str, Any]
    profiles: dict[str, list[tuple[float, float]]]
    geometry: dict
    warnings: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

