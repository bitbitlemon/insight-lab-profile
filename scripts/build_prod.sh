#!/usr/bin/env bash
# Build and validate the production artifact without changing running services.
set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/insight-lab-profile}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

cd "$BACKEND"
if [[ ! -x .venv/bin/python ]]; then
  echo "[error] backend virtualenv not found: $BACKEND/.venv" >&2
  exit 1
fi

. .venv/bin/activate
python -m pytest -q

cd "$FRONTEND"
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build

cd "$ROOT"
if [[ ! -f frontend/dist/index.html ]]; then
  echo "[error] frontend/dist/index.html was not generated" >&2
  exit 1
fi

echo "[ok] production artifact ready: $ROOT/frontend/dist"
