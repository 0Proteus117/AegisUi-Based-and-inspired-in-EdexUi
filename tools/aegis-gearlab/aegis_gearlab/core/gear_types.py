"""Supported GearLab generator identifiers.

This module is intentionally pure data so API, docs and future UI layers can
share generator names without importing CAD code.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GearType:
    id: str
    title: str
    status: str
    description: str


GEAR_TYPES: tuple[GearType, ...] = (
    GearType("spur_external", "Spur external", "implemented", "External involute spur gear."),
    GearType("spur_internal", "Spur internal", "implemented", "Internal ring gear."),
    GearType("internal_gear_pair", "Internal gear pair", "implemented", "External pinion plus internal ring."),
    GearType("helical_external", "Helical external", "partial", "Helical approximation using rotated profiles."),
    GearType("herringbone_external", "Herringbone external", "partial", "Opposed helical halves."),
    GearType("bevel_external", "Bevel external", "planned", "Conical gear geometry."),
    GearType("worm_gear", "Worm gear", "planned", "Worm and wheel set."),
    GearType("rack_pinion", "Rack and pinion", "planned", "Linear rack plus spur pinion."),
    GearType("planetary_set", "Planetary set", "planned", "Sun, planets and internal ring set."),
)


def gear_type_payload() -> list[dict[str, str]]:
    return [item.__dict__.copy() for item in GEAR_TYPES]
