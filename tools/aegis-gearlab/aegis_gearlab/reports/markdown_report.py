"""Compact Markdown report for local project review."""

from __future__ import annotations

from pathlib import Path


def build_markdown_report(data: dict) -> str:
    parameters = "\n".join(f"- `{key}`: {value}" for key, value in data.get("parameters", {}).items())
    geometry = "\n".join(f"- `{key}`: {value}" for key, value in data.get("calculated_geometry", {}).items())
    warnings = "\n".join(
        f"- **{item.get('code', 'WARNING')}** — {item.get('message', '')}"
        for item in data.get("warnings", [])
    ) or "- None"
    files = "\n".join(f"- `{key}`: {value}" for key, value in data.get("exported_files", {}).items()) or "- None"
    return f"""# Aegis GearLab — {data.get('name', 'gear')}

- Generator: `{data.get('gear_type', 'unknown')}`
- Generated: `{data.get('generated_at', '')}`
- GearLab: `{data.get('gearlab_version', '')}`

## Parameters

{parameters}

## Calculated geometry

{geometry}

## Warnings

{warnings}

## Exports

{files}

> {data.get('note', '')}
"""


def write_markdown_report(data: dict, path: Path) -> Path:
    Path(path).write_text(build_markdown_report(data), encoding="utf-8")
    return Path(path)

