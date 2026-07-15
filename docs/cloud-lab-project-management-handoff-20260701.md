# 项目管理系统云实验室交接文档

日期：2026-07-01  
生产服务器：`root@49.234.187.29`  
生产项目目录：`/root/insight-lab-profile`  
公网入口：`http://49.234.187.29/projects`

## 当前线上状态

项目管理系统已经接入完整云实验室能力，入口为：

- 项目首页按钮：`/projects` 顶部右侧 `云实验室`
- 独立路由：`http://49.234.187.29/projects/cloud-lab`

这一路由复用现有完整 `CloudLabPage`，不是简化版 3D 页面。当前带入的能力包括：

- Three.js 实验室建模与场景渲染
- 人员头像/状态/互动逻辑
- 群聊/聊天记录聚类、聊天时间范围、圆桌聊天分配
- 指针拖拽、缩放、场景交互
- 云实验室使用心跳统计，`/projects/cloud-lab` 已归类为 `cloud-lab`

注意：没有修改 `https://vm-0-17-ubuntu.tail30ebf9.ts.net/cloud-lab` 当前效果。项目管理系统只是新增了一个项目路径下的入口。

## 本次改动范围

生产代码目录：`/root/insight-lab-profile`

主要改动：

- `frontend/src/routes.tsx`
  - 新增 `CloudLabPage` 懒加载。
  - 新增路由：`/projects/cloud-lab`。

- `frontend/src/pages/ProjectManagementPage.tsx`
  - 顶部工具区新增 `云实验室` 按钮。
  - 按钮跳转到 `/projects/cloud-lab`。
  - 该文件在生产环境中当前是 untracked，修改时不要覆盖掉现有文件。

- `frontend/src/App.tsx`
  - `pageKeyForPath()` 中新增 `/projects/cloud-lab` 判断。
  - 保证心跳统计仍按 `cloud-lab` 处理，间隔为 20 秒。

- `frontend/src/api/auth.ts`
  - 补充 `browserLogin(identifier, passcode?)` API 封装。

- `frontend/src/hooks/useAuth.ts`
  - 补充 `browserLogin()` 导出。
  - 这是为了修复生产构建中 `LoginPage` 引用缺失的问题。

已撤销/没有保留的内容：

- 没有保留临时 Babylon.js 简化场景页。
- 没有保留 `@babylonjs/core` 依赖。
- 没有修改 `frontend/src/pages/CloudLabPage.tsx`。

## 部署方式

公网 `/projects` 实际由 Caddy 直接服务静态目录：

```bash
/var/www/project-management-approval
```

仓库构建产物目录：

```bash
/root/insight-lab-profile/frontend/dist
```

本次部署命令模式：

```bash
cd /root/insight-lab-profile/frontend
NODE_OPTIONS=--max-old-space-size=3072 npx vite build

backup=/var/www/project-management-approval.backup-$(date +%Y%m%d%H%M%S)
cp -a /var/www/project-management-approval "$backup"
rsync -a --delete /root/insight-lab-profile/frontend/dist/ /var/www/project-management-approval/
```

最近一次备份：

```bash
/var/www/project-management-approval.backup-20260701100537
```

回滚静态前端：

```bash
rsync -a --delete /var/www/project-management-approval.backup-20260701100537/ /var/www/project-management-approval/
```

不需要重启后端。Caddy 直接读取 `/var/www/project-management-approval`。

## 当前服务拓扑

主要进程：

- Caddy：公开 `:80`
- 静态项目管理系统：`/var/www/project-management-approval`
- 后端 API：`127.0.0.1:8080`
- 旧 SPA proxy：`/root/insight-lab-profile/scripts/spa_proxy.py --port 8081`

Caddy 关键配置在：

```bash
/etc/caddy/Caddyfile
```

其中 `/projects*`、`/tasks*`、`/login*` 都指向 `/var/www/project-management-approval`。

## 技术选型现状

当前线上版本仍使用原云实验室技术栈：

- React
- Three.js
- 现有 FastAPI 后端
- 现有飞书/群聊/成员/互动 API

原因：用户要求与实验室档案系统中的云实验室“建模、聊天记录、自由走动、互动”等效果一致。直接复用现有 `CloudLabPage` 是当前最稳的上线方式。

## 后续双线开发建议

建议保留两条线并行：

### A 线：现有 Three.js 线上稳定优化

目标：不改变用户看到的功能和效果，提升丝滑度。

优先项：

1. 减少 `/projects` 首页负担
   - 当前 `CloudLabPage` 和 `three-vendor` 是路由按需加载，首页不会预加载 Three.js。
   - 后续不要把 Three.js 或 Babylon.js 手动放进会被 `index.html` 预加载的 vendor chunk。

2. 优化 `CloudLabPage`
   - 拆分大组件。
   - 缓存材质、几何体、文字贴图。
   - 使用 instancing 合并重复人物/椅子/桌子元素。
   - 减少每帧状态计算，避免 React state 触发频繁重渲染。
   - 加入低配模式：减少阴影、粒子、文字标签、动画频率。

3. 群聊功能
   - 继续复用现有 `frontend/src/api/lab.ts`：
     - `listLabChatClusters`
     - `listLabCommonChats`
     - `sendLabMentionMessage`
     - `createLabInteraction`
   - 不要在前端直接改飞书状态。

### B 线：Babylon.js 实验版迁移

目标：做一个新实验路由，达到或超过现有效果后再切换。

建议新路由：

```bash
/projects/cloud-lab-babylon
```

不要直接替换 `/projects/cloud-lab`。

Babylon.js 实验版应先实现：

1. 第一人称/第三人称自由走动
2. 碰撞体和房间边界
3. 人员/群聊/互动数据接入
4. 聊天圆桌与聊天记录弹层
5. 移动端触控摇杆或拖拽移动
6. 低配设备自动降级
7. 性能面板和 FPS 采样

达到以下标准后再考虑替换线上：

- `/projects/cloud-lab-babylon` 功能覆盖原 `CloudLabPage`
- 群聊记录、互动、人员分配无缺失
- 4 核 4G 服务器构建稳定
- 中低端手机可用
- 首屏不卡死，场景进入有加载态

## 注意事项

- 生产环境工作区很脏，存在大量已有 modified/untracked 文件。不要执行 `git reset --hard` 或覆盖未知文件。
- `frontend/src/pages/ProjectManagementPage.tsx` 当前在生产环境中是 untracked，但公网正在使用它。
- 当前服务器 Node 是 `v18.19.1`，项目 `package.json` 写的是 `>=20.0.0`，安装依赖会出现 engine warning，但本次 `npx vite build` 可通过。
- `npm run build` 会先跑 `tsc`，生产代码里仍可能有历史类型问题；本次实际使用 `npx vite build` 完成静态构建。
- 不要修改 `https://vm-0-17-ubuntu.tail30ebf9.ts.net/cloud-lab` 的当前效果，除非用户明确要求。

## 验证命令

```bash
curl -I http://49.234.187.29/projects
curl -I http://49.234.187.29/projects/cloud-lab
grep -n "modulepreload" /var/www/project-management-approval/index.html
grep -R "projects/cloud-lab" -n /var/www/project-management-approval/assets/index-*.js | head
```

预期：

- `/projects/cloud-lab` 返回 `200 OK`
- `index.html` 不预加载 `three-vendor`
- `CloudLabPage` 和 `three-vendor` 作为路由依赖按需加载

