"""JSON geometry report generation."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from aegis_gearlab import __version__
from aegis_gearlab.core.constants import REPORT_DISCLAIMER


def build_json_report_data(
    *,
    name: str,
    generator: str,
    parameters: dict,
    geometry: dict,
    warnings: list[dict],
    files: dict | None = None,
) -> dict:
    return {
        "name": name,
        "gear_type": generator,
        "generated_at": datetime.now(UTC).isoformat(),
        "gearlab_version": __version__,
        "parameters": parameters,
        "calculated_geometry": geometry,
        "warnings": warnings,
        "exported_files": files or {},
        "note": REPORT_DISCLAIMER,
    }


def write_json_report(data: dict, path: Path) -> Path:
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return Path(path)

