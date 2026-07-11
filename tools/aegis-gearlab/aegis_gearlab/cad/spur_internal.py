"""Internal spur ring generator."""

from __future__ import annotations

from types import SimpleNamespace

from aegis_gearlab.cad.models import CADModelResult
from aegis_gearlab.cad.spur_external import build_external_solid, require_cadquery
from aegis_gearlab.core.validators import validate_spur_internal
from aegis_gearlab.core.warnings import collect_common_warnings, thin_ring_warning


def generate_spur_internal(data) -> CADModelResult:
    cq = require_cadquery()
    geometry = validate_spur_internal(data)
    ring = cq.Workplane("XY").circle(data.outer_diameter_mm / 2.0).extrude(data.face_width_mm)

    cutter_geometry = {
        "base_radius_mm": geometry["base_radius_mm"],
        "root_radius_mm": geometry["internal_tip_radius_mm"],
        "outside_radius_mm": geometry["internal_root_radius_mm"],
        "pitch_radius_mm": geometry["pitch_radius_mm"],
        "circular_pitch_mm": geometry["circular_pitch_mm"],
    }
    cutter_input = SimpleNamespace(
        teeth=data.teeth,
        face_width_mm=data.face_width_mm + 0.2,
        bore_diameter_mm=0.0,
        backlash_mm=data.backlash_mm,
        number_of_profile_points=data.number_of_profile_points,
    )
    cutter, cutter_profile = build_external_solid(cutter_input, cutter_geometry)
    cutter = cutter.translate((0, 0, -0.1))
    model = ring.cut(cutter)
    warnings = collect_common_warnings(data, geometry)
    warnings.extend(thin_ring_warning(geometry["minimum_wall_thickness_mm"], data.module_mm))
    return CADModelResult(
        model=model,
        profile=cutter_profile,
        geometry=geometry,
        warnings=warnings,
        metadata={"strategy": "ring_blank_minus_involute_space_cutter", "cad_backend": "cadquery"},
    )

