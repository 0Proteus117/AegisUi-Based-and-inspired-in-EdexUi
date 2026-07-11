"""Helical gear generation by lofting validated involute profiles."""

from __future__ import annotations

import math

from aegis_gearlab.cad.models import CADModelResult
from aegis_gearlab.cad.spur_external import require_cadquery
from aegis_gearlab.core.gear_math import calculate_helical_external_geometry
from aegis_gearlab.core.involute import build_full_gear_profile, rotate_points
from aegis_gearlab.core.warnings import collect_common_warnings


def _wire(cq, points, z: float):
    vectors = [cq.Vector(x, y, z) for x, y in points]
    return cq.Wire.makePolygon(vectors, close=True)


def build_helical_loft(data, geometry: dict, *, z_start: float = 0.0, z_end: float | None = None,
                       start_rotation_deg: float = 0.0, end_rotation_deg: float | None = None):
    cq = require_cadquery()
    width = data.face_width_mm if z_end is None else z_end - z_start
    pitch_radius = geometry["pitch_radius_mm"]
    helix = math.radians(abs(data.helix_angle_deg))
    direction = -1.0 if data.helix_hand == "left" else 1.0
    twist_deg = math.degrees(width * math.tan(helix) / max(pitch_radius, 0.001)) * direction
    final_rotation = start_rotation_deg + twist_deg if end_rotation_deg is None else end_rotation_deg
    profile = build_full_gear_profile(
        teeth=data.teeth,
        base_radius=geometry["base_radius_mm"],
        root_radius=geometry["root_radius_mm"],
        outside_radius=geometry["outside_radius_mm"],
        pitch_radius=geometry["pitch_radius_mm"],
        circular_pitch=geometry["circular_pitch_mm"],
        backlash=data.backlash_mm,
        num_points=data.number_of_profile_points,
    )
    bottom = rotate_points(profile, math.radians(start_rotation_deg))
    top = rotate_points(profile, math.radians(final_rotation))
    solid = cq.Solid.makeLoft([_wire(cq, bottom, z_start), _wire(cq, top, z_start + width)], False)
    model = cq.Workplane(obj=solid)
    if data.bore_diameter_mm > 0:
        bore = cq.Workplane("XY").workplane(offset=z_start).circle(data.bore_diameter_mm / 2.0).extrude(width)
        model = model.cut(bore)
    return model, profile, final_rotation


def generate_helical_external(data) -> CADModelResult:
    geometry = calculate_helical_external_geometry(
        data.module_mm, data.teeth, data.pressure_angle_deg, data.helix_angle_deg,
        data.module_type, data.backlash_mm, data.profile_shift,
    )
    margin = max(0.25, data.module_mm * 0.25)
    if data.bore_diameter_mm >= geometry["root_diameter_mm"] - margin:
        raise ValueError("Bore diameter is larger than root diameter with required margin.")
    model, profile, twist = build_helical_loft(data, geometry)
    warnings = collect_common_warnings(data, geometry, approximate=True)
    return CADModelResult(
        model=model,
        profile=profile,
        geometry={**geometry, "loft_twist_deg": twist},
        warnings=warnings,
        metadata={"strategy": "two_section_involute_loft", "cad_backend": "cadquery"},
    )

