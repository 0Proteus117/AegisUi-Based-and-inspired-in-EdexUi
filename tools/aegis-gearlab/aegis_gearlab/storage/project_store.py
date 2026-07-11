"""Private userData-style project storage, never repository storage."""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from aegis_gearlab.storage.file_manager import sanitize_name


def default_project_directory() -> Path:
    return Path.home() / "Library" / "Application Support" / "EdexUi-Eng" / "aegis-gearlab" / "projects"


def _directory(directory: Path | None = None) -> Path:
    target = Path(directory or default_project_directory()).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    return target


def _project_path(project_name: str, directory: Path | None = None) -> Path:
    return _directory(directory) / f"{sanitize_name(project_name, 'gear_project')}.json"


def save_project(project: dict, directory: Path | None = None) -> Path:
    now = datetime.now(UTC).isoformat()
    payload = {
        "project_name": project.get("project_name") or "Untitled GearLab Project",
        "description": project.get("description", ""),
        "gear_type": project.get("gear_type", ""),
        "parameters": project.get("parameters", {}),
        "calculated_geometry": project.get("calculated_geometry", {}),
        "warnings": project.get("warnings", []),
        "exported_files": project.get("exported_files", []),
        "created_at": project.get("created_at") or now,
        "updated_at": now,
        "notes": project.get("notes", ""),
    }
    path = _project_path(payload["project_name"], directory)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def load_project(project_name: str, directory: Path | None = None) -> dict:
    path = _project_path(project_name, directory)
    return json.loads(path.read_text(encoding="utf-8"))


def list_projects(directory: Path | None = None) -> list[dict]:
    projects = []
    for path in sorted(_directory(directory).glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            projects.append({"filename": path.name, **payload})
        except (OSError, json.JSONDecodeError):
            continue
    return projects


def duplicate_project(project_name: str, duplicate_name: str, directory: Path | None = None) -> Path:
    source = _project_path(project_name, directory)
    destination = _project_path(duplicate_name, directory)
    payload = json.loads(source.read_text(encoding="utf-8"))
    payload["project_name"] = duplicate_name
    payload["created_at"] = datetime.now(UTC).isoformat()
    payload["updated_at"] = payload["created_at"]
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return destination


def delete_project(project_name: str, directory: Path | None = None) -> bool:
    path = _project_path(project_name, directory)
    if not path.exists():
        return False
    path.unlink()
    return True

