"""初始化 SQLite 数据库: 执行 sql/sqlite_schema.sql 建表。"""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "sql" / "sqlite_schema.sql"
DB_PATH = ROOT / "data" / "insight_lab.db"


def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    sql = SQL_PATH.read_text(encoding="utf-8")
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(sql)
        conn.commit()
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [r[0] for r in cur.fetchall()]
        print(f"[ok] 已建表 {len(tables)} 张: {', '.join(tables)}")
        print(f"[ok] db 路径: {DB_PATH}")
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
