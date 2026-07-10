"""Deterministic gear geometry calculations with no CAD/API dependencies."""

from __future__ import annotations

import math
from typing import Any


def _rounded(data: dict[str, Any], digits: int = 8) -> dict[str, Any]:
    return {
        key: round(value, digits) if isinstance(value, float) else value
        for key, value in data.items()
    }


def calculate_spur_external_geometry(
    module_mm: float,
    teeth: int,
    pressure_angle_deg: float,
    backlash_mm: float = 0.0,
    profile_shift: float = 0.0,
) -> dict[str, float]:
    module = float(module_mm)
    count = int(teeth)
    pressure_angle = math.radians(float(pressure_angle_deg))
    pitch_diameter = module * count
    shift_addition = 2.0 * module * float(profile_shift)
    addendum_diameter = pitch_diameter + 2.0 * module + shift_addition
    root_diameter = pitch_diameter - 2.5 * module + shift_addition
    circular_pitch = math.pi * module
    tooth_thickness = max(0.01, circular_pitch / 2.0 - float(backlash_mm))
    return _rounded({
        "module_mm": module,
        "teeth": count,
        "pressure_angle_deg": float(pressure_angle_deg),
        "pitch_diameter_mm": pitch_diameter,
        "base_diameter_mm": pitch_diameter * math.cos(pressure_angle),
        "addendum_diameter_mm": addendum_diameter,
        "root_diameter_mm": root_diameter,
        "circular_pitch_mm": circular_pitch,
        "tooth_thickness_at_pitch_mm": tooth_thickness,
        "outside_radius_mm": addendum_diameter / 2.0,
        "root_radius_mm": root_diameter / 2.0,
        "base_radius_mm": pitch_diameter * math.cos(pressure_angle) / 2.0,
        "pitch_radius_mm": pitch_diameter / 2.0,
    })


def calculate_spur_internal_geometry(
    module_mm: float,
    teeth: int,
    pressure_angle_deg: float,
    outer_diameter_mm: float,
    backlash_mm: float = 0.0,
    profile_shift: float = 0.0,
) -> dict[str, float]:
    """Return internal gear diameters using standard full-depth proportions.

    For internal teeth the addendum points inward and the root points outward.
    The names therefore describe the tooth feature, not the ring blank boundary.
    """
    module = float(module_mm)
    count = int(teeth)
    pressure_angle = math.radians(float(pressure_angle_deg))
    pitch_diameter = module * count
    shift = 2.0 * module * float(profile_shift)
    internal_addendum_diameter = pitch_diameter - 2.0 * module + shift
    internal_root_diameter = pitch_diameter + 2.5 * module + shift
    circular_pitch = math.pi * module
    wall = (float(outer_diameter_mm) - internal_root_diameter) / 2.0
    return _rounded({
        "module_mm": module,
        "teeth": count,
        "pressure_angle_deg": float(pressure_angle_deg),
        "pitch_diameter_mm": pitch_diameter,
        "base_diameter_mm": pitch_diameter * math.cos(pressure_angle),
        "addendum_diameter_mm": internal_addendum_diameter,
        "root_diameter_mm": internal_root_diameter,
        "internal_tip_diameter_mm": internal_addendum_diameter,
        "internal_root_diameter_mm": internal_root_diameter,
        "outer_diameter_mm": float(outer_diameter_mm),
        "minimum_wall_thickness_mm": wall,
        "circular_pitch_mm": circular_pitch,
        "tooth_space_at_pitch_mm": max(0.01, circular_pitch / 2.0 + float(backlash_mm)),
        "pitch_radius_mm": pitch_diameter / 2.0,
        "base_radius_mm": pitch_diameter * math.cos(pressure_angle) / 2.0,
        "internal_tip_radius_mm": internal_addendum_diameter / 2.0,
        "internal_root_radius_mm": internal_root_diameter / 2.0,
    })


def calculate_internal_pair_geometry(
    module_mm: float,
    pinion_teeth: int,
    ring_teeth: int,
    pressure_angle_deg: float,
) -> dict[str, float]:
    pinion_pitch = float(module_mm) * int(pinion_teeth)
    ring_pitch = float(module_mm) * int(ring_teeth)
    return _rounded({
        "module_mm": float(module_mm),
        "pressure_angle_deg": float(pressure_angle_deg),
        "pinion_pitch_diameter_mm": pinion_pitch,
        "ring_pitch_diameter_mm": ring_pitch,
        "center_distance_mm": (ring_pitch - pinion_pitch) / 2.0,
        "ratio": int(ring_teeth) / int(pinion_teeth),
        "pinion_teeth": int(pinion_teeth),
        "ring_teeth": int(ring_teeth),
    })


def calculate_helical_modules(module_mm: float, helix_angle_deg: float, module_type: str) -> dict[str, float]:
    angle = math.radians(float(helix_angle_deg))
    cosine = math.cos(angle)
    if module_type == "normal":
        normal_module = float(module_mm)
        transverse_module = normal_module / cosine
    else:
        transverse_module = float(module_mm)
        normal_module = transverse_module * cosine
    return _rounded({
        "normal_module_mm": normal_module,
        "transverse_module_mm": transverse_module,
        "helix_angle_deg": float(helix_angle_deg),
    })


def calculate_helical_external_geometry(
    module_mm: float,
    teeth: int,
    pressure_angle_deg: float,
    helix_angle_deg: float,
    module_type: str,
    backlash_mm: float = 0.0,
    profile_shift: float = 0.0,
) -> dict[str, float]:
    modules = calculate_helical_modules(module_mm, helix_angle_deg, module_type)
    geometry = calculate_spur_external_geometry(
        modules["transverse_module_mm"], teeth, pressure_angle_deg, backlash_mm, profile_shift
    )
    geometry.update(modules)
    geometry["input_module_mm"] = float(module_mm)
    geometry["module_type"] = module_type
    return geometry

