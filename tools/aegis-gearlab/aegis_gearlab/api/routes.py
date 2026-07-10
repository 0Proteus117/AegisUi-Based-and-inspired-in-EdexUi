"""Thin FastAPI routes; geometry and CAD work stay in core/cad modules."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from aegis_gearlab import __version__
from aegis_gearlab.api.errors import ExportNotFoundError, GearLabError, InvalidParametersError
from aegis_gearlab.api.schemas import (
    GenerationResponse,
    HelicalExternalInput,
    HerringboneExternalInput,
    InternalGearPairInput,
    SpurExternalInput,
    SpurInternalInput,
)
from aegis_gearlab.cad.exporters import export_requested_formats
from aegis_gearlab.cad.gear_pair import generate_internal_gear_pair
from aegis_gearlab.cad.helical_external import generate_helical_external
from aegis_gearlab.cad.herringbone_external import generate_herringbone_external
from aegis_gearlab.cad.spur_external import cad_backend_available, generate_spur_external
from aegis_gearlab.cad.spur_internal import generate_spur_internal
from aegis_gearlab.core.constants import EXPORT_FORMATS, PRIMARY_FORMAT, SERVICE_NAME, SUPPORTED_GENERATORS
from aegis_gearlab.reports.json_report import build_json_report_data
from aegis_gearlab.storage.file_manager import cleanup_exports, resolve_export

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": SERVICE_NAME, "version": __version__}


@router.get("/capabilities")
def capabilities() -> dict:
    return {
        "supported_generators": list(SUPPORTED_GENERATORS),
        "export_formats": sorted(EXPORT_FORMATS, key=("step", "stl", "dxf", "json_report").index),
        "primary_format": PRIMARY_FORMAT,
        "cad_backend": "cadquery" if cad_backend_available() else "unavailable",
    }


def _generation_response(generator: str, name: str, data, result) -> dict:
    parameters = data.model_dump(mode="json")
    report = build_json_report_data(
        name=name,
        generator=generator,
        parameters=parameters,
        geometry=result.geometry,
        warnings=result.warnings,
    )
    files = export_requested_formats(
        result.model, result.profile, report, data.export_formats, name=name
    )
    if "json_report" in files:
        report["exported_files"] = files
    return GenerationResponse(
        generator=generator,
        name=name,
        calculated_geometry=result.geometry,
        warnings=result.warnings,
        files=files,
    ).model_dump(mode="json")


def _run(generator: str, name: str, data, function) -> dict:
    try:
        result = function(data)
        return _generation_response(generator, name, data, result)
    except GearLabError:
        raise
    except ValueError as error:
        raise InvalidParametersError(str(error)) from error


@router.post("/generate/spur-external")
def generate_spur_external_route(data: SpurExternalInput) -> dict:
    return _run("spur_external", data.gear_name, data, generate_spur_external)


@router.post("/generate/spur-internal")
def generate_spur_internal_route(data: SpurInternalInput) -> dict:
    return _run("spur_internal", data.gear_name, data, generate_spur_internal)


@router.post("/generate/helical-external")
def generate_helical_external_route(data: HelicalExternalInput) -> dict:
    return _run("helical_external", data.gear_name, data, generate_helical_external)


@router.post("/generate/herringbone-external")
def generate_herringbone_external_route(data: HerringboneExternalInput) -> dict:
    return _run("herringbone_external", data.gear_name, data, generate_herringbone_external)


@router.post("/generate/internal-gear-pair")
def generate_internal_pair_route(data: InternalGearPairInput) -> dict:
    try:
        result = generate_internal_gear_pair(data)
        report = build_json_report_data(
            name=data.assembly_name,
            generator="internal_gear_pair",
            parameters=data.model_dump(mode="json"),
            geometry=result.geometry,
            warnings=result.warnings,
        )
        profile = result.profiles.get("pinion", [])
        files = export_requested_formats(
            result.assembly, profile, report, data.export_formats, name=data.assembly_name
        )
        return GenerationResponse(
            generator="internal_gear_pair",
            name=data.assembly_name,
            calculated_geometry=result.geometry,
            warnings=result.warnings,
            files=files,
        ).model_dump(mode="json")
    except GearLabError:
        raise
    except ValueError as error:
        raise InvalidParametersError(str(error)) from error


@router.get("/exports/{filename}")
def get_export(filename: str):
    try:
        path = resolve_export(filename)
    except ValueError as error:
        raise ExportNotFoundError(str(error)) from error
    if not path.is_file() or path.stat().st_size <= 0:
        raise ExportNotFoundError("Requested export does not exist.", details={"filename": filename})
    return FileResponse(path, filename=path.name, media_type="application/octet-stream")


@router.post("/cleanup/exports")
def cleanup_export_files(max_age_hours: int = 168) -> dict:
    removed = cleanup_exports(max_age_hours=max_age_hours)
    return {"status": "success", "removed": removed, "count": len(removed)}

