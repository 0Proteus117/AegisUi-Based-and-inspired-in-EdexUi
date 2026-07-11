"""External spur gear generator using real involute flanks and CadQuery."""

from __future__ import annotations

import importlib.util
import math

from aegis_gearlab.api.errors import CADBackendUnavailableError
from aegis_gearlab.cad.models import CADModelResult
from aegis_gearlab.core.involute import build_full_gear_profile, build_tooth_profile, rotate_points
from aegis_gearlab.core.validators import validate_spur_external
from aegis_gearlab.core.warnings import collect_common_warnings


def cad_backend_available() -> bool:
    return importlib.util.find_spec("cadquery") is not None


def require_cadquery():
    if not cad_backend_available():
        raise CADBackendUnavailableError(
            "CadQuery/OpenCascade is not installed for Aegis GearLab.",
            details={"setup": "Run tools/aegis-gearlab/setup_mac.sh"},
        )
    import cadquery as cq
    return cq


def build_external_profile(data, geometry: dict) -> list[tuple[float, float]]:
    return build_full_gear_profile(
        teeth=data.teeth,
        base_radius=geometry["base_radius_mm"],
        root_radius=geometry["root_radius_mm"],
        outside_radius=geometry["outside_radius_mm"],
        pitch_radius=geometry["pitch_radius_mm"],
        circular_pitch=geometry["circular_pitch_mm"],
        backlash=data.backlash_mm,
        num_points=data.number_of_profile_points,
    )


def build_external_solid(data, geometry: dict):
    cq = require_cadquery()
    profile = build_external_profile(data, geometry)
    tooth = build_tooth_profile(
        base_radius=geometry["base_radius_mm"],
        root_radius=geometry["root_radius_mm"],
        outside_radius=geometry["outside_radius_mm"],
        pitch_radius=geometry["pitch_radius_mm"],
        circular_pitch=geometry["circular_pitch_mm"],
        backlash=data.backlash_mm,
        num_points=data.number_of_profile_points,
    )
    point_count = data.number_of_profile_points
    pitch_angle = 2.0 * math.pi / data.teeth
    first_root = tooth[0]
    wire = cq.Workplane("XY").moveTo(*first_root)
    for index in range(data.teeth):
        angle = index * pitch_angle
        rotated = rotate_points(tooth, angle)
        left_root = rotated[0]
        left_flank = rotated[1:1 + point_count]
        right_flank = rotated[-(point_count + 1):-1]
        right_root = rotated[-1]
        if index > 0:
            wire = wire.radiusArc(left_root, geometry["root_radius_mm"])
        if math.dist(left_root, left_flank[0]) > 1e-7:
            wire = wire.lineTo(*left_flank[0])
        wire = wire.spline(left_flank[1:], includeCurrent=True)
        tip_mid = (
            geometry["outside_radius_mm"] * math.cos(angle),
            geometry["outside_radius_mm"] * math.sin(angle),
        )
        wire = wire.threePointArc(tip_mid, right_flank[0])
        wire = wire.spline(right_flank[1:], includeCurrent=True)
        if math.dist(right_flank[-1], right_root) > 1e-7:
            wire = wire.lineTo(*right_root)
    wire = wire.radiusArc(first_root, geometry["root_radius_mm"]).close()
    model = wire.extrude(data.face_width_mm)
    if data.bore_diameter_mm > 0:
        model = model.faces(">Z").workplane().hole(data.bore_diameter_mm)
    return model, profile


def generate_spur_external(data) -> CADModelResult:
    geometry = validate_spur_external(data)
    model, profile = build_external_solid(data, geometry)
    warnings = collect_common_warnings(data, geometry)
    return CADModelResult(
        model=model,
        profile=profile,
        geometry=geometry,
        warnings=warnings,
        metadata={"strategy": "real_involute_profile_extrusion", "cad_backend": "cadquery"},
    )
