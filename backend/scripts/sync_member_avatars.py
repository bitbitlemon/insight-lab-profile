"""用 lark-cli search-user 拉每个 Member 的真实头像 + 同步可拿到的字段."""
from __future__ import annotations
import json, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.models import Member


def search(name: str) -> list[dict]:
    r = subprocess.run(
        ["lark-cli", "contact", "+search-user", "--query", name, "--as", "user", "--format", "json"],
        capture_output=True, text=True,
    )
    try:
        return json.loads(r.stdout).get("data", {}).get("users", [])
    except Exception:
        return []


def main() -> int:
    db = SessionLocal()
    members = db.query(Member).all()
    print(f"同步 {len(members)} 人头像...")
    ok = miss = unchanged = 0
    for m in members:
        users = search(m.name)
        # 找 open_id 精确匹配
        found = next((u for u in users if u.get("open_id") == m.open_id), None)
        if not found:
            miss += 1
            print(f"  [skip] {m.name} 没匹配上")
            continue
        avatar = (found.get("avatar") or {}).get("avatar_origin") \
            or (found.get("avatar") or {}).get("avatar_url")
        if not avatar:
            miss += 1
            continue
        if m.avatar_url == avatar:
            unchanged += 1
            continue
        m.avatar_url = avatar
        ok += 1
        if ok % 10 == 0:
            db.commit()
            print(f"  ...已同步 {ok}")
        time.sleep(0.1)
    db.commit()
    print(f"\nupdated={ok}  unchanged={unchanged}  miss={miss}")
    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
