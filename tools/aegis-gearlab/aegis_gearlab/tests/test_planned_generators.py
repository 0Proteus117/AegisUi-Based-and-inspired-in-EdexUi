from fastapi.testclient import TestClient

from aegis_gearlab.main import app


client = TestClient(app)


def test_planned_bevel_endpoint_is_honest_not_fake_success():
    response = client.post(
        "/generate/bevel-external",
        json={
            "gear_name": "bevel_demo",
            "module_mm": 2.0,
            "teeth": 32,
            "pressure_angle_deg": 20.0,
            "face_width_mm": 12.0,
            "pitch_cone_angle_deg": 45.0,
            "bore_diameter_mm": 8.0,
            "export_formats": ["step"],
        },
    )
    assert response.status_code == 501
    assert response.json()["code"] == "NOT_IMPLEMENTED"


def test_planetary_basic_relation_is_validated_before_planned_response():
    response = client.post(
        "/generate/planetary-set",
        json={
            "assembly_name": "bad_planetary",
            "module_mm": 1.5,
            "sun_teeth": 24,
            "planet_teeth": 18,
            "ring_teeth": 58,
            "planet_count": 3,
            "pressure_angle_deg": 20.0,
            "face_width_mm": 10.0,
            "export_formats": ["step"],
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PARAMETERS"
