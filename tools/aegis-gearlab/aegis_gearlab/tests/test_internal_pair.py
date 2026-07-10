from aegis_gearlab.api.schemas import InternalGearPairInput
from aegis_gearlab.core.validators import validate_internal_pair


def test_internal_pair_calculates_center_distance():
    data = InternalGearPairInput(
        assembly_name="pair_test",
        module_mm=2.0,
        pressure_angle_deg=20.0,
        face_width_mm=12.0,
        pinion_teeth=20,
        ring_teeth=60,
        pinion_bore_mm=8.0,
        ring_outer_diameter_mm=140.0,
        backlash_mm=0.08,
        number_of_profile_points=20,
        export_formats=["step"],
        export_mode="assembly_and_parts",
    )
    geometry = validate_internal_pair(data)
    assert geometry["center_distance_mm"] == 40.0
    assert geometry["ratio"] == 3.0

