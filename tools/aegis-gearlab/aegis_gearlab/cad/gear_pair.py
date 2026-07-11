"""Internal ring and external pinion assembly generation."""

from __future__ import annotations

from types import SimpleNamespace

from aegis_gearlab.cad.models import CADAssemblyResult
from aegis_gearlab.cad.spur_external import generate_spur_external, require_cadquery
from aegis_gearlab.cad.spur_internal import generate_spur_internal
from aegis_gearlab.core.validators import validate_internal_pair
from aegis_gearlab.core.warnings import pair_warnings


def generate_internal_gear_pair(data) -> CADAssemblyResult:
    cq = require_cadquery()
    geometry = validate_internal_pair(data)
    pinion_input = SimpleNamespace(
        gear_name=f"{data.assembly_name}_pinion",
        module_mm=data.module_mm,
        pressure_angle_deg=data.pressure_angle_deg,
        face_width_mm=data.face_width_mm,
        backlash_mm=data.backlash_mm,
        profile_shift=data.profile_shift_pinion,
        root_fillet_mm=None,
        number_of_profile_points=data.number_of_profile_points,
        export_formats=data.export_formats,
        teeth=data.pinion_teeth,
        bore_diameter_mm=data.pinion_bore_mm,
    )
    ring_input = SimpleNamespace(
        gear_name=f"{data.assembly_name}_ring",
        module_mm=data.module_mm,
        pressure_angle_deg=data.pressure_angle_deg,
        face_width_mm=data.face_width_mm,
        backlash_mm=data.backlash_mm,
        profile_shift=data.profile_shift_ring,
        root_fillet_mm=None,
        number_of_profile_points=data.number_of_profile_points,
        export_formats=data.export_formats,
        teeth=data.ring_teeth,
        outer_diameter_mm=data.ring_outer_diameter_mm,
    )
    pinion = generate_spur_external(pinion_input)
    ring = generate_spur_internal(ring_input)
    shifted_pinion = pinion.model.translate((geometry["center_distance_mm"], 0, 0))
    assembly = cq.Assembly(name=data.assembly_name)
    assembly.add(ring.model, name="ring")
    assembly.add(shifted_pinion, name="pinion")
    warnings = [*pinion.warnings, *ring.warnings, *pair_warnings(data.pinion_teeth, data.ring_teeth)]
    return CADAssemblyResult(
        assembly=assembly,
        parts={"ring": ring.model, "pinion": shifted_pinion},
        profiles={"ring": ring.profile, "pinion": pinion.profile},
        geometry=geometry,
        warnings=warnings,
        metadata={"strategy": "positioned_cadquery_assembly", "export_mode": data.export_mode},
    )

