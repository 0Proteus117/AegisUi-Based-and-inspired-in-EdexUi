"""Typed service errors and FastAPI-compatible error payloads."""

from __future__ import annotations


class GearLabError(Exception):
    code = "ERROR"
    status_code = 400

    def __init__(self, message: str, *, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def payload(self) -> dict:
        return {
            "status": "error",
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


class InvalidParametersError(GearLabError):
    code = "INVALID_PARAMETERS"
    status_code = 422


class CADBackendUnavailableError(GearLabError):
    code = "CAD_BACKEND_UNAVAILABLE"
    status_code = 503


class ExportFailedError(GearLabError):
    code = "EXPORT_FAILED"
    status_code = 500


class NotImplementedGeneratorError(GearLabError):
    code = "NOT_IMPLEMENTED"
    status_code = 501


class ExportNotFoundError(GearLabError):
    code = "EXPORT_NOT_FOUND"
    status_code = 404

