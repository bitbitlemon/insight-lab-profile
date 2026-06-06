"""
飞书 OpenAPI 客户端: tenant_access_token 管理 + Base CRUD 封装。

直接调 REST API (httpx),不依赖 lark-cli wrapper,因为我们要的是细粒度控制和并发。
"""
from __future__ import annotations
import time
import httpx
from typing import Any
from ..config import settings


class LarkApiError(Exception):
    """飞书开放平台返回 code!=0 时抛出. msg/code 用于上游 4xx 包装."""

    def __init__(self, code: int, msg: str, raw: dict | None = None):
        super().__init__(f"lark api error code={code} msg={msg}")
        self.code = code
        self.msg = msg
        self.raw = raw or {}


class LarkClient:
    BASE_URL = "https://open.feishu.cn/open-apis"

    def __init__(self, app_id: str | None = None, app_secret: str | None = None):
        self.app_id = app_id or settings.lark_app_id
        self.app_secret = app_secret or settings.lark_app_secret
        self._tenant_token: str | None = None
        self._tenant_token_expire: float = 0.0
        self._client = httpx.AsyncClient(base_url=self.BASE_URL, timeout=30.0)

    async def close(self):
        await self._client.aclose()

    async def _get_tenant_token(self) -> str:
        if self._tenant_token and time.time() < self._tenant_token_expire - 60:
            return self._tenant_token
        resp = await self._client.post(
            "/auth/v3/tenant_access_token/internal",
            json={"app_id": self.app_id, "app_secret": self.app_secret},
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取 tenant_access_token 失败: {data}")
        self._tenant_token = data["tenant_access_token"]
        self._tenant_token_expire = time.time() + data.get("expire", 7200)
        return self._tenant_token

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        token = await self._get_tenant_token()
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        resp = await self._client.request(method, path, headers=headers, **kwargs)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"飞书 API 调用失败 {method} {path}: {data}")
        return data.get("data", {})

    # ============ Base CRUD ============
    async def list_records(self, app_token: str, table_id: str, page_size: int = 100, page_token: str | None = None) -> dict:
        params: dict[str, Any] = {"page_size": page_size}
        if page_token:
            params["page_token"] = page_token
        return await self._request("GET", f"/bitable/v1/apps/{app_token}/tables/{table_id}/records", params=params)

    async def get_record(self, app_token: str, table_id: str, record_id: str) -> dict:
        return await self._request("GET", f"/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}")

    async def create_record(self, app_token: str, table_id: str, fields: dict) -> dict:
        return await self._request("POST", f"/bitable/v1/apps/{app_token}/tables/{table_id}/records", json={"fields": fields})

    async def update_record(self, app_token: str, table_id: str, record_id: str, fields: dict) -> dict:
        return await self._request("PUT", f"/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}", json={"fields": fields})

    async def delete_record(self, app_token: str, table_id: str, record_id: str) -> dict:
        return await self._request("DELETE", f"/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}")

    async def batch_create(self, app_token: str, table_id: str, records: list[dict]) -> dict:
        return await self._request(
            "POST",
            f"/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create",
            json={"records": [{"fields": r} for r in records]},
        )

    # ============ Contact / EHR ============
    async def list_child_departments(
        self,
        department_id: str = "0",
        *,
        fetch_child: bool = False,
        page_size: int = 50,
        page_token: str | None = None,
    ) -> dict:
        params: dict[str, Any] = {
            "department_id_type": "open_department_id",
            "user_id_type": "open_id",
            "fetch_child": "true" if fetch_child else "false",
            "page_size": page_size,
        }
        if page_token:
            params["page_token"] = page_token
        return await self._request(
            "GET",
            f"/contact/v3/departments/{department_id}/children",
            params=params,
        )

    async def list_department_users(
        self,
        department_id: str,
        *,
        page_size: int = 50,
        page_token: str | None = None,
    ) -> dict:
        params: dict[str, Any] = {
            "department_id": department_id,
            "department_id_type": "open_department_id",
            "user_id_type": "open_id",
            "page_size": page_size,
        }
        if page_token:
            params["page_token"] = page_token
        return await self._request("GET", "/contact/v3/users/find_by_department", params=params)

    async def list_ehr_employees(
        self,
        *,
        view: str = "basic",
        status: str | None = None,
        employee_type: str | None = None,
        page_size: int = 100,
        page_token: str | None = None,
    ) -> dict:
        params: dict[str, Any] = {
            "view": view,
            "user_id_type": "open_id",
            "page_size": page_size,
        }
        if status:
            params["status"] = status
        if employee_type:
            params["type"] = employee_type
        if page_token:
            params["page_token"] = page_token
        return await self._request("GET", "/ehr/v1/employees", params=params)

    # ============ Drive Media (附件上传) ============
    async def upload_drive_media(
        self,
        file_name: str,
        parent_type: str,
        parent_node: str,
        size: int,
        file_bytes: bytes,
        content_type: str | None = None,
        extra: str | None = None,
    ) -> dict:
        """
        上传文件到飞书云空间 / Bitable 附件字段 (走 drive/v1/medias/upload_all).

        parent_type 常用: 'bitable_file' (附件) | 'bitable_image' (图片字段) | 'explorer' (云空间根)
        parent_node: 对 bitable_* 是 Base 的 app_token; 对 explorer 是文件夹 token
        size: 文件字节数 (必须与 file_bytes 实际长度一致, < 20MB; 大文件需分片)
        返回: {"file_token": "..."}
        """
        token = await self._get_tenant_token()
        files = {
            "file": (file_name, file_bytes, content_type or "application/octet-stream"),
        }
        data: dict[str, Any] = {
            "file_name": file_name,
            "parent_type": parent_type,
            "parent_node": parent_node,
            "size": str(size),
        }
        if extra:
            data["extra"] = extra
        # 不能用 self._request, 因为它发送 json; 这里用 multipart
        resp = await self._client.post(
            "/drive/v1/medias/upload_all",
            headers={"Authorization": f"Bearer {token}"},
            data=data,
            files=files,
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("code") != 0:
            raise LarkApiError(int(body.get("code", -1)), str(body.get("msg", "upload_all 失败")), body)
        return body.get("data", {})

    # ============ 用户身份 ============
    async def exchange_code_to_user_token(self, code: str) -> dict:
        """飞书 H5 内 tt.requestAccess 拿到的 code → user_access_token (含 open_id).

        失败时抛 LarkApiError, 携带 code/msg 便于上层包装为 401.
        """
        import logging, json as _json
        log = logging.getLogger("lark.oidc")
        token = await self._get_tenant_token()
        resp = await self._client.post(
            "/authen/v1/oidc/access_token",
            headers={"Authorization": f"Bearer {token}"},
            json={"grant_type": "authorization_code", "code": code},
        )
        resp.raise_for_status()
        data = resp.json()
        safe_dump = {**data, "data": {k: ("***" if k in ("access_token", "refresh_token") else v)
                                       for k, v in (data.get("data") or {}).items()}}
        log.warning("OIDC access_token raw response: %s", _json.dumps(safe_dump, ensure_ascii=False))
        if data.get("code") != 0:
            raise LarkApiError(int(data.get("code", -1)), str(data.get("msg", "code 兑换失败")), data)
        return data.get("data", {})

    async def get_user_info(self, user_access_token: str) -> dict:
        resp = await self._client.get(
            "/authen/v1/user_info",
            headers={"Authorization": f"Bearer {user_access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise LarkApiError(int(data.get("code", -1)), str(data.get("msg", "user_info 失败")), data)
        return data.get("data", {})


_lark: LarkClient | None = None


def get_lark() -> LarkClient:
    global _lark
    if _lark is None:
        _lark = LarkClient()
    return _lark
