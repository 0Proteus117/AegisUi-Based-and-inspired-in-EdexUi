import pytest
from pydantic import ValidationError

from aegis_gearlab.api.schemas import SpurExternalInput
from aegis_gearlab.core.gear_math import (
    calculate_helical_modules,
    calculate_internal_pair_geometry,
    calculate_spur_external_geometry,
)
from aegis_gearlab.core.involute import generate_involute_flank


def test_spur_geometry_math():
    geometry = calculate_spur_external_geometry(2.0, 24, 20.0)
    assert geometry["pitch_diameter_mm"] == 48.0
    assert geometry["addendum_diameter_mm"] == 52.0
    assert geometry["root_diameter_mm"] == 43.0


def test_pair_center_distance():
    geometry = calculate_internal_pair_geometry(2.0, 20, 60, 20.0)
    assert geometry["center_distance_mm"] == 40.0
    assert geometry["ratio"] == 3.0


def test_normal_to_transverse_module():
    modules = calculate_helical_modules(2.0, 30.0, "normal")
    assert modules["transverse_module_mm"] == pytest.approx(2.30940108)


def test_involute_radius_increases():
    points = generate_involute_flank(20.0, 20.0, 25.0, 16)
    radii = [(x * x + y * y) ** 0.5 for x, y in points]
    assert radii == sorted(radii)
    assert radii[-1] == pytest.approx(25.0)


def test_invalid_export_format_rejected():
    with pytest.raises(ValidationError):
        SpurExternalInput(
            gear_name="bad",
            module_mm=2,
            pressure_angle_deg=20,
            face_width_mm=10,
            teeth=24,
            bore_diameter_mm=8,
            export_formats=["obj"],
        )

