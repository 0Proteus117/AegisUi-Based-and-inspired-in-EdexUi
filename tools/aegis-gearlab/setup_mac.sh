#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h}"
cd "$ROOT_DIR"
VENV_DIR="${GEARLAB_VENV_DIR:-$HOME/Library/Application Support/EdexUi-Eng/aegis-gearlab/.venv}"

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON="$PYTHON_BIN"
elif command -v python3.12 >/dev/null 2>&1; then
  PYTHON="$(command -v python3.12)"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON="$(command -v python3.11)"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  echo "PYTHON_3_11_OR_NEWER_REQUIRED"
  exit 1
fi

"$PYTHON" - <<'PY'
import sys
if sys.version_info < (3, 11):
    raise SystemExit("PYTHON_3_11_OR_NEWER_REQUIRED")
print(f"PYTHON: {sys.version.split()[0]}")
PY

mkdir -p "${VENV_DIR:h}"
if [[ ! -d "$VENV_DIR" ]]; then
  "$PYTHON" -m venv "$VENV_DIR"
fi

if [[ -L .venv || -d .venv ]]; then
  rm -rf .venv
fi
ln -s "$VENV_DIR" .venv

"$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel
"$VENV_DIR/bin/python" -m pip install -r requirements.txt
mkdir -p exports
touch exports/.gitkeep

echo "AEGIS_GEARLAB_SETUP: OK"
echo "VENV: $VENV_DIR"
echo "NEXT: ./run_api.sh"
