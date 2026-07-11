"""Planned worm gear generator.

The API schema exists so project files and UI tabs can be stable, but the CAD
surface is intentionally not faked.
"""

from __future__ import annotations

from aegis_gearlab.api.errors import NotImplementedGeneratorError


def generate_worm_gear(_data):
    raise NotImplementedGeneratorError("worm_gear is planned, not implemented in GearLab 0.1.0.")
