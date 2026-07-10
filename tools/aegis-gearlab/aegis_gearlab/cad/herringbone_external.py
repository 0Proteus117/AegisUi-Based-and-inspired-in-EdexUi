"""Herringbone gear from opposing helical involute lofts."""

from __future__ import annotations

from types import SimpleNamespace

from aegis_gearlab.cad.helical_external import build_helical_loft
from aegis_gearlab.cad.models import CADModelResult
from aegis_gearlab.core.gear_math import calculate_helical_external_geometry
from aegis_gearlab.core.warnings import collect_common_warnings, herringbone_warnings


def generate_herringbone_external(data) -> CADModelResult:
    geometry = calculate_helical_external_geometry(
        data.module_mm, data.teeth, data.pressure_angle_deg, data.helix_angle_deg,
        data.module_type, data.backlash_mm, data.profile_shift,
    )
    usable_width = data.face_width_mm - data.center_gap_mm
    half_width = usable_width / 2.0
    if half_width <= 0:
        raise ValueError("Herringbone half-width must be positive.")
    half_values = data.model_dump()
    half_values["face_width_mm"] = half_width
    half = SimpleNamespace(**half_values)
    first, profile, midpoint_rotation = build_helical_loft(half, geometry, z_start=0.0, z_end=half_width)
    opposite_hand = "left" if data.helix_hand == "right" else "right"
    second_values = data.model_dump()
    second_values.update({"face_width_mm": half_width, "helix_hand": opposite_hand})
    second_data = SimpleNamespace(**second_values)
    second_start = half_width + data.center_gap_mm
    second, _, _ = build_helical_loft(
        second_data,
        geometry,
        z_start=second_start,
        z_end=second_start + half_width,
        start_rotation_deg=midpoint_rotation if data.continuous_v else 0.0,
        end_rotation_deg=0.0 if data.continuous_v else None,
    )
    model = first.union(second)
    warnings = collect_common_warnings(data, geometry, approximate=True)
    warnings.extend(herringbone_warnings(data.continuous_v))
    return CADModelResult(
        model=model,
        profile=profile,
        geometry={
            **geometry,
            "center_gap_mm": data.center_gap_mm,
            "half_face_width_mm": half_width,
            "continuous_v": data.continuous_v,
        },
        warnings=warnings,
        metadata={"strategy": "opposed_two_section_involute_lofts", "cad_backend": "cadquery"},
    )
