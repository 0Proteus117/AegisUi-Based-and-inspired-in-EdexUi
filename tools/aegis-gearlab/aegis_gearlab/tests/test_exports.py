import json

from aegis_gearlab.core.constants import REPORT_DISCLAIMER
from aegis_gearlab.reports.json_report import build_json_report_data, write_json_report
from aegis_gearlab.storage.file_manager import resolve_export, sanitize_name


def test_json_report_includes_strength_disclaimer(tmp_path):
    data = build_json_report_data(
        name="test",
        generator="spur_external",
        parameters={"module_mm": 2},
        geometry={"pitch_diameter_mm": 48},
        warnings=[],
    )
    path = write_json_report(data, tmp_path / "report.json")
    payload = json.loads(path.read_text())
    assert payload["note"] == REPORT_DISCLAIMER
    assert "strength/contact stress" in payload["note"]


def test_safe_filename_sanitization():
    assert sanitize_name("../../DQ ring gear") == "DQ_ring_gear"


def test_export_path_traversal_is_rejected(tmp_path):
    try:
        resolve_export("../secret", tmp_path)
    except ValueError:
        pass
    else:
        raise AssertionError("path traversal was accepted")

