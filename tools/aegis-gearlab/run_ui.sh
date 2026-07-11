#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h}"
cd "$ROOT_DIR"

echo "AEGIS_GEARLAB_UI: http://127.0.0.1:8765/ui"
exec ./run_api.sh
