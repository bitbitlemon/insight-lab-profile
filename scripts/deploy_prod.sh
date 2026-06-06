#!/usr/bin/env bash
# Build, test, and restart the backend production service when installed.
# The public Tailscale/Funnel entry points to insight-lab-web.service (:8081),
# which serves frontend/dist directly and proxies /api to backend :8080.
# Frontend-only builds do not require restarting the web entry service.
set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/insight-lab-profile}"
SERVICE="${SERVICE:-insight-lab-backend.service}"

"$ROOT/scripts/build_prod.sh"

if systemctl --user list-unit-files "$SERVICE" >/dev/null 2>&1; then
  systemctl --user restart "$SERVICE"
  systemctl --user --no-pager --full status "$SERVICE"
elif systemctl list-unit-files "$SERVICE" >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE"
  sudo systemctl --no-pager --full status "$SERVICE"
else
  echo "[info] $SERVICE is not installed; build completed without restart."
  echo "[info] This host normally uses user services:"
  echo "[info]   insight-lab-web.service     stable public entry on :8081"
  echo "[info]   insight-lab-backend.service FastAPI backend on :8080"
  echo "[info] For another service, pass SERVICE=<name> and ensure systemctl --user can see it."
fi
