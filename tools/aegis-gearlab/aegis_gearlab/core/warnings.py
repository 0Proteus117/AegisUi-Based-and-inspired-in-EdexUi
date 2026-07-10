"""Non-fatal engineering warnings kept distinct from generation errors."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class GearWarning:
    code: str
    severity: str
    message: str
    affected_parameter: str | None = None
    recommendation: str | None = None

    def to_dict(self) -> dict[str, str]:
        return {key: value for key, value in asdict(self).items() if value is not None}


def collect_common_warnings(data, geometry: dict[str, float], approximate: bool = False) -> list[dict[str, str]]:
    warnings: list[GearWarning] = []
    teeth = int(getattr(data, "teeth", getattr(data, "pinion_teeth", 100)))
    module = float(getattr(data, "module_mm", 1.0))
    face_width = float(getattr(data, "face_width_mm", 1.0))
    backlash = float(getattr(data, "backlash_mm", 0.0))
    profile_shift = float(getattr(data, "profile_shift", getattr(data, "profile_shift_pinion", 0.0)))
    if teeth < 18:
        warnings.append(GearWarning(
            "LOW_TOOTH_COUNT", "warning",
            "Gear has a low tooth count and may require profile shift to reduce undercut risk.",
            "teeth", "Review profile shift and undercut with professional gear software."
        ))
    if teeth < 17 and profile_shift <= 0:
        warnings.append(GearWarning(
            "UNDERCUT_RISK", "warning",
            "Standard full-depth geometry has elevated undercut risk at this tooth count.",
            "profile_shift", "Consider positive profile shift and verify contact ratio."
        ))
    if face_width > module * 20:
        warnings.append(GearWarning(
            "EXCESSIVE_FACE_WIDTH_FOR_MODULE", "warning",
            "Face width is high relative to module.", "face_width_mm",
            "Review alignment, manufacturing tolerance and load distribution."
        ))
    if backlash == 0:
        warnings.append(GearWarning(
            "ZERO_BACKLASH", "warning", "Zero backlash was requested.", "backlash_mm",
            "Add manufacturing and operating clearance before production."
        ))
    elif backlash > module * 0.25:
        warnings.append(GearWarning(
            "HIGH_BACKLASH", "warning", "Backlash is high relative to module.", "backlash_mm",
            "Confirm the intended fit and tooth thickness."
        ))
    helix_angle = abs(float(getattr(data, "helix_angle_deg", 0.0)))
    if helix_angle > 30:
        warnings.append(GearWarning(
            "HIGH_HELIX_ANGLE", "warning", "High helix angle increases axial load and manufacturing complexity.",
            "helix_angle_deg", "Review bearings, axial load and cutter strategy."
        ))
    if approximate:
        warnings.append(GearWarning(
            "APPROXIMATE_PROFILE_USED", "warning",
            "Approximate tooth profile used. Not suitable for manufacturing.",
            recommendation="Replace the loft approximation with a validated production tooth surface."
        ))
    return [warning.to_dict() for warning in warnings]


def thin_ring_warning(wall_mm: float, module_mm: float) -> list[dict[str, str]]:
    if wall_mm >= module_mm * 3.0:
        return []
    return [GearWarning(
        "THIN_RING_WALL", "warning", "Internal gear ring wall is thin relative to module.",
        "outer_diameter_mm", "Increase the outer diameter and verify rim stress."
    ).to_dict()]


def pair_warnings(pinion_teeth: int, ring_teeth: int) -> list[dict[str, str]]:
    ratio = ring_teeth / pinion_teeth
    if ratio <= 8:
        return []
    return [GearWarning(
        "EXTREME_GEAR_RATIO", "warning", "The requested internal gear ratio is extreme.",
        "ring_teeth", "Review tooth count difference, interference and packaging."
    ).to_dict()]


def herringbone_warnings(continuous_v: bool) -> list[dict[str, str]]:
    warnings = [GearWarning(
        "MANUFACTURING_COMPLEXITY", "warning", "Herringbone gears require specialised manufacturing planning."
    ).to_dict()]
    if continuous_v:
        warnings.append(GearWarning(
            "CONTINUOUS_HERRINGBONE_DIFFICULT_TO_MACHINE", "warning",
            "A continuous V herringbone is difficult to machine with conventional tooling.",
            "continuous_v", "Review additive, shaping or split-part manufacturing routes."
        ).to_dict())
    return warnings

