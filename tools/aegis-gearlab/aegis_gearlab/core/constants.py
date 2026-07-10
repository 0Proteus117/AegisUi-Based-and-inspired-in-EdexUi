"""Shared constants kept outside API and CAD layers."""

from aegis_gearlab import __version__

SERVICE_NAME = "Aegis GearLab API"
API_VERSION = __version__
EXPORT_FORMATS = frozenset({"step", "stl", "dxf", "json_report"})
PRIMARY_FORMAT = "step"
SUPPORTED_GENERATORS = (
    "spur_external",
    "spur_internal",
    "internal_gear_pair",
    "helical_external",
    "herringbone_external",
)
REPORT_DISCLAIMER = (
    "Geometry report only. No strength/contact stress calculation included."
)
MIN_RING_WALL_MODULES = 2.0

