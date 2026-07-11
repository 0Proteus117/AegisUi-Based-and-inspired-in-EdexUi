"""Thin FastAPI routes; geometry and CAD work stay in core/cad modules."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

from aegis_gearlab import __version__
from aegis_gearlab.api.errors import (
    ExportNotFoundError,
    GearLabError,
    InvalidParametersError,
    NotImplementedGeneratorError,
)
from aegis_gearlab.api.schemas import (
    BevelExternalInput,
    GenerationResponse,
    HelicalExternalInput,
    HerringboneExternalInput,
    InternalGearPairInput,
    PlanetarySetInput,
    RackPinionInput,
    SpurExternalInput,
    SpurInternalInput,
    WormGearInput,
)
from aegis_gearlab.cad.exporters import export_requested_formats
from aegis_gearlab.cad.gear_pair import generate_internal_gear_pair
from aegis_gearlab.cad.helical_external import generate_helical_external
from aegis_gearlab.cad.herringbone_external import generate_herringbone_external
from aegis_gearlab.cad.spur_external import cad_backend_available, generate_spur_external
from aegis_gearlab.cad.spur_internal import generate_spur_internal
from aegis_gearlab.core.constants import EXPORT_FORMATS, PRIMARY_FORMAT, SERVICE_NAME, SUPPORTED_GENERATORS
from aegis_gearlab.core.gear_types import gear_type_payload
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
        "gear_types": gear_type_payload(),
        "export_formats": sorted(EXPORT_FORMATS, key=("step", "stl", "dxf", "json_report").index),
        "primary_format": PRIMARY_FORMAT,
        "cad_backend": "cadquery" if cad_backend_available() else "unavailable",
    }


@router.get("/ui", response_class=HTMLResponse)
def standalone_ui() -> HTMLResponse:
    html_path = Path(__file__).resolve().parents[1] / "ui" / "templates" / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


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


def _planned_generator(name: str) -> None:
    raise NotImplementedGeneratorError(
        f"{name} is present in the standalone architecture but is not implemented in GearLab 0.1.0.",
        details={
            "generator": name,
            "status": "planned",
            "message": "No placeholder CAD is exported for unimplemented gear types.",
        },
    )


@router.post("/generate/bevel-external")
def generate_bevel_external_route(_data: BevelExternalInput) -> dict:
    _planned_generator("bevel_external")


@router.post("/generate/worm-gear")
def generate_worm_gear_route(_data: WormGearInput) -> dict:
    _planned_generator("worm_gear")


@router.post("/generate/rack-pinion")
def generate_rack_pinion_route(_data: RackPinionInput) -> dict:
    _planned_generator("rack_pinion")


@router.post("/generate/planetary-set")
def generate_planetary_set_route(_data: PlanetarySetInput) -> dict:
    if _data.ring_teeth != _data.sun_teeth + 2 * _data.planet_teeth:
        raise InvalidParametersError(
            "Basic planetary relation failed: ring_teeth should equal sun_teeth + 2 * planet_teeth.",
            details={
                "sun_teeth": _data.sun_teeth,
                "planet_teeth": _data.planet_teeth,
                "ring_teeth": _data.ring_teeth,
            },
        )
    _planned_generator("planetary_set")


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
