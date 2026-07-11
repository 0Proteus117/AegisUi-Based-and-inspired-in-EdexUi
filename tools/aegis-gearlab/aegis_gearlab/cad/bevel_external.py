"""Planned bevel gear generator.

No decorative geometry is emitted from this module. Bevel gear generation needs
validated conical tooth construction before manufacturing-grade STEP export.
"""

from __future__ import annotations

from aegis_gearlab.api.errors import NotImplementedGeneratorError


def generate_bevel_external(_data):
    raise NotImplementedGeneratorError("bevel_external is planned, not implemented in GearLab 0.1.0.")
