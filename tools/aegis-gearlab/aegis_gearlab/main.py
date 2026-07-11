"""Aegis GearLab local-only FastAPI entry point."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from aegis_gearlab import __version__
from aegis_gearlab.api.errors import GearLabError
from aegis_gearlab.api.routes import router
from aegis_gearlab.core.constants import SERVICE_NAME
from aegis_gearlab.storage.file_manager import ensure_export_directory

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("aegis_gearlab")

app = FastAPI(title=SERVICE_NAME, version=__version__, docs_url="/docs", redoc_url="/redoc")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(router)

UI_ROOT = Path(__file__).resolve().parent / "ui"
app.mount("/ui/static", StaticFiles(directory=UI_ROOT / "static"), name="gearlab-ui-static")


@app.on_event("startup")
def prepare_storage() -> None:
    export_dir = ensure_export_directory()
    logger.info("GearLab exports: %s", export_dir)


@app.exception_handler(GearLabError)
async def gearlab_error_handler(_request: Request, error: GearLabError):
    return JSONResponse(status_code=error.status_code, content=error.payload())


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, error: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "code": "INVALID_PARAMETERS",
            "message": "Request parameters failed validation.",
            "details": {"errors": jsonable_encoder(error.errors())},
        },
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_request: Request, error: Exception):
    logger.exception("Unhandled GearLab error")
    return JSONResponse(
        status_code=500,
        content={"status": "error", "code": "ERROR", "message": str(error), "details": {}},
    )
