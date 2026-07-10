"""Safe export naming and filesystem boundaries."""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

MODULE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXPORT_DIR = MODULE_ROOT / "exports"


def ensure_export_directory(directory: Path | None = None) -> Path:
    target = Path(directory or DEFAULT_EXPORT_DIR).resolve()
    target.mkdir(parents=True, exist_ok=True)
    return target


def sanitize_name(value: str, fallback: str = "gear") -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value).strip()).strip("._-")
    return (safe or fallback)[:72]


def unique_export_path(name: str, extension: str, directory: Path | None = None) -> Path:
    target = ensure_export_directory(directory)
    clean_name = sanitize_name(name)
    suffix = sanitize_name(extension, "dat").lstrip(".")
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha256(f"{clean_name}:{stamp}:{datetime.now(UTC).timestamp()}".encode()).hexdigest()[:8]
    candidate = (target / f"{clean_name}_{stamp}_{digest}.{suffix}").resolve()
    if target not in candidate.parents:
        raise ValueError("Resolved export path escaped the export directory.")
    return candidate


def resolve_export(filename: str, directory: Path | None = None) -> Path:
    target = ensure_export_directory(directory)
    safe_filename = Path(filename).name
    if safe_filename != filename or safe_filename in {"", ".", ".."}:
        raise ValueError("Invalid export filename.")
    candidate = (target / safe_filename).resolve()
    if target not in candidate.parents:
        raise ValueError("Export path traversal rejected.")
    return candidate


def relative_api_path(path: Path) -> str:
    return f"/exports/{Path(path).name}"


def assert_non_empty(path: Path) -> None:
    if not path.is_file() or path.stat().st_size <= 0:
        raise IOError(f"Export was not created or is empty: {path.name}")


def cleanup_exports(max_age_hours: int = 168, directory: Path | None = None) -> list[str]:
    target = ensure_export_directory(directory)
    cutoff = datetime.now(UTC) - timedelta(hours=max(1, int(max_age_hours)))
    removed: list[str] = []
    for item in target.iterdir():
        if not item.is_file() or item.name == ".gitkeep":
            continue
        modified = datetime.fromtimestamp(item.stat().st_mtime, UTC)
        if modified < cutoff:
            item.unlink(missing_ok=True)
            removed.append(item.name)
    return removed

