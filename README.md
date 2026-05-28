# insight-lab-profile

实验室人员档案系统 · 飞书 H5 小程序 + FastAPI + 飞书多维表格 (Base) 镜像。

## 架构

```
飞书 H5 (React)
   ↓ HTTPS
FastAPI + SQLAlchemy (vm-0-17)
   ↓ 写穿透               ↑ 读 (镜像加速)
飞书多维表格 (Base, 真理源)  SQLite (本地镜像 + FTS5 全文搜索)
   ↑ 增量轮询/全量校对
```

## 目录

```
insight-lab-profile/
├── docs/                  设计文档
│   └── base_schema.md     Base + SQLite schema v0.2
├── backend/               FastAPI 后端
│   ├── app/               业务代码
│   ├── sql/               SQLite schema
│   ├── scripts/           运维脚本 (init_db / sync_full / sync_inc)
│   └── requirements.txt
├── frontend/              飞书 H5 (React + Vite, 后续填充)
└── scripts/               跨端运维脚本
```

## 生产部署

生产环境建议只运行 FastAPI：后端监听 `127.0.0.1:8080`，并托管 `frontend/dist`。不要长期用 Vite dev server (`:5173`) 作为公网入口。

常用命令：

```bash
./scripts/build_prod.sh      # 测试 + 前端生产构建
./scripts/deploy_prod.sh     # 构建通过后重启 systemd 服务(如已安装)
```

详细流程见 `docs/deployment.md`。

## W1 起步

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 填飞书 app_id/secret 和 Base token
python scripts/init_db.py
uvicorn app.main:app --reload --port 8080
curl http://localhost:8080/api/health
```

## 路线 (6-8 周)

- W1 基建 (in progress): schema + 骨架 + 同步层
- W2 个人档案: 登录 + 主页 + 录入
- W3 全员看板
- W4 自动化: 妙记自动入库
- W5 权限分级
- W6 导出
- W7-8 上线打磨
