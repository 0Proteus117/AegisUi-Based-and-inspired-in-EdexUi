"""Pydantic contracts for GearLab's public API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from aegis_gearlab.core.constants import EXPORT_FORMATS
from aegis_gearlab.core.validators import (
    validate_internal_pair,
    validate_spur_external,
    validate_spur_internal,
)


class GearBaseInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    gear_name: str = Field(min_length=1, max_length=80)
    module_mm: float = Field(gt=0)
    pressure_angle_deg: float = Field(ge=14.5, le=25.0)
    face_width_mm: float = Field(gt=0)
    backlash_mm: float = Field(default=0.0, ge=0)
    profile_shift: float = 0.0
    root_fillet_mm: float | None = Field(default=None, ge=0)
    number_of_profile_points: int = Field(default=24, ge=8, le=96)
    export_formats: list[str] = Field(default_factory=lambda: ["step"])

    @field_validator("export_formats")
    @classmethod
    def validate_export_formats(cls, value: list[str]) -> list[str]:
        formats = list(dict.fromkeys(str(item).lower() for item in value))
        invalid = sorted(set(formats) - EXPORT_FORMATS)
        if invalid:
            raise ValueError(f"Unsupported export formats: {', '.join(invalid)}")
        if not formats:
            raise ValueError("At least one export format is required.")
        return formats


class SpurExternalInput(GearBaseInput):
    teeth: int = Field(ge=8)
    bore_diameter_mm: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_geometry(self):
        validate_spur_external(self)
        return self


class SpurInternalInput(GearBaseInput):
    teeth: int = Field(ge=16)
    outer_diameter_mm: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_geometry(self):
        validate_spur_internal(self)
        return self


class InternalGearPairInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    assembly_name: str = Field(min_length=1, max_length=80)
    module_mm: float = Field(gt=0)
    pressure_angle_deg: float = Field(ge=14.5, le=25.0)
    face_width_mm: float = Field(gt=0)
    pinion_teeth: int = Field(ge=8)
    ring_teeth: int = Field(ge=16)
    pinion_bore_mm: float = Field(ge=0)
    ring_outer_diameter_mm: float = Field(gt=0)
    backlash_mm: float = Field(default=0.0, ge=0)
    profile_shift_pinion: float = 0.0
    profile_shift_ring: float = 0.0
    number_of_profile_points: int = Field(default=24, ge=8, le=96)
    export_formats: list[str] = Field(default_factory=lambda: ["step", "json_report"])
    export_mode: Literal["assembly_only", "parts_only", "assembly_and_parts"] = "assembly_and_parts"

    @field_validator("export_formats")
    @classmethod
    def validate_export_formats(cls, value: list[str]) -> list[str]:
        formats = list(dict.fromkeys(str(item).lower() for item in value))
        invalid = sorted(set(formats) - EXPORT_FORMATS)
        if invalid:
            raise ValueError(f"Unsupported export formats: {', '.join(invalid)}")
        if not formats:
            raise ValueError("At least one export format is required.")
        return formats

    @model_validator(mode="after")
    def validate_geometry(self):
        validate_internal_pair(self)
        return self


class HelicalExternalInput(SpurExternalInput):
    helix_angle_deg: float = Field(gt=-45, lt=45)
    helix_hand: Literal["left", "right"]
    module_type: Literal["normal", "transverse"] = "normal"

    @field_validator("helix_angle_deg")
    @classmethod
    def non_zero_helix(cls, value: float) -> float:
        if abs(value) < 0.1:
            raise ValueError("Helix angle must have magnitude of at least 0.1 degrees.")
        return value


class HerringboneExternalInput(HelicalExternalInput):
    center_gap_mm: float = Field(default=0.0, ge=0)
    continuous_v: bool = False

    @model_validator(mode="after")
    def validate_herringbone_width(self):
        if self.center_gap_mm >= self.face_width_mm:
            raise ValueError("Center gap must be smaller than face width.")
        return self


class WarningResponse(BaseModel):
    code: str
    severity: str
    message: str
    affected_parameter: str | None = None
    recommendation: str | None = None


class GenerationResponse(BaseModel):
    status: Literal["success"] = "success"
    generator: str
    name: str
    calculated_geometry: dict
    warnings: list[WarningResponse]
    files: dict[str, str]

