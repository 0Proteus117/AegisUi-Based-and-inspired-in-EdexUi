"""Central STEP-first export implementation."""

from __future__ import annotations

import json
from pathlib import Path

from aegis_gearlab.api.errors import CADBackendUnavailableError, ExportFailedError
from aegis_gearlab.reports.json_report import write_json_report
from aegis_gearlab.storage.file_manager import (
    assert_non_empty,
    relative_api_path,
    unique_export_path,
)


def _cadquery():
    try:
        import cadquery as cq
        return cq
    except ImportError as error:
        raise CADBackendUnavailableError("CadQuery/OpenCascade is unavailable.") from error


def export_step(model, path: Path) -> Path:
    cq = _cadquery()
    try:
        cq.exporters.export(model, str(path), exportType="STEP")
        assert_non_empty(path)
        return path
    except Exception as error:
        raise ExportFailedError("STEP export failed.", details={"error": str(error)}) from error


def export_stl(model, path: Path) -> Path:
    cq = _cadquery()
    try:
        cq.exporters.export(model, str(path), exportType="STL")
        assert_non_empty(path)
        return path
    except Exception as error:
        raise ExportFailedError("STL export failed.", details={"error": str(error)}) from error


def export_dxf(profile: list[tuple[float, float]], path: Path) -> Path:
    cq = _cadquery()
    try:
        wire = cq.Workplane("XY").polyline(profile).close()
        cq.exporters.export(wire, str(path), exportType="DXF")
        assert_non_empty(path)
        return path
    except Exception as error:
        raise ExportFailedError("DXF export failed.", details={"error": str(error)}) from error


def export_json_report(data: dict, path: Path) -> Path:
    try:
        write_json_report(data, path)
        assert_non_empty(path)
        return path
    except Exception as error:
        raise ExportFailedError("JSON report export failed.", details={"error": str(error)}) from error


def export_requested_formats(
    model,
    profile: list[tuple[float, float]],
    report_data: dict,
    requested_formats: list[str],
    *,
    name: str,
) -> dict[str, str]:
    files: dict[str, str] = {}
    ordered_formats = [item for item in requested_formats if item != "json_report"]
    for export_format in ordered_formats:
        if export_format == "step":
            path = export_step(model, unique_export_path(name, "step"))
        elif export_format == "stl":
            path = export_stl(model, unique_export_path(name, "stl"))
        elif export_format == "dxf":
            path = export_dxf(profile, unique_export_path(name, "dxf"))
        else:
            raise ExportFailedError(f"Unsupported export format reached exporter: {export_format}")
        files[export_format] = relative_api_path(path)
    if "json_report" in requested_formats:
        report_data["exported_files"] = dict(files)
        path = export_json_report(report_data, unique_export_path(f"{name}_report", "json"))
        files["json_report"] = relative_api_path(path)
    return files
