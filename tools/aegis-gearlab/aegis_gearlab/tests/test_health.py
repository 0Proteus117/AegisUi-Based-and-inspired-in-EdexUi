from fastapi.testclient import TestClient

from aegis_gearlab.main import app


client = TestClient(app)


def test_health_is_local_service():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "Aegis GearLab API",
        "version": "0.1.0",
    }


def test_capabilities_are_explicit():
    payload = client.get("/capabilities").json()
    assert payload["primary_format"] == "step"
    assert "spur_external" in payload["supported_generators"]
    assert "internal_gear_pair" in payload["supported_generators"]
    assert payload["export_formats"] == ["step", "stl", "dxf", "json_report"]

