#!/usr/bin/env bash
# 每日 SQLite 备份: .backup 命令 (热备, 不阻塞写) + 7 日滚动
# 用法: 由 cron 调度, 凌晨 3 点跑一次
set -euo pipefail

DB="/home/ubuntu/insight-lab-profile/backend/data/insight_lab.db"
DEST_DIR="/home/ubuntu/insight-lab-profile/backups"
mkdir -p "$DEST_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
DEST="$DEST_DIR/insight_lab_${DATE}.db"

# 用 python 标准库 sqlite3 .backup() (服务器无 sqlite3 CLI), 热备避开 WAL 半状态
/home/ubuntu/insight-lab-profile/backend/.venv/bin/python - "$DB" "$DEST" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
src.close(); dst.close()
PY
gzip -9 "$DEST"

# 滚动: 保留最近 7 天
find "$DEST_DIR" -name 'insight_lab_*.db.gz' -mtime +7 -delete

echo "[backup] $(date -Iseconds) ok -> ${DEST}.gz ($(du -h "${DEST}.gz" | cut -f1))"
