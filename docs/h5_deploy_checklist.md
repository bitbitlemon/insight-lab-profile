# 飞书 H5 部署 Checklist

本项目前端通过飞书 H5 (`tt.requestAccess`) 拿到 code,后端用 `app_secret` + code 换 `user_access_token` 完成 OIDC 登录。下面是从空环境跑通登录的完整顺序。

## 一、后端凭证自检 (优先做)

不依赖 H5 / Funnel 即可验证 app 凭证是否能换 tenant_access_token。

```bash
curl -s http://127.0.0.1:8080/api/auth/diagnose | python3 -m json.tool
```

期望:
```json
{
  "app_id": "cli_a9147e9473f81bef",
  "has_secret": true,
  "base_app_token": "LAzWbERfHaeOYrsvHEPc1YT6n7f",
  "tenant_token_ok": true,
  "error": null
}
```

- `has_secret: false` → backend/.env 缺 `LARK_APP_SECRET`
- `tenant_token_ok: false` + `error` 含 `code=10003` → app_id 错或被禁用
- `error` 含 `code=10012` → app_secret 错

## 二、登录失败排查

`/api/auth/lark/login` 失败现在返回 401,detail 含飞书原始 code/msg,例如:

```
{"detail":"飞书 OIDC 兑换失败 (code=20003): code 兑换失败"}
```

常见 code:
- `20003 / 20007`: code 无效或过期 — H5 端 `tt.requestAccess` 拿到的 code 没在 5 分钟内交付后端
- `99991663`: app_access_token 失效 — backend 重启即可
- `10003`: app_id 未授权使用 OIDC scope
- `1061002`: 应用未发布或没在该租户内可用

前端 LoginPage 失败页提供 "查看后端诊断" 按钮,会调 `/api/auth/diagnose`,可在 H5 内直接看错误。

## 三、飞书开放平台后台配置

App `cli_a9147e9473f81bef`,后台地址 https://open.feishu.cn/app/cli_a9147e9473f81bef/

需要:

1. **基础信息 → H5 入口 URL**: 填 H5 域名 (Tailscale Funnel 启好之后为 `https://vm-0-17-ubuntu.tail30ebf9.ts.net/`)
2. **安全设置 → 重定向 URL**: 同上
3. **权限管理**: 至少勾选
   - `contact:user.id:readonly` (拿 open_id)
   - `authen:user_id` (OIDC `/authen/v1/oidc/access_token`)
   - `bitable:app` 系列 (12 个表读写)
4. **事件订阅 → 长连接 WebSocket**: 已用 lark-cli event +subscribe,无需额外配
5. **版本管理 → 创建版本并发布到企业**: 否则租户内拿不到 H5 入口

## 四、Tailscale Funnel 启动

```bash
# admin console (用户侧操作):
# 1. https://login.tailscale.com/admin/dns -> HTTPS Certificates 开启
# 2. https://login.tailscale.com/admin/acls -> 在 ACL 加 nodeAttrs:
#    {"target": ["funnel"], "attr": ["funnel"]}
# 3. 等 cert 签发后,本机:
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
sudo tailscale funnel 443 on
```

启用后 `https://vm-0-17-ubuntu.tail30ebf9.ts.net/api/auth/diagnose` 应能公网访问。

## 五、前端环境变量

frontend/.env.production:
```
VITE_LARK_APP_ID=cli_a9147e9473f81bef
VITE_API_BASE=/api
```

构建:
```bash
cd /home/ubuntu/insight-lab-profile/frontend && npx vite build
# dist/ 由 backend uvicorn 反代或 nginx serve
```

## 六、端到端联调顺序

1. 浏览器 (本地或公网) 访问 `https://<funnel>/api/auth/diagnose` → 200 + tenant_token_ok=true
2. 飞书 PC/移动端打开 H5 入口 → LoginPage 出现 SpinLoading,然后跳 BoardPage
3. 失败时 LoginPage 显示后端 detail,按 "查看后端诊断" 看 app 凭证状态
4. 成功后 `/api/auth/me` 返回当前 Member,本地存 JWT

## 七、当前阻塞 (待用户操作)

- [ ] Tailscale admin console 启 HTTPS Certificates
- [ ] 飞书后台填 H5 入口 URL + 创建版本发布到企业
- [ ] 一次真实开会 + 妙记 AI 总结生成 → W4 listener E2E
