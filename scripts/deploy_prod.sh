#!/usr/bin/env bash
# Build, test, and restart the production systemd service when installed.
set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/insight-lab-profile}"
SERVICE="${SERVICE:-insight-lab.service}"

"$ROOT/scripts/build_prod.sh"

if systemctl list-unit-files "$SERVICE" >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE"
  sudo systemctl --no-pager --full status "$SERVICE"
else
  echo "[info] $SERVICE is not installed; build completed without restart."
  echo "[info] Install deploy/systemd/*.service first if this host should run production via systemd."
fi
