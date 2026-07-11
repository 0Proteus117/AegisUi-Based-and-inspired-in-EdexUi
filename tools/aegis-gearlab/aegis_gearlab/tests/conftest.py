from fastapi.testclient import TestClient

from aegis_gearlab.main import app


def client() -> TestClient:
    return TestClient(app)

