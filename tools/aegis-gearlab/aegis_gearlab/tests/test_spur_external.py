from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from aegis_gearlab.cad.spur_external import cad_backend_available
from aegis_gearlab.main import app


client = TestClient(app)


def payload(**overrides):
    value = {
        "gear_name": "pinion_test",
        "module_mm": 2.0,
        "pressure_angle_deg": 20.0,
        "face_width_mm": 10.0,
        "backlash_mm": 0.08,
        "profile_shift": 0.0,
        "number_of_profile_points": 20,
        "teeth": 24,
        "bore_diameter_mm": 8.0,
        "export_formats": ["step", "json_report"],
    }
    value.update(overrides)
    return value


def test_spur_external_generates_or_reports_missing_backend():
    response = client.post("/generate/spur-external", json=payload())
    if cad_backend_available():
        assert response.status_code == 200, response.text
        files = response.json()["files"]
        assert "step" in files
        assert "json_report" in files
    else:
        assert response.status_code == 503
        assert response.json()["code"] == "CAD_BACKEND_UNAVAILABLE"


def test_large_bore_is_fatal():
    response = client.post("/generate/spur-external", json=payload(bore_diameter_mm=44.0))
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PARAMETERS"


def test_low_tooth_count_warning_when_backend_available():
    response = client.post(
        "/generate/spur-external",
        json=payload(teeth=10, bore_diameter_mm=2.0, export_formats=["json_report"]),
    )
    if cad_backend_available():
        assert response.status_code == 200, response.text
        codes = {item["code"] for item in response.json()["warnings"]}
        assert "LOW_TOOTH_COUNT" in codes
        assert "UNDERCUT_RISK" in codes
    else:
        assert response.status_code == 503

