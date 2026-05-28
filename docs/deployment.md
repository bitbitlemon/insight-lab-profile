# 生产部署说明

本项目生产形态为单一 FastAPI 服务：后端监听 `127.0.0.1:8080`，并直接托管 `frontend/dist` 里的 H5 静态文件。公网入口由 Tailscale Funnel、Nginx 或其他 HTTPS 反代转发到本机 `127.0.0.1:8080`。

不要在生产环境把 Vite dev server (`:5173`) 当作公网入口长期运行。

## 一、构建和验证

```bash
cd /home/ubuntu/insight-lab-profile
./scripts/build_prod.sh
```

脚本会执行：

- 后端 `pytest -q`
- 前端依赖检查，不存在 `node_modules` 时执行 `npm ci`
- 前端 `npm run build`
- 校验 `frontend/dist/index.html` 是否生成

## 二、安装 systemd 服务

```bash
cd /home/ubuntu/insight-lab-profile
sudo cp deploy/systemd/insight-lab.service /etc/systemd/system/
sudo cp deploy/systemd/insight-lab-backup.service /etc/systemd/system/
sudo cp deploy/systemd/insight-lab-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now insight-lab.service
sudo systemctl enable --now insight-lab-backup.timer
```

服务说明：

- `insight-lab.service`：运行 FastAPI，包含 Base 同步 scheduler 和飞书事件 listener。
- `insight-lab-backup.timer`：每天 03:00 触发 SQLite 热备份。
- `insight-lab-backup.service`：实际调用 `scripts/backup_db.sh`。

## 三、发布新版本

```bash
cd /home/ubuntu/insight-lab-profile
git pull --ff-only
./scripts/deploy_prod.sh
```

如果已安装 `insight-lab.service`，脚本会在测试和构建通过后重启服务。未安装时只完成构建，不改变现有运行进程。

## 四、健康检查

```bash
curl -s http://127.0.0.1:8080/api/health
curl -I http://127.0.0.1:8080/
sudo systemctl --no-pager --full status insight-lab.service
sudo journalctl -u insight-lab.service -n 100 --no-pager
```

期望：

- `/api/health` 返回 `{"status":"ok","db":true}`
- `/` 返回 H5 首页 HTML
- `insight-lab.service` 为 `active (running)`

## 五、Tailscale Funnel 入口

后端只监听本机地址时，Funnel 转发到本机服务：

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
sudo tailscale funnel 443 on
```

飞书 H5 入口 URL、重定向 URL 和前端生产变量应保持同一域名：

```text
VITE_API_BASE=/api
```

## 六、回滚

当前项目已接入 Git。发布前确认本地干净：

```bash
git status --short --branch
git log --oneline -5
```

若需要回滚到上一提交：

```bash
git reset --hard HEAD~1
./scripts/deploy_prod.sh
```

执行破坏性回滚前必须先确认数据库是否需要单独恢复；代码回滚不会自动回滚 SQLite 数据。

## 七、当前服务器迁移建议

当前服务器仍有 Vite dev server 监听 `0.0.0.0:5173`。完成 systemd 切换和公网入口验证后，再停止旧进程：

```bash
pkill -f 'frontend/node_modules/.bin/vite'
```

停止前先确认 `http://127.0.0.1:8080/` 和公网 H5 入口都能正常打开。
