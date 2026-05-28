"""一次性建好飞书多维表格里缺失的 5 张表.

使用:
    cd /home/ubuntu/insight-lab-profile/backend
    .venv/bin/python -m scripts.init_base_tables

读取 .env 的 LARK_APP_ID / LARK_APP_SECRET / LARK_BASE_APP_TOKEN.
已存在的表跳过, 末尾输出可粘贴到 .env 的 LARK_TABLE_* 行.

字段类型对照 (飞书 Bitable):
  1  - 多行文本 (Text, 默认; 也用于单行)
  2  - 数字 (Number)
  3  - 单选 (SingleSelect)
  4  - 多选 (MultiSelect)
  5  - 日期 (DateTime, 毫秒时间戳)
  7  - 复选框
  11 - 人员
  13 - 电话
  15 - URL
  17 - 附件
"""
from __future__ import annotations
import os
import sys
import time
from typing import Any

import httpx
from dotenv import load_dotenv


LARK = "https://open.feishu.cn/open-apis"


def _txt(name: str) -> dict:
    return {"field_name": name, "type": 1}


def _num(name: str) -> dict:
    return {"field_name": name, "type": 2}


def _date(name: str) -> dict:
    return {"field_name": name, "type": 5, "property": {"date_formatter": "yyyy-MM-dd", "auto_fill": False}}


def _select(name: str, options: list[str]) -> dict:
    return {
        "field_name": name,
        "type": 3,
        "property": {"options": [{"name": o} for o in options]},
    }


def _url(name: str) -> dict:
    return {"field_name": name, "type": 15}


TABLE_DEFS: list[dict[str, Any]] = [
    {
        "env_key": "LARK_TABLE_POINTS_LEDGER",
        "name": "points_ledger",
        "fields": [
            _txt("member_open_id"),
            _select("category", ["business", "industrial", "public", "penalty"]),
            _select("source_type", ["paper", "competition", "contribution", "duty", "adjust", "grant", "ip", "industrial", "product_stage", "penalty", "training"]),
            _txt("source_id"),
            _date("occurred_at"),
            _num("base_points"),
            _num("final_points"),
            _num("share_ratio"),
            _num("decay_factor"),
            _txt("reason"),
            _select("status", ["draft", "pending_review", "approved", "rejected", "disputed", "settled", "superseded"]),
            _txt("calculation_rule_version"),
            _txt("settlement_period"),
        ],
    },
    {
        "env_key": "LARK_TABLE_CONTRIBUTIONS",
        "name": "contributions",
        "fields": [
            _txt("member_open_id"),
            _select("type", ["event", "internal_share", "document", "reflection", "other"]),
            _txt("title"),
            _txt("description"),
            _date("occurred_at"),
            _select("role_in_contribution", ["organizer", "co_organizer", "speaker", "participant", "contributor", "other"]),
            _num("hours"),
            _url("proof_url"),
            _txt("tags"),
        ],
    },
    {
        "env_key": "LARK_TABLE_PROJECTS",
        "name": "projects",
        "fields": [
            _txt("name"),
            _txt("description"),
            _select("status", ["planning", "active", "paused", "completed", "archived"]),
            _select("priority", ["low", "medium", "high", "urgent"]),
            _txt("owner_open_id"),
            _txt("department"),
            _date("start_date"),
            _date("target_end_date"),
            _date("actual_end_date"),
            _txt("tags"),
            _num("points_awarded"),
        ],
    },
    {
        "env_key": "LARK_TABLE_TASKS",
        "name": "tasks",
        "fields": [
            _num("project_id"),
            _txt("title"),
            _txt("description"),
            _select("status", ["todo", "in_progress", "done", "blocked", "cancelled"]),
            _select("priority", ["low", "medium", "high", "urgent"]),
            _txt("assignee_open_id"),
            _date("planned_start_date"),
            _date("due_date"),
        ],
    },
    {
        "env_key": "LARK_TABLE_PAPER_MILESTONES",
        "name": "paper_milestones",
        "fields": [
            _num("paper_id"),
            _select("stage", ["topic", "research", "experiment", "draft", "submit"]),
            _txt("owner_open_id"),
            _date("due_date"),
            _select("status", ["pending", "in_progress", "done", "blocked"]),
            _txt("notes"),
        ],
    },
]


class LarkBaseClient:
    def __init__(self, app_id: str, app_secret: str, app_token: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.app_token = app_token
        self._token: str | None = None
        self._token_exp: float = 0.0

    def _tenant_token(self) -> str:
        if self._token and time.time() < self._token_exp - 60:
            return self._token
        with httpx.Client(timeout=10) as c:
            r = c.post(
                f"{LARK}/auth/v3/tenant_access_token/internal",
                json={"app_id": self.app_id, "app_secret": self.app_secret},
            )
            r.raise_for_status()
            d = r.json()
        if d.get("code") != 0:
            raise RuntimeError(f"获取 tenant_access_token 失败: {d}")
        self._token = d["tenant_access_token"]
        self._token_exp = time.time() + d.get("expire", 7200)
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._tenant_token()}", "Content-Type": "application/json"}

    def list_tables(self) -> list[dict]:
        url = f"{LARK}/bitable/v1/apps/{self.app_token}/tables"
        items: list[dict] = []
        page_token: str | None = None
        with httpx.Client(timeout=15) as c:
            while True:
                params: dict[str, Any] = {"page_size": 100}
                if page_token:
                    params["page_token"] = page_token
                r = c.get(url, headers=self._headers(), params=params)
                r.raise_for_status()
                d = r.json()
                if d.get("code") != 0:
                    raise RuntimeError(f"list_tables 失败: {d}")
                data = d.get("data") or {}
                items.extend(data.get("items") or [])
                if not data.get("has_more"):
                    break
                page_token = data.get("page_token")
                if not page_token:
                    break
        return items

    def create_table(self, name: str, fields: list[dict]) -> str:
        url = f"{LARK}/bitable/v1/apps/{self.app_token}/tables"
        payload = {"table": {"name": name, "default_view_name": "全部", "fields": fields}}
        with httpx.Client(timeout=20) as c:
            r = c.post(url, headers=self._headers(), json=payload)
            r.raise_for_status()
            d = r.json()
        if d.get("code") != 0:
            raise RuntimeError(f"create_table {name} 失败: {d}")
        tid = (d.get("data") or {}).get("table_id")
        if not tid:
            raise RuntimeError(f"create_table {name} 返回无 table_id: {d}")
        return tid


def main() -> int:
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(backend_dir, ".env"))
    app_id = os.environ.get("LARK_APP_ID", "").strip()
    app_secret = os.environ.get("LARK_APP_SECRET", "").strip()
    app_token = os.environ.get("LARK_BASE_APP_TOKEN", "").strip()
    if not (app_id and app_secret and app_token):
        print("[error] 缺少 LARK_APP_ID / LARK_APP_SECRET / LARK_BASE_APP_TOKEN", file=sys.stderr)
        return 1

    client = LarkBaseClient(app_id, app_secret, app_token)

    print(f"[info] 连接 Base app_token={app_token}")
    existing = client.list_tables()
    by_name = {t.get("name"): t for t in existing}
    print(f"[info] 已有表 {len(existing)} 张")

    results: dict[str, str] = {}
    for tdef in TABLE_DEFS:
        name = tdef["name"]
        env_key = tdef["env_key"]
        cur = by_name.get(name)
        if cur and cur.get("table_id"):
            tid = cur["table_id"]
            print(f"[skip] {name}: 已存在 {tid}")
            results[env_key] = tid
            continue
        try:
            tid = client.create_table(name, tdef["fields"])
            print(f"[ok]  {name}: 已创建 {tid}")
            results[env_key] = tid
        except Exception as e:
            print(f"[err] {name}: {e}")

    print()
    print("=== 把以下行追加到 backend/.env ===")
    for tdef in TABLE_DEFS:
        env_key = tdef["env_key"]
        tid = results.get(env_key)
        if tid:
            print(f"{env_key}={tid}")
    print()
    print("然后 systemctl --user restart insight-lab-backend, scheduler 会自动把历史回填.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
