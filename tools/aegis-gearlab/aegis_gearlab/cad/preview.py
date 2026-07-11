"""CAD-independent preview metadata consumed by future UIs."""

from __future__ import annotations


def radial_preview_data(geometry: dict) -> dict:
    return {
        "pitch_radius_mm": geometry.get("pitch_radius_mm"),
        "base_radius_mm": geometry.get("base_radius_mm"),
        "root_radius_mm": geometry.get("root_radius_mm", geometry.get("internal_tip_radius_mm")),
        "outside_radius_mm": geometry.get("outside_radius_mm", geometry.get("internal_root_radius_mm")),
        "teeth": geometry.get("teeth"),
    }

