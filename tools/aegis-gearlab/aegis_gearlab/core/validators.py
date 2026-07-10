"""Domain validation used by schemas and CAD generators."""

from __future__ import annotations

from aegis_gearlab.core.constants import MIN_RING_WALL_MODULES
from aegis_gearlab.core.gear_math import (
    calculate_internal_pair_geometry,
    calculate_spur_external_geometry,
    calculate_spur_internal_geometry,
)


def validate_spur_external(data) -> dict[str, float]:
    geometry = calculate_spur_external_geometry(
        data.module_mm, data.teeth, data.pressure_angle_deg, data.backlash_mm, data.profile_shift
    )
    margin = max(0.25, data.module_mm * 0.25)
    if data.bore_diameter_mm >= geometry["root_diameter_mm"] - margin:
        raise ValueError("Bore diameter is larger than root diameter with required margin.")
    return geometry


def validate_spur_internal(data) -> dict[str, float]:
    geometry = calculate_spur_internal_geometry(
        data.module_mm, data.teeth, data.pressure_angle_deg, data.outer_diameter_mm,
        data.backlash_mm, data.profile_shift,
    )
    required_wall = data.module_mm * MIN_RING_WALL_MODULES
    if geometry["minimum_wall_thickness_mm"] < required_wall:
        raise ValueError(
            f"Outer diameter is insufficient: ring wall must be at least {required_wall:.3f} mm."
        )
    return geometry


def validate_internal_pair(data) -> dict[str, float]:
    if data.ring_teeth <= data.pinion_teeth:
        raise ValueError("Ring gear tooth count must be greater than pinion tooth count.")
    geometry = calculate_internal_pair_geometry(
        data.module_mm, data.pinion_teeth, data.ring_teeth, data.pressure_angle_deg
    )
    if geometry["center_distance_mm"] <= 0:
        raise ValueError("Calculated center distance must be positive.")
    pinion_geometry = calculate_spur_external_geometry(
        data.module_mm, data.pinion_teeth, data.pressure_angle_deg,
        data.backlash_mm, data.profile_shift_pinion,
    )
    if data.pinion_bore_mm >= pinion_geometry["root_diameter_mm"] - data.module_mm * 0.25:
        raise ValueError("Pinion bore diameter is larger than root diameter with required margin.")
    ring_geometry = calculate_spur_internal_geometry(
        data.module_mm, data.ring_teeth, data.pressure_angle_deg, data.ring_outer_diameter_mm,
        data.backlash_mm, data.profile_shift_ring,
    )
    if ring_geometry["minimum_wall_thickness_mm"] < data.module_mm * MIN_RING_WALL_MODULES:
        raise ValueError("Ring outer diameter is insufficient for the minimum structural wall.")
    return {**geometry, "pinion": pinion_geometry, "ring": ring_geometry}

