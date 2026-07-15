"""每日 SQLite 在线备份, 按星期几轮转保留 7 份。"""
import datetime
import pathlib
import sqlite3

SRC = "/root/insight-lab-profile/backend/data/insight_lab.db"
DST_DIR = pathlib.Path("/root/insight-lab-profile/backups/db-daily")
DST_DIR.mkdir(parents=True, exist_ok=True)
dst = DST_DIR / f"insight_lab_wd{datetime.date.today().isoweekday()}.db"
src_con = sqlite3.connect(SRC)
dst_con = sqlite3.connect(dst)
with dst_con:
    src_con.backup(dst_con)
dst_con.close()
src_con.close()
print(f"{datetime.datetime.now().isoformat()} backup ok -> {dst}")
