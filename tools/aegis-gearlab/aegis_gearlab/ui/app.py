"""Helpers for the standalone FastAPI-served GearLab UI."""

from __future__ import annotations

from pathlib import Path


def ui_root() -> Path:
    return Path(__file__).resolve().parent


def template_path() -> Path:
    return ui_root() / "templates" / "index.html"
