"""Small explicit unit helpers. GearLab's public API uses millimetres/degrees."""

from __future__ import annotations

import math


def degrees_to_radians(value: float) -> float:
    return math.radians(float(value))


def millimetres_to_metres(value: float) -> float:
    return float(value) / 1000.0


def radians_to_degrees(value: float) -> float:
    return math.degrees(float(value))

