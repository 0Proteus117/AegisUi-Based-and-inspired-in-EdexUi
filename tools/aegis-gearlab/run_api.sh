#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h}"
cd "$ROOT_DIR"

if [[ ! -x .venv/bin/python ]]; then
  echo "GEARLAB_VENV_MISSING: run ./setup_mac.sh first"
  exit 1
fi

source .venv/bin/activate
exec uvicorn aegis_gearlab.main:app --reload --host 127.0.0.1 --port 8765

