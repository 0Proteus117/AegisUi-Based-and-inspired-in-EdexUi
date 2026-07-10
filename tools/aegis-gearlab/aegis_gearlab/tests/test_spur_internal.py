from fastapi.testclient import TestClient

from aegis_gearlab.cad.spur_external import cad_backend_available
from aegis_gearlab.main import app


client = TestClient(app)


def test_thin_internal_ring_is_fatal():
    response = client.post("/generate/spur-internal", json={
        "gear_name": "ring_bad",
        "module_mm": 2.0,
        "pressure_angle_deg": 20.0,
        "face_width_mm": 12.0,
        "teeth": 60,
        "outer_diameter_mm": 128.0,
        "export_formats": ["step"],
    })
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PARAMETERS"


def test_valid_internal_ring_contract():
    response = client.post("/generate/spur-internal", json={
        "gear_name": "ring_test",
        "module_mm": 2.0,
        "pressure_angle_deg": 20.0,
        "face_width_mm": 12.0,
        "teeth": 60,
        "outer_diameter_mm": 140.0,
        "export_formats": ["json_report"],
    })
    assert response.status_code == (200 if cad_backend_available() else 503)

